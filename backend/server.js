require("dotenv").config();
let express = require("express");
let bcrypt = require("bcrypt");
let session = require("express-session");
let path = require("path");
let crypto = require("crypto");
let { pool } = require("./db");
const studyRoutes = require('./study_routes');

let app = express();
let port = process.env.PORT || 3000;
let hostname = "0.0.0.0";

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);
app.use(express.static(path.join(__dirname, "public")));
app.use('/api', studyRoutes);
app.get("/", (req, res) => {
  res.send("hello world");
});

app.post("/signup", (req, res) => {
  let username = req.body.username;
  let email = req.body.email;
  let password = req.body.password;
  let role = req.body.role;

  if (!username || !email || !password) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  if (role !== "student" && role !== "professor") {
    res.status(400).json({ error: "role must be 'student' or 'professor'" });
    return;
  }

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "something went wrong" });
      return;
    }

    pool.query(
      "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role",
      [username, email, hash, role],
      (err, result) => {
        if (err) {
          console.log(err);
          res.status(400).json({ error: "could not create user" });
          return;
        }

        res.status(200).json(result.rows[0]);
      }
    );
  });
});

app.post("/login", (req, res) => {
  let username = req.body.username;
  let password = req.body.password;

  if (!username || !password) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    "SELECT id, username, email, password_hash, role FROM users WHERE username = $1",
    [username],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(401).json({ error: "invalid username or password" });
        return;
      }

      let user = result.rows[0];

      bcrypt.compare(password, user.password_hash, (err, match) => {
        if (err) {
          console.log(err);
          res.status(500).json({ error: "something went wrong" });
          return;
        }

        if (!match) {
          res.status(401).json({ error: "invalid username or password" });
          return;
        }

        req.session.userId = user.id;
        req.session.role = user.role;
        res.status(200).json({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        });
      });
    }
  );
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "something went wrong" });
      return;
    }
    res.clearCookie("connect.sid");
    res.status(200).json({ ok: true });
  });
});

app.get("/me", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "not logged in" });
    return;
  }

  pool.query(
    "SELECT id, username, email, role FROM users WHERE id = $1",
    [req.session.userId],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(401).json({ error: "not logged in" });
        return;
      }

      res.status(200).json(result.rows[0]);
    }
  );
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    res.status(401).json({ error: "not logged in" });
    return;
  }
  next();
}

function requireProfessor(req, res, next) {
  if (req.session.role !== "professor") {
    res.status(403).json({ error: "professors only" });
    return;
  }
  next();
}

function requireStudent(req, res, next) {
  if (req.session.role !== "student") {
    res.status(403).json({ error: "students only" });
    return;
  }
  next();
}

function generateJoinCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

app.post("/classrooms", requireAuth, requireProfessor, (req, res) => {
  let name = req.body.name;

  if (!name) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  let joinCode = generateJoinCode();

  pool.query(
    "INSERT INTO classrooms (professor_id, name, join_code) VALUES ($1, $2, $3) RETURNING id, name, join_code, created_at",
    [req.session.userId, name, joinCode],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(400).json({ error: "could not create classroom" });
        return;
      }

      res.status(200).json(result.rows[0]);
    }
  );
});

