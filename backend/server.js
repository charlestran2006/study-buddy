require("dotenv").config();
let http = require("http");
let { WebSocketServer } = require("ws");
let app = require("./app");
let { pool } = require("./db");
let createGameManager = require("./game");

let port = process.env.PORT || 3000;
let hostname = "0.0.0.0";

let httpServer = http.createServer(app);
let wss = new WebSocketServer({ noServer: true });
let gameManager = createGameManager(pool);

httpServer.on("upgrade", (req, socket, head) => {
  app.sessionMiddleware(req, {}, () => {
    if (!req.session || !req.session.userId) {
      socket.destroy();
      return;
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
