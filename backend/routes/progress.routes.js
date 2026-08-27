let express = require("express");
let { pool } = require("../db");
let { requireAuth } = require("../middleware/auth");

let router = express.Router();

router.post("/progress", requireAuth, async (req, res) => {
  let termId = req.body.term_id;
  let correct = Boolean(req.body.correct);

  if (!termId) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  try {
    let existing = await pool.query(
      "SELECT id, correct_count, incorrect_count FROM progress WHERE user_id = $1 AND term_id = $2",
      [req.session.userId, termId]
    );

    if (existing.rows.length === 0) {
      let correctCount = correct ? 1 : 0;
      let incorrectCount = correct ? 0 : 1;

      await pool.query(
        `INSERT INTO progress (user_id, term_id, correct_count, incorrect_count, mastered, last_reviewed)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [req.session.userId, termId, correctCount, incorrectCount, correctCount >= 3]
      );
    } else {
      let row = existing.rows[0];
      let correctCount = row.correct_count + (correct ? 1 : 0);
      let incorrectCount = row.incorrect_count + (correct ? 0 : 1);

      await pool.query(
        `UPDATE progress
         SET correct_count = $1, incorrect_count = $2, mastered = $3, last_reviewed = NOW()
         WHERE id = $4`,
        [correctCount, incorrectCount, correctCount >= 3, row.id]
      );
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

module.exports = router;
