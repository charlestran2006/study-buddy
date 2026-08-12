let express = require("express");
let { pool } = require("../db");
let { requireAuth, requireProfessor, requireStudent } = require("../middleware/auth");
let { generateJoinCode } = require("../utils/joinCode");

let router = express.Router();

const CORRECT_BASE_POINTS = 100;
const STREAK_BONUS_PER_STEP = 20;
const STREAK_BONUS_CAP = 100;
const MAX_CHOICES = 4;

function shuffle(array) {
  let result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildQuestion(terms, termIndex) {
  let correctTerm = terms[termIndex];
  let others = shuffle(terms.filter((t) => t.id !== correctTerm.id)).slice(0, MAX_CHOICES - 1);
  let choices = shuffle([correctTerm, ...others]).map((t) => ({
    term_id: t.id,
    definition: t.definition,
  }));

  return { termId: correctTerm.id, choices };
}

async function fetchGameTerms(setId) {
  let result = await pool.query(
    "SELECT id, term, definition FROM terms WHERE set_id = $1 ORDER BY position ASC",
    [setId]
  );
  return result.rows;
}

router.post("/games", requireAuth, requireProfessor, async (req, res) => {
  let setId = req.body.set_id;

  if (!setId) {
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
      "INSERT INTO games (set_id, professor_id, join_code) VALUES ($1, $2, $3) RETURNING id, set_id, join_code, status, current_term_index, created_at",
      [setId, req.session.userId, joinCode]
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
      "SELECT id, status FROM games WHERE join_code = $1",
      [code.toUpperCase()]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "invalid join code" });
      return;
    }

    let game = gameResult.rows[0];

    if (game.status !== "waiting") {
      res.status(400).json({ error: "game has already started" });
      return;
    }

    await pool.query(
      "INSERT INTO game_players (game_id, student_id) VALUES ($1, $2)",
      [game.id, req.session.userId]
    );

    res.status(200).json({ id: game.id, status: game.status });
  } catch (err) {
    if (err.code === "23505") {
      res.status(400).json({ error: "already joined this game" });
      return;
    }
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

router.post("/games/:id/start", requireAuth, requireProfessor, async (req, res) => {
  let gameId = req.params.id;

  try {
    let gameResult = await pool.query(
      "SELECT id, set_id, status FROM games WHERE id = $1 AND professor_id = $2",
      [gameId, req.session.userId]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    let game = gameResult.rows[0];

    if (game.status !== "waiting") {
      res.status(400).json({ error: "game has already started" });
      return;
    }

    let terms = await fetchGameTerms(game.set_id);
    let question = buildQuestion(terms, 0);

    let result = await pool.query(
      "UPDATE games SET status = 'active', current_term_index = 0, current_term_id = $1, current_choices = $2 WHERE id = $3 RETURNING id, set_id, join_code, status, current_term_index, created_at",
      [question.termId, JSON.stringify(question.choices), game.id]
    );

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

router.post("/games/:id/next", requireAuth, requireProfessor, async (req, res) => {
  let gameId = req.params.id;

  try {
    let gameResult = await pool.query(
      "SELECT id, set_id, status, current_term_index FROM games WHERE id = $1 AND professor_id = $2",
      [gameId, req.session.userId]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    let game = gameResult.rows[0];

    if (game.status !== "active") {
      res.status(400).json({ error: "game is not active" });
      return;
    }

    let terms = await fetchGameTerms(game.set_id);
    let nextIndex = game.current_term_index + 1;

    let result;

    if (nextIndex >= terms.length) {
      result = await pool.query(
        "UPDATE games SET status = 'finished', current_term_id = NULL, current_choices = NULL WHERE id = $1 RETURNING id, set_id, join_code, status, current_term_index, created_at",
        [game.id]
      );
    } else {
      let question = buildQuestion(terms, nextIndex);
      result = await pool.query(
        "UPDATE games SET current_term_index = $1, current_term_id = $2, current_choices = $3 WHERE id = $4 RETURNING id, set_id, join_code, status, current_term_index, created_at",
        [nextIndex, question.termId, JSON.stringify(question.choices), game.id]
      );
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

router.post("/games/:id/answer", requireAuth, requireStudent, async (req, res) => {
  let gameId = req.params.id;
  let termId = req.body.term_id;
  let selectedTermId = req.body.selected_term_id;

  if (!termId || !selectedTermId) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  let client = await pool.connect();

  try {
    await client.query("BEGIN");

    let gameResult = await client.query(
      "SELECT id, status, current_term_id FROM games WHERE id = $1 FOR UPDATE",
      [gameId]
    );

    if (gameResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "game not found" });
      return;
    }

    let game = gameResult.rows[0];

    if (game.status !== "active") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "game is not active" });
      return;
    }

    let playerResult = await client.query(
      "SELECT id, score, streak FROM game_players WHERE game_id = $1 AND student_id = $2",
      [game.id, req.session.userId]
    );

    if (playerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "you have not joined this game" });
      return;
    }

    let player = playerResult.rows[0];

    if (Number(termId) !== game.current_term_id) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "the question has changed, please refresh" });
      return;
    }

    let isCorrect = Number(selectedTermId) === Number(termId);
    let newStreak = isCorrect ? player.streak + 1 : 0;
    let bonus = isCorrect ? Math.min((newStreak - 1) * STREAK_BONUS_PER_STEP, STREAK_BONUS_CAP) : 0;
    let pointsAwarded = isCorrect ? CORRECT_BASE_POINTS + bonus : 0;

    try {
      await client.query(
        "INSERT INTO game_answers (game_player_id, term_id, selected_term_id, is_correct, points_awarded) VALUES ($1, $2, $3, $4, $5)",
        [player.id, termId, selectedTermId, isCorrect, pointsAwarded]
      );
    } catch (err) {
      if (err.code === "23505") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "already answered this question" });
        return;
      }
      throw err;
    }

    let updateResult = await client.query(
      "UPDATE game_players SET score = score + $1, streak = $2 WHERE id = $3 RETURNING score, streak",
      [pointsAwarded, newStreak, player.id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      correct: isCorrect,
      correct_term_id: game.current_term_id,
      points_awarded: pointsAwarded,
      score: updateResult.rows[0].score,
      streak: updateResult.rows[0].streak,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  } finally {
    client.release();
  }
});

