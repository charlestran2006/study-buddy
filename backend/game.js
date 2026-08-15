let { URL } = require("url");

const QUESTION_TIME_MS = 15000;
const REVEAL_TIME_MS = 4000;

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
    let wrongChoices = shuffle(wrongPool)
      .slice(0, 3)
      .map((t) => t.definition);

    let choices = shuffle([term.definition, ...wrongChoices]);
    let correctIndex = choices.indexOf(term.definition);

    return {
      termId: term.id,
      term: term.term,
      choices,
      correctIndex,
    };
  });
}

class GameRoom {
  constructor(classroomId, professorId) {
    this.classroomId = classroomId;
    this.professorId = professorId;
    this.hosts = new Set();
    this.players = new Map(); // userId -> { ws, username, score }
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
  }

  addPlayer(ws, user) {
    this.players.set(user.id, { ws, username: user.username, score: 0 });
    ws.send(
      JSON.stringify({
        type: "room_state",
        status: this.status,
        players: this.playerList(),
      })
    );
    this.broadcastPlayers();
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

  startGame(terms) {
    if (terms.length < 2) {
      this.broadcast({ type: "error", message: "study set needs at least 2 terms" });
      return;
    }

    clearTimeout(this.timer);
    this.questions = buildQuestions(terms);
    this.currentIndex = -1;
    this.status = "in_progress";
    for (let player of this.players.values()) player.score = 0;

    this.nextQuestion();
  }

  nextQuestion() {
    clearTimeout(this.timer);
    this.currentIndex += 1;

    if (this.currentIndex >= this.questions.length) {
      this.endGame();
      return;
    }

    this.answers = new Map();
    this.questionStartedAt = Date.now();
    let question = this.questions[this.currentIndex];

    this.broadcast({
      type: "question",
      index: this.currentIndex,
      total: this.questions.length,
      term: question.term,
      choices: question.choices,
      timeLimit: QUESTION_TIME_MS,
    });

    this.timer = setTimeout(() => this.revealAnswer(), QUESTION_TIME_MS);
  }

  handleAnswer(userId, choiceIndex) {
    if (this.status !== "in_progress") return;
    if (this.answers.has(userId)) return;
    if (this.currentIndex < 0 || this.currentIndex >= this.questions.length) return;

    this.answers.set(userId, { choiceIndex, answeredAt: Date.now() });

    let player = this.players.get(userId);
    if (player) {
      player.ws.send(JSON.stringify({ type: "answer_ack" }));
    }

    if (this.answers.size >= this.players.size && this.players.size > 0) {
      clearTimeout(this.timer);
      this.revealAnswer();
    }
  }

  revealAnswer() {
    if (this.currentIndex < 0 || this.currentIndex >= this.questions.length) return;
    let question = this.questions[this.currentIndex];

    for (let [userId, answer] of this.answers) {
      let player = this.players.get(userId);
      if (!player) continue;

      if (answer.choiceIndex === question.correctIndex) {
        let elapsed = answer.answeredAt - this.questionStartedAt;
        let remainingRatio = Math.max(0, 1 - elapsed / QUESTION_TIME_MS);
        player.score += Math.max(100, Math.round(1000 * remainingRatio));
      }
    }

    this.broadcast({
      type: "reveal",
      correctIndex: question.correctIndex,
      leaderboard: this.playerList().sort((a, b) => b.score - a.score),
    });

    this.timer = setTimeout(() => this.nextQuestion(), REVEAL_TIME_MS);
  }

  endGame() {
    clearTimeout(this.timer);
    this.status = "finished";
    this.broadcast({
      type: "game_over",
      leaderboard: this.playerList().sort((a, b) => b.score - a.score),
    });
  }
}

function createGameManager(pool) {
  let rooms = new Map(); // classroomId -> GameRoom

  function getRoom(classroomId, professorId) {
    let room = rooms.get(classroomId);
    if (!room) {
      room = new GameRoom(classroomId, professorId);
      rooms.set(classroomId, room);
    }
    return room;
  }

  function cleanupRoom(classroomId) {
    let room = rooms.get(classroomId);
    if (room && room.isEmpty()) {
      clearTimeout(room.timer);
      rooms.delete(classroomId);
    }
  }

  function handleConnection(ws, req) {
    let url = new URL(req.url, "http://localhost");
    let classroomId = Number(url.searchParams.get("classroomId"));
    let userId = req.session.userId;
    let role = req.session.role;

    if (!classroomId) {
      ws.close(1008, "missing classroomId");
      return;
    }

    if (role === "professor") {
      pool.query(
        "SELECT id FROM classrooms WHERE id = $1 AND professor_id = $2",
        [classroomId, userId],
        (err, result) => {
          if (err || result.rows.length === 0) {
            ws.close(1008, "not authorized for this classroom");
            return;
          }

          let room = getRoom(classroomId, userId);
          room.addHost(ws);

          ws.on("message", (data) => onHostMessage(room, ws, data));
          ws.on("close", () => {
            room.removeClient(ws);
            cleanupRoom(classroomId);
          });
        }
      );
    } else {
      pool.query(
        "SELECT u.id, u.username FROM classroom_students cs JOIN users u ON u.id = cs.student_id WHERE cs.classroom_id = $1 AND cs.student_id = $2",
        [classroomId, userId],
        (err, result) => {
          if (err || result.rows.length === 0) {
            ws.close(1008, "not enrolled in this classroom");
            return;
          }

          let user = result.rows[0];
          let room = getRoom(classroomId, null);
          room.addPlayer(ws, user);

          ws.on("message", (data) => onPlayerMessage(room, userId, data));
          ws.on("close", () => {
            room.removeClient(ws);
            cleanupRoom(classroomId);
          });
        }
      );
    }
  }

  function onHostMessage(room, ws, data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (message.type === "start_game") {
      pool.query(
        "SELECT id, term, definition FROM terms WHERE set_id = $1 ORDER BY position ASC",
        [message.setId],
        (err, result) => {
          if (err) {
            ws.send(JSON.stringify({ type: "error", message: "could not load study set" }));
            return;
          }
          room.startGame(result.rows);
        }
      );
    } else if (message.type === "end_game") {
      room.endGame();
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
