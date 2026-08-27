let express = require("express");
let { pool } = require("../db");
let { requireAuth, requireProfessor } = require("../middleware/auth");

let router = express.Router();

router.post("/sets", requireAuth, requireProfessor, (req, res) => {
  let title = req.body.title;
  let description = req.body.description || null;
  let terms = req.body.terms;
  let isPublic = Boolean(req.body.is_public);

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
    "INSERT INTO sets (user_id, title, description, is_public) VALUES ($1, $2, $3, $4) RETURNING id, title, description, is_public, created_at",
    [req.session.userId, title, description, isPublic],
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
    "SELECT id, title, description, is_public, created_at FROM sets WHERE user_id = $1 ORDER BY created_at DESC",
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
  let gameId = req.query.game_id;
  let classroomId = req.query.classroom_id;
  let studentId = req.query.student_id;

  try {
    let setResult = await pool.query(
      "SELECT id FROM sets WHERE id = $1 AND user_id = $2",
      [setId, req.session.userId]
    );

    if (setResult.rows.length === 0) {
      res.status(404).json({ error: "study set not found" });
      return;
    }

    let scopeConditions = ["g.set_id = $1"];
    let scopeValues = [setId];

    if (gameId) {
      scopeValues.push(gameId);
      scopeConditions.push(`g.id = $${scopeValues.length}`);
    }

    if (classroomId) {
      scopeValues.push(classroomId);
      scopeConditions.push(`g.classroom_id = $${scopeValues.length}`);
    }

    if (studentId) {
      scopeValues.push(studentId);
      scopeConditions.push(`gp.student_id = $${scopeValues.length}`);
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
         WHERE ${scopeConditions.join(" AND ")}
       )
       WHERE t.set_id = $1
       GROUP BY t.id, t.term
       ORDER BY t.position ASC`,
      scopeValues
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
router.get("/public-sets", requireAuth, async (req, res) => {
  try {
    let result = await pool.query(
      `SELECT s.id, s.title, s.description, s.created_at, u.username AS professor_username,
              COUNT(DISTINCT t.id)::int AS term_count,
              COUNT(f.id) > 0 AS is_favorited
       FROM sets s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN terms t ON t.set_id = s.id
       LEFT JOIN favorites f ON f.set_id = s.id AND f.user_id = $1
       WHERE s.is_public = TRUE
       GROUP BY s.id, u.username
       ORDER BY s.created_at DESC`,
      [req.session.userId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

router.get("/public-sets/:id", requireAuth, async (req, res) => {
  let setId = req.params.id;

  try {
    let setResult = await pool.query(
      `SELECT s.id, s.title, s.description, u.username AS professor_username
       FROM sets s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.is_public = TRUE`,
      [setId]
    );

    if (setResult.rows.length === 0) {
      res.status(404).json({ error: "study set not found" });
      return;
    }

    let termsResult = await pool.query(
      "SELECT id, term, definition, position FROM terms WHERE set_id = $1 ORDER BY position ASC",
      [setId]
    );

    res.status(200).json({ ...setResult.rows[0], terms: termsResult.rows });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

module.exports = router;
