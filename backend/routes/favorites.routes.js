let express = require("express");
let { pool } = require("../db");
let { requireAuth } = require("../middleware/auth");

let router = express.Router();

router.post("/favorites", requireAuth, async (req, res) => {
  let setId = req.body.set_id;

  if (!setId) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  try {
    let setResult = await pool.query("SELECT id FROM sets WHERE id = $1 AND is_public = TRUE", [setId]);

    if (setResult.rows.length === 0) {
      res.status(404).json({ error: "study set not found" });
      return;
    }

    let existing = await pool.query(
      "SELECT id FROM favorites WHERE user_id = $1 AND set_id = $2",
      [req.session.userId, setId]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        "INSERT INTO favorites (user_id, set_id) VALUES ($1, $2)",
        [req.session.userId, setId]
      );
    }

    res.status(200).json({ favorited: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

router.delete("/favorites/:setId", requireAuth, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM favorites WHERE user_id = $1 AND set_id = $2",
      [req.session.userId, req.params.setId]
    );

    res.status(200).json({ favorited: false });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

router.get("/favorites", requireAuth, async (req, res) => {
  try {
    let result = await pool.query(
      `SELECT s.id, s.title, s.description, u.username AS professor_username,
              COUNT(DISTINCT t.id)::int AS term_count,
              MAX(f.created_at) AS favorited_at
       FROM favorites f
       JOIN sets s ON s.id = f.set_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN terms t ON t.set_id = s.id
       WHERE f.user_id = $1 AND s.is_public = TRUE
       GROUP BY s.id, u.username
       ORDER BY favorited_at DESC`,
      [req.session.userId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

module.exports = router;