router.get("/games/:id/state", requireAuth, async (req, res) => {
  let gameId = req.params.id;

  try {
    let gameResult = await pool.query(
      "SELECT id, set_id, professor_id, status, current_term_index, current_term_id, current_choices FROM games WHERE id = $1",
      [gameId]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    let game = gameResult.rows[0];
    let isProfessor = game.professor_id === req.session.userId;
    let player = null;

    if (!isProfessor) {
      let playerResult = await pool.query(
        "SELECT id, score, streak FROM game_players WHERE game_id = $1 AND student_id = $2",
        [game.id, req.session.userId]
      );

      if (playerResult.rows.length === 0) {
        res.status(403).json({ error: "not authorized for this game" });
        return;
      }

      player = playerResult.rows[0];
    }

    if (game.status === "waiting") {
      let body = { id: game.id, status: game.status };
      if (player) {
        body.score = player.score;
        body.streak = player.streak;
      }
      res.status(200).json(body);
      return;
    }

    let terms = await fetchGameTerms(game.set_id);
    let currentTerm = null;
    let choices = null;

    if (game.status === "active") {
      let term = terms.find((t) => t.id === game.current_term_id);
      currentTerm = term ? { id: term.id, term: term.term } : null;
      choices = game.current_choices;
    }

    let body = {
      id: game.id,
      status: game.status,
      current_term_index: game.current_term_index,
      total_terms: terms.length,
      current_term: currentTerm,
      choices,
    };

    if (player) {
      body.score = player.score;
      body.streak = player.streak;

      let answered = false;
      let lastAnswer = null;

      if (game.status === "active") {
        let answerResult = await pool.query(
          "SELECT selected_term_id, is_correct FROM game_answers WHERE game_player_id = $1 AND term_id = $2",
          [player.id, game.current_term_id]
        );

        if (answerResult.rows.length > 0) {
          answered = true;
          lastAnswer = {
            selected_term_id: answerResult.rows[0].selected_term_id,
            correct_term_id: game.current_term_id,
            is_correct: answerResult.rows[0].is_correct,
          };
        }
      }

      body.answered = answered;
      body.last_answer = lastAnswer;
    }

    res.status(200).json(body);
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