app.get("/classrooms", requireAuth, requireProfessor, (req, res) => {
  pool.query(
    `SELECT c.id, c.name, c.join_code, c.created_at,
            COUNT(cs.id)::int AS student_count
     FROM classrooms c
     LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
     WHERE c.professor_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
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

app.get("/classrooms/:id", requireAuth, requireProfessor, (req, res) => {
  let classroomId = req.params.id;

  pool.query(
    "SELECT id, name, join_code, created_at FROM classrooms WHERE id = $1 AND professor_id = $2",
    [classroomId, req.session.userId],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(404).json({ error: "classroom not found" });
        return;
      }

      let classroom = result.rows[0];

      pool.query(
        `SELECT u.id, u.username, u.email, cs.joined_at
         FROM classroom_students cs
         JOIN users u ON u.id = cs.student_id
         WHERE cs.classroom_id = $1
         ORDER BY cs.joined_at ASC`,
        [classroomId],
        (err, studentsResult) => {
          if (err) {
            console.log(err);
            res.status(500).json({ error: "something went wrong" });
            return;
          }

          pool.query(
            `SELECT s.id, s.title, s.description, a.assigned_at
             FROM assignments a
             JOIN sets s ON s.id = a.set_id
             WHERE a.classroom_id = $1
             ORDER BY a.assigned_at DESC`,
            [classroomId],
            (err, setsResult) => {
              if (err) {
                console.log(err);
                res.status(500).json({ error: "something went wrong" });
                return;
              }

              res.status(200).json({
                ...classroom,
                students: studentsResult.rows,
                assigned_sets: setsResult.rows,
              });
            }
          );
        }
      );
    }
  );
});

app.post("/classrooms/join", requireAuth, requireStudent, (req, res) => {
  let code = req.body.code;

  if (!code) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    "SELECT id, name FROM classrooms WHERE join_code = $1",
    [code.toUpperCase()],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(404).json({ error: "invalid join code" });
        return;
      }

      let classroom = result.rows[0];

      pool.query(
        "INSERT INTO classroom_students (classroom_id, student_id) VALUES ($1, $2) RETURNING id",
        [classroom.id, req.session.userId],
        (err) => {
          if (err) {
            console.log(err);
            res.status(400).json({ error: "already joined this classroom" });
            return;
          }

          res.status(200).json(classroom);
        }
      );
    }
  );
});

app.get("/my-classrooms", requireAuth, requireStudent, (req, res) => {
  pool.query(
    `SELECT c.id, c.name, c.join_code, cs.joined_at, u.username AS professor_username
     FROM classroom_students cs
     JOIN classrooms c ON c.id = cs.classroom_id
     JOIN users u ON u.id = c.professor_id
     WHERE cs.student_id = $1
     ORDER BY cs.joined_at DESC`,
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

app.post("/sets", requireAuth, requireProfessor, (req, res) => {
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

app.get("/sets", requireAuth, requireProfessor, (req, res) => {
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

app.post("/assignments", requireAuth, requireProfessor, (req, res) => {
  let setId = req.body.set_id;
  let classroomId = req.body.classroom_id;

  if (!setId || !classroomId) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    "SELECT id FROM sets WHERE id = $1 AND user_id = $2",
    [setId, req.session.userId],
    (err, setResult) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (setResult.rows.length === 0) {
        res.status(404).json({ error: "study set not found" });
        return;
      }

      pool.query(
        "SELECT id FROM classrooms WHERE id = $1 AND professor_id = $2",
        [classroomId, req.session.userId],
        (err, classroomResult) => {
          if (err) {
            console.log(err);
            res.status(500).json({ error: "something went wrong" });
            return;
          }

          if (classroomResult.rows.length === 0) {
            res.status(404).json({ error: "classroom not found" });
            return;
          }

          pool.query(
            "INSERT INTO assignments (set_id, classroom_id) VALUES ($1, $2) RETURNING id, set_id, classroom_id, assigned_at",
            [setId, classroomId],
            (err, result) => {
              if (err) {
                console.log(err);
                res.status(400).json({ error: "already assigned to this classroom" });
                return;
              }

              res.status(200).json(result.rows[0]);
            }
          );
        }
      );
    }
  );
});

app.post("/games", requireAuth, requireProfessor, (req, res) => {
  let setId = req.body.set_id;

  if (!setId) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    `SELECT s.id, (SELECT COUNT(*) FROM terms WHERE set_id = s.id)::int AS term_count
     FROM sets s
     WHERE s.id = $1 AND s.user_id = $2`,
    [setId, req.session.userId],
    (err, setResult) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (setResult.rows.length === 0) {
        res.status(404).json({ error: "study set not found" });
        return;
      }

      if (setResult.rows[0].term_count < 2) {
        res.status(400).json({ error: "study set needs at least 2 terms to play as a game" });
        return;
      }

      let joinCode = generateJoinCode();

      pool.query(
        "INSERT INTO games (set_id, professor_id, join_code) VALUES ($1, $2, $3) RETURNING id, set_id, join_code, status, current_term_index, created_at",
        [setId, req.session.userId, joinCode],
        (err, result) => {
          if (err) {
            console.log(err);
            res.status(400).json({ error: "could not create game" });
            return;
          }

          res.status(200).json(result.rows[0]);
        }
      );
    }
  );
});

app.post("/games/join", requireAuth, requireStudent, (req, res) => {
  let code = req.body.code;

  if (!code) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    "SELECT id, status FROM games WHERE join_code = $1",
    [code.toUpperCase()],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(404).json({ error: "invalid join code" });
        return;
      }

      let game = result.rows[0];

      if (game.status !== "waiting") {
        res.status(400).json({ error: "game has already started" });
        return;
      }

      pool.query(
        "INSERT INTO game_players (game_id, student_id) VALUES ($1, $2) RETURNING id",
        [game.id, req.session.userId],
        (err) => {
          if (err) {
            console.log(err);
            res.status(400).json({ error: "already joined this game" });
            return;
          }

          res.status(200).json(game);
        }
      );
    }
  );
});

// Points per correct answer, plus a streak bonus that grows with consecutive
// correct answers (capped so one long streak can't dominate the leaderboard).
const BASE_POINTS = 100;
const STREAK_BONUS_PER_ANSWER = 20;
const STREAK_BONUS_CAP = 100;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Builds the multiple-choice options for a question: the correct term plus up
// to 3 distractors drawn from other terms in the same set (fewer if the set
// doesn't have enough terms), in random display order.
function buildChoices(correctTerm, allTerms) {
  let others = shuffle(allTerms.filter((t) => t.id !== correctTerm.id));
  let distractors = others.slice(0, Math.min(3, others.length));
  let choices = shuffle([correctTerm, ...distractors]);
  return choices.map((t) => ({ term_id: t.id, definition: t.definition }));
}

app.get("/games/:id", requireAuth, requireProfessor, async (req, res) => {
  let gameId = req.params.id;

  try {
    let gameResult = await pool.query(
      `SELECT g.id, g.set_id, g.join_code, g.status, g.current_term_index, g.current_term_id,
              g.current_choices, g.created_at,
              (SELECT COUNT(*) FROM terms WHERE set_id = g.set_id)::int AS total_terms
       FROM games g
       WHERE g.id = $1 AND g.professor_id = $2`,
      [gameId, req.session.userId]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    let game = gameResult.rows[0];

    let countResult = await pool.query(
      "SELECT COUNT(*)::int AS player_count FROM game_players WHERE game_id = $1",
      [gameId]
    );
    let playerCount = countResult.rows[0].player_count;

    let currentTerm = null;
    let answeredCount = 0;
    let correctCount = 0;

    if (game.current_term_id) {
      let termResult = await pool.query("SELECT id, term FROM terms WHERE id = $1", [game.current_term_id]);
      currentTerm = termResult.rows[0] || null;

      let tallyResult = await pool.query(
        `SELECT COUNT(*)::int AS answered_count, COUNT(*) FILTER (WHERE ga.is_correct)::int AS correct_count
         FROM game_answers ga
         JOIN game_players gp ON gp.id = ga.game_player_id
         WHERE gp.game_id = $1 AND ga.term_id = $2`,
        [gameId, game.current_term_id]
      );
      answeredCount = tallyResult.rows[0].answered_count;
      correctCount = tallyResult.rows[0].correct_count;
    }

    res.status(200).json({
      id: game.id,
      set_id: game.set_id,
      join_code: game.join_code,
      status: game.status,
      current_term_index: game.current_term_index,
      total_terms: game.total_terms,
      created_at: game.created_at,
      player_count: playerCount,
      current_term: currentTerm,
      choices: game.current_choices || null,
      answered_count: answeredCount,
      correct_count: correctCount,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

app.post("/games/:id/start", requireAuth, requireProfessor, async (req, res) => {
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

    let termsResult = await pool.query(
      "SELECT id, definition FROM terms WHERE set_id = $1 ORDER BY position",
      [game.set_id]
    );
    let firstTerm = termsResult.rows[0];
    let choices = buildChoices(firstTerm, termsResult.rows);

    let updateResult = await pool.query(
      `UPDATE games
       SET status = 'active', current_term_index = 0, current_term_id = $1, current_choices = $2
       WHERE id = $3
       RETURNING id, set_id, join_code, status, current_term_index, created_at`,
      [firstTerm.id, JSON.stringify(choices), gameId]
    );

    res.status(200).json(updateResult.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

// Professor-driven pacing (Kahoot-style): students never auto-advance each
// other. The professor calls this whenever they're ready to move on, whether
// or not everyone has answered yet.
app.post("/games/:id/next", requireAuth, requireProfessor, async (req, res) => {
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

    let termsResult = await pool.query(
      "SELECT id, definition FROM terms WHERE set_id = $1 ORDER BY position",
      [game.set_id]
    );
    let terms = termsResult.rows;
    let nextIndex = game.current_term_index + 1;

    if (nextIndex >= terms.length) {
      let updateResult = await pool.query(
        `UPDATE games
         SET status = 'finished', current_term_id = NULL, current_choices = NULL
         WHERE id = $1
         RETURNING id, set_id, join_code, status, current_term_index, created_at`,
        [gameId]
      );
      res.status(200).json(updateResult.rows[0]);
      return;
    }

    let nextTerm = terms[nextIndex];
    let choices = buildChoices(nextTerm, terms);

    let updateResult = await pool.query(
      `UPDATE games
       SET current_term_index = $1, current_term_id = $2, current_choices = $3
       WHERE id = $4
       RETURNING id, set_id, join_code, status, current_term_index, created_at`,
      [nextIndex, nextTerm.id, JSON.stringify(choices), gameId]
    );

    res.status(200).json(updateResult.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

app.post("/games/:id/answer", requireAuth, requireStudent, async (req, res) => {
  let gameId = req.params.id;
  let termId = req.body.term_id;
  let selectedTermId = req.body.selected_term_id;

  if (!termId || !selectedTermId) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  // Scoring touches games, game_players, and game_answers together and has to
  // stay correct when two students answer at the same time, so this route
  // uses a transaction with a row lock on the game instead of the callback
  // style used elsewhere in this file.
  let client;
  try {
    client = await pool.connect();
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

    if (game.status !== "active" || !game.current_term_id) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "game is not active" });
      return;
    }

    if (game.current_term_id !== Number(termId)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "the question has changed, please refresh" });
      return;
    }

    let playerResult = await client.query(
      "SELECT id, score, streak FROM game_players WHERE game_id = $1 AND student_id = $2",
      [gameId, req.session.userId]
    );

    if (playerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "you have not joined this game" });
      return;
    }

    let player = playerResult.rows[0];
    let isCorrect = Number(selectedTermId) === game.current_term_id;
    let newStreak = isCorrect ? player.streak + 1 : 0;
    let pointsAwarded = isCorrect
      ? BASE_POINTS + Math.min((newStreak - 1) * STREAK_BONUS_PER_ANSWER, STREAK_BONUS_CAP)
      : 0;

    let insertResult = await client.query(
      `INSERT INTO game_answers (game_player_id, term_id, selected_term_id, is_correct, points_awarded)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_player_id, term_id) DO NOTHING
       RETURNING id`,
      [player.id, game.current_term_id, selectedTermId, isCorrect, pointsAwarded]
    );

    if (insertResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "already answered this question" });
      return;
    }

    let newScore = player.score + pointsAwarded;

    await client.query(
      "UPDATE game_players SET score = $1, streak = $2 WHERE id = $3",
      [newScore, newStreak, player.id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      correct: isCorrect,
      correct_term_id: game.current_term_id,
      points_awarded: pointsAwarded,
      score: newScore,
      streak: newStreak,
    });
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.log(rollbackErr);
      }
    }
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  } finally {
    if (client) client.release();
  }
});

app.get("/games/:id/state", requireAuth, async (req, res) => {
  let gameId = req.params.id;

  try {
    let gameResult = await pool.query(
      `SELECT id, set_id, professor_id, status, current_term_index, current_term_id, current_choices
       FROM games WHERE id = $1`,
      [gameId]
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: "game not found" });
      return;
    }

    let game = gameResult.rows[0];
    let player = null;

    if (req.session.role === "professor") {
      if (game.professor_id !== req.session.userId) {
        res.status(403).json({ error: "not authorized for this game" });
        return;
      }
    } else {
      let playerResult = await pool.query(
        "SELECT id, score, streak FROM game_players WHERE game_id = $1 AND student_id = $2",
        [gameId, req.session.userId]
      );

      if (playerResult.rows.length === 0) {
        res.status(403).json({ error: "not authorized for this game" });
        return;
      }

      player = playerResult.rows[0];
    }

    if (game.status === "waiting") {
      res.status(200).json({
        id: game.id,
        status: game.status,
        score: player ? player.score : undefined,
        streak: player ? player.streak : undefined,
      });
      return;
    }

    let totalTermsResult = await pool.query(
      "SELECT COUNT(*)::int AS total_terms FROM terms WHERE set_id = $1",
      [game.set_id]
    );
    let totalTerms = totalTermsResult.rows[0].total_terms;

    let currentTerm = null;
    if (game.current_term_id) {
      let termResult = await pool.query("SELECT id, term FROM terms WHERE id = $1", [game.current_term_id]);
      currentTerm = termResult.rows[0] || null;
    }

    let base = {
      id: game.id,
      status: game.status,
      current_term_index: game.current_term_index,
      total_terms: totalTerms,
      current_term: currentTerm,
      choices: game.current_choices || null,
    };

    if (!player) {
      res.status(200).json(base);
      return;
    }

    let lastAnswer = null;
    if (game.current_term_id) {
      let answerResult = await pool.query(
        "SELECT selected_term_id, is_correct FROM game_answers WHERE game_player_id = $1 AND term_id = $2",
        [player.id, game.current_term_id]
      );

      if (answerResult.rows.length > 0) {
        lastAnswer = {
          selected_term_id: answerResult.rows[0].selected_term_id,
          correct_term_id: game.current_term_id,
          is_correct: answerResult.rows[0].is_correct,
        };
      }
    }

    res.status(200).json({
      ...base,
      score: player.score,
      streak: player.streak,
      answered: lastAnswer !== null,
      last_answer: lastAnswer,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

app.get("/games/:id/leaderboard", requireAuth, (req, res) => {
  let gameId = req.params.id;

  pool.query(
    "SELECT id, professor_id, status FROM games WHERE id = $1",
    [gameId],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(404).json({ error: "game not found" });
        return;
      }

      let game = result.rows[0];
      let isOwner = req.session.role === "professor" && game.professor_id === req.session.userId;

      function fetchLeaderboard(isPlayer) {
        if (!isOwner && !isPlayer) {
          res.status(403).json({ error: "not authorized for this game" });
          return;
        }

        pool.query(
          `SELECT u.username, gp.score, gp.streak
           FROM game_players gp
           JOIN users u ON u.id = gp.student_id
           WHERE gp.game_id = $1
           ORDER BY gp.score DESC, gp.joined_at ASC`,
          [gameId],
          (err, playersResult) => {
            if (err) {
              console.log(err);
              res.status(500).json({ error: "something went wrong" });
              return;
            }

            let ranked = playersResult.rows.map((row, i) => ({
              rank: i + 1,
              username: row.username,
              score: row.score,
              streak: row.streak,
            }));

            res.status(200).json({ game_id: game.id, status: game.status, players: ranked });
          }
        );
      }

      if (isOwner) {
        fetchLeaderboard(false);
        return;
      }

      if (req.session.role !== "student") {
        res.status(403).json({ error: "not authorized for this game" });
        return;
      }

      pool.query(
        "SELECT id FROM game_players WHERE game_id = $1 AND student_id = $2",
        [gameId, req.session.userId],
        (err, playerResult) => {
          if (err) {
            console.log(err);
            res.status(500).json({ error: "something went wrong" });
            return;
          }

          fetchLeaderboard(playerResult.rows.length > 0);
        }
      );
    }
  );
});

app.listen(port, hostname, () => {
  console.log(`http://${hostname}:${port}`);
});