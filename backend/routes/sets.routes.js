let express = require("express");
let { pool } = require("../db");
let { requireAuth, requireProfessor } = require("../middleware/auth");

let router = express.Router();

router.post("/sets", requireAuth, requireProfessor, (req, res) => {
  let title = req.body.title;
  let description = req.body.description || null;
  let terms = req.body.terms;

  if (!title || !Array.isArray(terms) || terms.length === 0) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  for (let t of terms) {
    if (!t.term || !t.definition) {
      res.status(400).json({ error: "each term needs a term and definition" });
      return;
    }
  }

  pool.query(
    "INSERT INTO sets (user_id, title, description) VALUES ($1, $2, $3) RETURNING id, title, description, created_at",
    [req.session.userId, title, description],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(400).json({ error: "could not create study set" });
        return;
      }

      let set = result.rows[0];
      let values = [];
      let placeholders = [];

      terms.forEach((t, i) => {
        let base = i * 4;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        values.push(set.id, t.term, t.definition, i);
      });

      pool.query(
        `INSERT INTO terms (set_id, term, definition, position) VALUES ${placeholders.join(", ")}`,
        values,
        (err) => {
          if (err) {
            console.log(err);
            res.status(400).json({ error: "could not save terms" });
            return;
          }

          res.status(200).json({ ...set, terms });
        }
      );
    }
  );
});

router.get("/sets", requireAuth, requireProfessor, (req, res) => {
  pool.query(
    "SELECT id, title, description, created_at FROM sets WHERE user_id = $1 ORDER BY created_at DESC",
    [req.session.userId],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      res.status(200).json(result.rows);
    }
  );
});

router.get("/sets/:id/games", requireAuth, requireProfessor, async (req, res) => {
  let setId = req.params.id;

  try {
    let setResult = await pool.query(
      "SELECT id FROM sets WHERE id = $1 AND user_id = $2",
      [setId, req.session.userId]
    );

    if (setResult.rows.length === 0) {
      res.status(404).json({ error: "study set not found" });
      return;
    }

    let result = await pool.query(
      `SELECT g.id, g.classroom_id, c.name AS classroom_name, g.created_at, g.status,
              COUNT(gp.id)::int AS player_count
       FROM games g
       JOIN classrooms c ON c.id = g.classroom_id
       LEFT JOIN game_players gp ON gp.game_id = g.id
       WHERE g.set_id = $1
       GROUP BY g.id, g.classroom_id, c.name, g.created_at, g.status
       ORDER BY g.created_at DESC`,
      [setId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

module.exports = router;
