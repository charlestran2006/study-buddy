let express = require("express");
let { pool } = require("../db");
let { requireAuth, requireProfessor, requireStudent } = require("../middleware/auth");
let { generateJoinCode } = require("../utils/joinCode");

let router = express.Router();

async function fetchGameTerms(setId) {
  let result = await pool.query(
    "SELECT id, term, definition FROM terms WHERE set_id = $1 ORDER BY position ASC",
    [setId]
  );
  return result.rows;
}

router.post("/games", requireAuth, requireProfessor, async (req, res) => {
  let setId = req.body.set_id;
  let classroomId = req.body.classroom_id;

  if (!setId || !classroomId) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  try {
    let setResult = await pool.query(
      "SELECT id FROM sets WHERE id = $1 AND user_id = $2",
      [setId, req.session.userId]
    );

    if (setResult.rows.length === 0) {
      res.status(404).json({ error: "study set not found" });
      return;
    }

    let classroomResult = await pool.query(
      "SELECT id FROM classrooms WHERE id = $1 AND professor_id = $2",
      [classroomId, req.session.userId]
    );

    if (classroomResult.rows.length === 0) {
      res.status(404).json({ error: "classroom not found" });
      return;
    }

    let termCountResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM terms WHERE set_id = $1",
      [setId]
    );

    if (termCountResult.rows[0].count < 2) {
      res.status(400).json({ error: "study set needs at least 2 terms to play as a game" });
      return;
    }

    let joinCode = generateJoinCode();

    let result = await pool.query(
      "INSERT INTO games (set_id, classroom_id, professor_id, join_code) VALUES ($1, $2, $3, $4) RETURNING id, set_id, classroom_id, join_code, status, current_term_index, created_at",
      [setId, classroomId, req.session.userId, joinCode]
    );

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: "could not create game" });
  }
});

router.post("/games/join", requireAuth, requireStudent, async (req, res) => {
  let code = req.body.code;

  if (!code) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  try {
    let gameResult = await pool.query(
      "SELECT id, classroom_id, status FROM games WHERE join_code = $1",
      [code.trim().toUpperCase()]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "invalid join code" });
      return;
    }

    let game = gameResult.rows[0];

    if (game.status === "finished") {
      res.status(400).json({ error: "this game has already ended" });
      return;
    }

    let enrolledResult = await pool.query(
      "SELECT id FROM classroom_students WHERE classroom_id = $1 AND student_id = $2",
      [game.classroom_id, req.session.userId]
    );

    if (enrolledResult.rows.length === 0) {
      res.status(403).json({ error: "you are not enrolled in this classroom" });
      return;
    }

    res.status(200).json({ id: game.id, status: game.status });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

router.get("/games/:id", requireAuth, requireProfessor, async (req, res) => {
  let gameId = req.params.id;

  try {
    let gameResult = await pool.query(
      "SELECT id, set_id, join_code, status, current_term_index, current_term_id, current_choices, created_at FROM games WHERE id = $1 AND professor_id = $2",
      [gameId, req.session.userId]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    let game = gameResult.rows[0];
    let terms = await fetchGameTerms(game.set_id);

    let playerCountResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM game_players WHERE game_id = $1",
      [game.id]
    );

    let currentTerm = null;
    let choices = null;
    let answeredCount = 0;
    let correctCount = 0;

    if (game.status === "active") {
      let term = terms.find((t) => t.id === game.current_term_id);
      currentTerm = term ? { id: term.id, term: term.term } : null;
      choices = game.current_choices;

      let tallyResult = await pool.query(
        `SELECT COUNT(*)::int AS answered, COUNT(*) FILTER (WHERE ga.is_correct)::int AS correct
         FROM game_answers ga
         JOIN game_players gp ON gp.id = ga.game_player_id
         WHERE gp.game_id = $1 AND ga.term_id = $2`,
        [game.id, game.current_term_id]
      );

      answeredCount = tallyResult.rows[0].answered;
      correctCount = tallyResult.rows[0].correct;
    }

    res.status(200).json({
      id: game.id,
      set_id: game.set_id,
      join_code: game.join_code,
      status: game.status,
      current_term_index: game.current_term_index,
      created_at: game.created_at,
      total_terms: terms.length,
      player_count: playerCountResult.rows[0].count,
      current_term: currentTerm,
      choices,
      answered_count: answeredCount,
      correct_count: correctCount,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

router.get("/games/:id/leaderboard", requireAuth, async (req, res) => {
  let gameId = req.params.id;

  try {
    let gameResult = await pool.query(
      "SELECT id, professor_id, status FROM games WHERE id = $1",
      [gameId]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    let game = gameResult.rows[0];

    if (game.professor_id !== req.session.userId) {
      let playerResult = await pool.query(
        "SELECT id FROM game_players WHERE game_id = $1 AND student_id = $2",
        [game.id, req.session.userId]
      );

      if (playerResult.rows.length === 0) {
        res.status(403).json({ error: "not authorized for this game" });
        return;
      }
    }

    let playersResult = await pool.query(
      `SELECT u.username, gp.score, gp.streak
       FROM game_players gp
       JOIN users u ON u.id = gp.student_id
       WHERE gp.game_id = $1
       ORDER BY gp.score DESC, gp.joined_at ASC`,
      [game.id]
    );

    let players = playersResult.rows.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      score: row.score,
      streak: row.streak,
    }));

    res.status(200).json({ game_id: game.id, status: game.status, players });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

module.exports = router;
