require("dotenv").config();
let express = require("express");
let bcrypt = require("bcrypt");
let session = require("express-session");
let path = require("path");
let crypto = require("crypto");
let http = require("http");
let { WebSocketServer } = require("ws");
let { pool } = require("./db");
const studyRoutes = require('./study_routes');
const createGameManager = require("./game");

let port = process.env.PORT || 3000;
let hostname = "0.0.0.0";

app.use(express.json());
app.use(sessionMiddleware);
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

const GAME_TERM_SECONDS = 15;

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

function buildChoices(correctTerm, allTerms) {
  let others = shuffle(allTerms.filter((t) => t.id !== correctTerm.id));
  let distractors = others.slice(0, Math.min(3, others.length));
  let choices = shuffle([correctTerm, ...distractors]);
  return choices.map((t) => ({ term_id: t.id, definition: t.definition }));
}

app.post("/games", requireAuth, requireProfessor, (req, res) => {
  let classroomId = req.body.classroom_id;
  let setId = req.body.set_id;

  if (!classroomId || !setId) {
    res.status(400).json({ error: "missing fields" });
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
            "INSERT INTO games (classroom_id, set_id, professor_id, join_code) VALUES ($1, $2, $3, $4) RETURNING id, classroom_id, set_id, join_code, status, current_term_index, created_at",
            [classroomId, setId, req.session.userId, joinCode],
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
    "SELECT id, classroom_id, status FROM games WHERE join_code = $1",
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
        "SELECT id FROM classroom_students WHERE classroom_id = $1 AND student_id = $2",
        [game.classroom_id, req.session.userId],
        (err, enrolledResult) => {
          if (err) {
            console.log(err);
            res.status(500).json({ error: "something went wrong" });
            return;
          }

          if (enrolledResult.rows.length === 0) {
            res.status(403).json({ error: "not enrolled in this classroom" });
            return;
          }

          pool.query(
            "INSERT INTO game_players (game_id, student_id) VALUES ($1, $2) RETURNING id, game_id, score",
            [game.id, req.session.userId],
            (err, playerResult) => {
              if (err) {
                console.log(err);
                res.status(400).json({ error: "already joined this game" });
                return;
              }

              res.status(200).json({
                game_id: game.id,
                status: game.status,
                player: playerResult.rows[0],
              });
            }
          );
        }
      );
    }
  );
});

app.post("/games/:id/start", requireAuth, requireProfessor, (req, res) => {
  let gameId = req.params.id;

  pool.query(
    "UPDATE games SET status = 'active', current_term_index = 0, current_term_started_at = NOW() WHERE id = $1 AND professor_id = $2 RETURNING id, status, current_term_index, current_term_started_at",
    [gameId, req.session.userId],
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

      res.status(200).json(result.rows[0]);
    }
  );
});

