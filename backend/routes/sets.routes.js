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

router.get("/sets/:id/heatmap", requireAuth, requireProfessor, async (req, res) => {
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
      `SELECT t.id AS term_id, t.term,
              COUNT(ga.id)::int AS attempts,
              COUNT(*) FILTER (WHERE ga.is_correct)::int AS correct
       FROM terms t
       LEFT JOIN game_answers ga ON ga.term_id = t.id AND ga.game_player_id IN (
         SELECT gp.id
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         WHERE g.set_id = $1
       )
       WHERE t.set_id = $1
       GROUP BY t.id, t.term
       ORDER BY t.position ASC`,
      [setId]
    );

    let heatmap = result.rows.map((row) => {
      let attempts = row.attempts;
      let correct = row.correct;
      let accuracyPct = attempts > 0 ? Math.round((correct / attempts) * 1000) / 10 : null;

      return { term: row.term, attempts, correct, accuracy_pct: accuracyPct };
    });

    heatmap.sort((a, b) => {
      if (a.accuracy_pct === null && b.accuracy_pct === null) return 0;
      if (a.accuracy_pct === null) return 1;
      if (b.accuracy_pct === null) return -1;
      return a.accuracy_pct - b.accuracy_pct;
    });

    res.status(200).json(heatmap);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

module.exports = router;
