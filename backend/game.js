let { URL } = require("url");

const QUESTION_TIME_MS = 15000;

function shuffle(arr) {
  let copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildQuestions(terms) {
  return shuffle(terms).map((term) => {
    let wrongPool = terms.filter((t) => t.id !== term.id);
    let wrongChoices = shuffle(wrongPool).slice(0, 3);

    let choices = shuffle([term, ...wrongChoices]).map((t) => ({
      termId: t.id,
      definition: t.definition,
    }));
    let correctIndex = choices.findIndex((c) => c.termId === term.id);

    return {
      termId: term.id,
      term: term.term,
      choices,
      correctIndex,
    };
  });
}

class GameRoom {
  constructor(gameId, classroomId, professorId, setId, pool) {
    this.gameId = gameId;
    this.classroomId = classroomId;
    this.professorId = professorId;
    this.setId = setId;
    this.pool = pool;
    this.hosts = new Set();
    this.players = new Map(); // userId -> { ws, username, score, dbId }
    this.status = "waiting"; // waiting | in_progress | finished
    this.questions = [];
    this.currentIndex = -1;
    this.answers = new Map(); // userId -> { choiceIndex, answeredAt }
    this.questionStartedAt = null;
    this.timer = null;
  }

  isEmpty() {
    return this.hosts.size === 0 && this.players.size === 0;
  }

  addHost(ws) {
    this.hosts.add(ws);
    ws.send(
      JSON.stringify({
        type: "room_state",
        status: this.status,
        players: this.playerList(),
      })
    );
    this.sendCurrentQuestion(ws);
  }

  async addPlayer(ws, user) {
    let dbId;
    let score;

    try {
      let result = await this.pool.query(
        `INSERT INTO game_players (game_id, student_id) VALUES ($1, $2)
         ON CONFLICT (game_id, student_id) DO UPDATE SET student_id = EXCLUDED.student_id
         RETURNING id, score`,
        [this.gameId, user.id]
      );
      dbId = result.rows[0].id;
      score = result.rows[0].score;
    } catch (err) {
      console.log(err);
      ws.close(1011, "could not join game");
      return;
    }

    this.players.set(user.id, { ws, username: user.username, score, dbId });
    ws.send(
      JSON.stringify({
        type: "room_state",
        status: this.status,
        players: this.playerList(),
      })
    );
    this.sendCurrentQuestion(ws);
    this.broadcastPlayers();
  }

  sendCurrentQuestion(ws) {
    if (this.status !== "in_progress") return;
    if (this.currentIndex < 0 || this.currentIndex >= this.questions.length) return;

    let question = this.questions[this.currentIndex];
    let remaining = Math.max(0, QUESTION_TIME_MS - (Date.now() - this.questionStartedAt));

    ws.send(
      JSON.stringify({
        type: "question",
        index: this.currentIndex,
        total: this.questions.length,
        term: question.term,
        choices: question.choices.map((c) => c.definition),
        timeLimit: remaining,
      })
    );
  }

  removeClient(ws) {
    this.hosts.delete(ws);
    for (let [userId, player] of this.players) {
      if (player.ws === ws) {
        this.players.delete(userId);
        break;
      }
    }
    this.broadcastPlayers();
  }

  playerList() {
    return Array.from(this.players.entries()).map(([userId, p]) => ({
      id: userId,
      username: p.username,
      score: p.score,
    }));
  }

  broadcast(message) {
    let payload = JSON.stringify(message);
    for (let ws of this.hosts) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
    for (let player of this.players.values()) {
      if (player.ws.readyState === player.ws.OPEN) player.ws.send(payload);
    }
  }

  broadcastPlayers() {
    this.broadcast({ type: "players_update", players: this.playerList() });
  }

  async startGame(terms) {
    if (this.status !== "waiting") return;

    if (terms.length < 2) {
      this.broadcast({ type: "error", message: "study set needs at least 2 terms" });
      return;
    }

    clearTimeout(this.timer);
    this.questions = buildQuestions(terms);
    this.currentIndex = -1;
    this.status = "in_progress";
    for (let player of this.players.values()) player.score = 0;

    try {
      await this.pool.query("UPDATE game_players SET score = 0, streak = 0 WHERE game_id = $1", [
        this.gameId,
      ]);
    } catch (err) {
      console.log(err);
    }

    await this.nextQuestion();
  }

  async nextQuestion() {
    clearTimeout(this.timer);
    this.currentIndex += 1;

    if (this.currentIndex >= this.questions.length) {
      await this.endGame();
      return;
    }

    this.answers = new Map();
    this.questionStartedAt = Date.now();
    let question = this.questions[this.currentIndex];

    try {
      await this.pool.query(
        "UPDATE games SET status = 'active', current_term_index = $1, current_term_id = $2, current_choices = $3 WHERE id = $4",
        [
          this.currentIndex,
          question.termId,
          JSON.stringify(question.choices.map((c) => c.definition)),
          this.gameId,
        ]
      );
    } catch (err) {
      console.log(err);
    }

    this.broadcast({
      type: "question",
      index: this.currentIndex,
      total: this.questions.length,
      term: question.term,
      choices: question.choices.map((c) => c.definition),
      timeLimit: QUESTION_TIME_MS,
    });

    this.timer = setTimeout(() => this.revealAnswer(), QUESTION_TIME_MS);
  }

  async handleAnswer(userId, choiceIndex) {
    if (this.status !== "in_progress") return;
    if (this.answers.has(userId)) return;
    if (this.currentIndex < 0 || this.currentIndex >= this.questions.length) return;

    let question = this.questions[this.currentIndex];
    let choice = question.choices[choiceIndex];
    if (!choice) return;

    let player = this.players.get(userId);
    if (!player) return;

    let answeredAt = Date.now();
    this.answers.set(userId, { choiceIndex, answeredAt });

    let isCorrect = choiceIndex === question.correctIndex;
    let elapsed = answeredAt - this.questionStartedAt;
    let remainingRatio = Math.max(0, 1 - elapsed / QUESTION_TIME_MS);
    let pointsAwarded = isCorrect ? Math.max(100, Math.round(1000 * remainingRatio)) : 0;

    if (isCorrect) player.score += pointsAwarded;

    let reason;
    if (!isCorrect) {
      reason = "Incorrect";
    } else if (remainingRatio >= 2 / 3) {
      reason = "Speed Bonus!";
    } else {
      reason = "Correct!";
    }

    player.ws.send(
      JSON.stringify({
        type: "answer_ack",
        correct: isCorrect,
        points_awarded: pointsAwarded,
        reason,
        total_score: player.score,
      })
    );

    try {
      await this.pool.query(
        "INSERT INTO game_answers (game_player_id, term_id, selected_term_id, is_correct, points_awarded) VALUES ($1, $2, $3, $4, $5)",
        [player.dbId, question.termId, choice.termId, isCorrect, pointsAwarded]
      );
      if (isCorrect) {
        await this.pool.query("UPDATE game_players SET score = $1 WHERE id = $2", [
          player.score,
          player.dbId,
        ]);
      }
    } catch (err) {
      console.log(err);
    }

    if (this.answers.size >= this.players.size && this.players.size > 0) {
      clearTimeout(this.timer);
      this.revealAnswer();
    }
  }

  revealAnswer() {
    if (this.currentIndex < 0 || this.currentIndex >= this.questions.length) return;
    let question = this.questions[this.currentIndex];

    this.broadcast({
      type: "reveal",
      correctIndex: question.correctIndex,
      leaderboard: this.playerList().sort((a, b) => b.score - a.score),
    });
  }

  async endGame() {
    clearTimeout(this.timer);
    this.status = "finished";

    try {
      await this.pool.query(
        "UPDATE games SET status = 'finished', current_term_id = NULL, current_choices = NULL WHERE id = $1",
        [this.gameId]
      );
    } catch (err) {
      console.log(err);
    }

    this.broadcast({
      type: "game_over",
      leaderboard: this.playerList().sort((a, b) => b.score - a.score),
    });
  }
}

function createGameManager(pool) {
  let rooms = new Map(); // gameId -> GameRoom

  function getRoom(game) {
    let room = rooms.get(game.id);
    if (!room) {
      room = new GameRoom(game.id, game.classroom_id, game.professor_id, game.set_id, pool);
      rooms.set(game.id, room);
    }
    return room;
  }

  function cleanupRoom(gameId) {
    let room = rooms.get(gameId);
    if (room && room.isEmpty()) {
      clearTimeout(room.timer);
      rooms.delete(gameId);
    }
  }

  async function handleConnection(ws, req) {
    let url = new URL(req.url, "http://localhost");
    let gameId = Number(url.searchParams.get("gameId"));
    let userId = req.session.userId;
    let role = req.session.role;

    if (!gameId) {
      ws.close(1008, "missing gameId");
      return;
    }

    try {
      let gameResult = await pool.query(
        "SELECT id, classroom_id, professor_id, set_id, status FROM games WHERE id = $1",
        [gameId]
      );

      if (gameResult.rows.length === 0) {
        ws.close(1008, "game not found");
        return;
      }

      let game = gameResult.rows[0];

      if (role === "professor") {
        if (game.professor_id !== userId) {
          ws.close(1008, "not authorized for this game");
          return;
        }

        let room = getRoom(game);
        room.addHost(ws);

        ws.on("message", (data) => onHostMessage(room, ws, data));
        ws.on("close", () => {
          room.removeClient(ws);
          cleanupRoom(gameId);
        });
      } else {
        let enrolledResult = await pool.query(
          "SELECT u.username FROM classroom_students cs JOIN users u ON u.id = cs.student_id WHERE cs.classroom_id = $1 AND cs.student_id = $2",
          [game.classroom_id, userId]
        );

        if (enrolledResult.rows.length === 0) {
          ws.close(1008, "not enrolled in this classroom");
          return;
        }

        let room = getRoom(game);
        await room.addPlayer(ws, { id: userId, username: enrolledResult.rows[0].username });

        ws.on("message", (data) => onPlayerMessage(room, userId, data));
        ws.on("close", () => {
          room.removeClient(ws);
          cleanupRoom(gameId);
        });
      }
    } catch (err) {
      console.log(err);
      ws.close(1011, "server error");
    }
  }

  async function onHostMessage(room, ws, data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (message.type === "start_game") {
      if (room.status !== "waiting") return;

      try {
        let result = await pool.query(
          "SELECT id, term, definition FROM terms WHERE set_id = $1 ORDER BY position ASC",
          [room.setId]
        );
        await room.startGame(result.rows);
      } catch (err) {
        console.log(err);
        ws.send(JSON.stringify({ type: "error", message: "could not load study set" }));
      }
    } else if (message.type === "end_game") {
      room.endGame();
    } else if (message.type === "next_question") {
      room.nextQuestion();
    }
  }

  function onPlayerMessage(room, userId, data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (message.type === "answer" && typeof message.choiceIndex === "number") {
      room.handleAnswer(userId, message.choiceIndex);
    }
  }

  return { handleConnection };
}

module.exports = createGameManager;