app.get("/games/:id", requireAuth, (req, res) => {
  let gameId = req.params.id;

  pool.query(
    "SELECT * FROM games WHERE id = $1",
    [gameId],
    (err, gameResult) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (gameResult.rows.length === 0) {
        res.status(404).json({ error: "game not found" });
        return;
      }

      let game = gameResult.rows[0];

      function loadPlayersAndRespond(game) {
        pool.query(
          "SELECT gp.student_id, u.username, gp.score FROM game_players gp JOIN users u ON u.id = gp.student_id WHERE gp.game_id = $1 ORDER BY gp.score DESC",
          [game.id],
          (err, playersResult) => {
            if (err) {
              console.log(err);
              res.status(500).json({ error: "something went wrong" });
              return;
            }

            if (game.status !== "active") {
              res.status(200).json({
                id: game.id,
                status: game.status,
                current_term_index: game.current_term_index,
                current_term: null,
                time_remaining: null,
                players: playersResult.rows,
              });
              return;
            }

            pool.query(
              "SELECT term, definition FROM terms WHERE set_id = $1 AND position = $2",
              [game.set_id, game.current_term_index],
              (err, termResult) => {
                if (err) {
                  console.log(err);
                  res.status(500).json({ error: "something went wrong" });
                  return;
                }

                let elapsedMs = Date.now() - new Date(game.current_term_started_at).getTime();
                let timeRemaining = Math.max(0, GAME_TERM_SECONDS - Math.floor(elapsedMs / 1000));

                res.status(200).json({
                  id: game.id,
                  status: game.status,
                  current_term_index: game.current_term_index,
                  current_term: termResult.rows[0] || null,
                  time_remaining: timeRemaining,
                  players: playersResult.rows,
                });
              }
            );
          }
        );
      }

      function authorize(callback) {
        if (game.professor_id === req.session.userId) {
          callback();
          return;
        }

        pool.query(
          "SELECT id FROM game_players WHERE game_id = $1 AND student_id = $2",
          [game.id, req.session.userId],
          (err, playerResult) => {
            if (err) {
              console.log(err);
              res.status(500).json({ error: "something went wrong" });
              return;
            }

            if (playerResult.rows.length === 0) {
              res.status(403).json({ error: "not part of this game" });
              return;
            }

            callback();
          }
        );
      }

      authorize(() => {
        if (game.status !== "active") {
          loadPlayersAndRespond(game);
          return;
        }

        let elapsedMs = Date.now() - new Date(game.current_term_started_at).getTime();

        if (elapsedMs <= GAME_TERM_SECONDS * 1000) {
          loadPlayersAndRespond(game);
          return;
        }

        pool.query(
          "SELECT COUNT(*)::int AS count FROM terms WHERE set_id = $1",
          [game.set_id],
          (err, countResult) => {
            if (err) {
              console.log(err);
              res.status(500).json({ error: "something went wrong" });
              return;
            }

            let termCount = countResult.rows[0].count;
            let nextIndex = game.current_term_index + 1;

            if (nextIndex >= termCount) {
              pool.query(
                "UPDATE games SET status = 'finished' WHERE id = $1 RETURNING *",
                [game.id],
                (err, updateResult) => {
                  if (err) {
                    console.log(err);
                    res.status(500).json({ error: "something went wrong" });
                    return;
                  }

                  loadPlayersAndRespond(updateResult.rows[0]);
                }
              );
              return;
            }

            pool.query(
              "UPDATE games SET current_term_index = $1, current_term_started_at = NOW() WHERE id = $2 RETURNING *",
              [nextIndex, game.id],
              (err, updateResult) => {
                if (err) {
                  console.log(err);
                  res.status(500).json({ error: "something went wrong" });
                  return;
                }

                loadPlayersAndRespond(updateResult.rows[0]);
              }
            );
          }
        );
      });
    }
  );
});

app.post("/games/:id/answer", requireAuth, requireStudent, (req, res) => {
  let gameId = req.params.id;
  let answer = req.body.answer;

  if (!answer) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    "SELECT * FROM games WHERE id = $1",
    [gameId],
    (err, gameResult) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (gameResult.rows.length === 0) {
        res.status(404).json({ error: "game not found" });
        return;
      }

      let game = gameResult.rows[0];

      if (game.status !== "active") {
        res.status(400).json({ error: "game is not active" });
        return;
      }

      pool.query(
        "SELECT * FROM game_players WHERE game_id = $1 AND student_id = $2",
        [game.id, req.session.userId],
        (err, playerResult) => {
          if (err) {
            console.log(err);
            res.status(500).json({ error: "something went wrong" });
            return;
          }

          if (playerResult.rows.length === 0) {
            res.status(403).json({ error: "not part of this game" });
            return;
          }

          let player = playerResult.rows[0];

          if (player.last_answered_term_index === game.current_term_index) {
            res.status(400).json({ error: "already answered this term" });
            return;
          }

          pool.query(
            "SELECT definition FROM terms WHERE set_id = $1 AND position = $2",
            [game.set_id, game.current_term_index],
            (err, termResult) => {
              if (err) {
                console.log(err);
                res.status(500).json({ error: "something went wrong" });
                return;
              }

              if (termResult.rows.length === 0) {
                res.status(404).json({ error: "term not found" });
                return;
              }

              let correct =
                answer.trim().toLowerCase() ===
                termResult.rows[0].definition.trim().toLowerCase();

              pool.query(
                "UPDATE game_players SET last_answered_term_index = $1, score = score + $2 WHERE id = $3 RETURNING id, score",
                [game.current_term_index, correct ? 1 : 0, player.id],
                (err, updateResult) => {
                  if (err) {
                    console.log(err);
                    res.status(500).json({ error: "something went wrong" });
                    return;
                  }

                  res.status(200).json({
                    correct,
                    score: updateResult.rows[0].score,
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

app.post("/games/:id/end", requireAuth, requireProfessor, (req, res) => {
  let gameId = req.params.id;

  pool.query(
    "UPDATE games SET status = 'finished' WHERE id = $1 AND professor_id = $2 RETURNING id, status, professor_id",
    [gameId, req.session.userId],
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

httpServer.listen(port, hostname, () => {
  console.log(`http://${hostname}:${port}`);
});
