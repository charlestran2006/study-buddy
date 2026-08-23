import { apiRequest, submitForm } from "./api.js";
import { setStudentDashboardMessage, escapeHtml, animateNumber } from "./dom.js";
import { registerLogoutCleanup, registerStudentDashboardLoader } from "./auth.js";
import { playSound } from "./sound.js";

let myClassroomList = document.getElementById("my-classroom-list");

registerStudentDashboardLoader(loadMyClassrooms);

async function loadMyClassrooms() {
  try {
    let classrooms = await apiRequest("/my-classrooms");
    renderMyClassrooms(classrooms);
  } catch (err) {
    setStudentDashboardMessage(err.message);
  }
}

function renderMyClassrooms(classrooms) {
  myClassroomList.innerHTML = "";

  if (classrooms.length === 0) {
    myClassroomList.innerHTML = '<li class="empty-state">You haven\'t joined any classrooms yet.</li>';
    return;
  }

  classrooms.forEach((classroom) => {
    let item = document.createElement("li");
    item.className = "classroom-item";
    item.innerHTML = `
      <div class="classroom-name">${escapeHtml(classroom.name)}</div>
      <div class="classroom-meta">Taught by ${escapeHtml(classroom.professor_username)}</div>
    `;
    myClassroomList.appendChild(item);
  });
}

document.getElementById("join-classroom-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    await submitForm("/classrooms/join", { code: form.code.value });
    form.reset();
    setStudentDashboardMessage("Joined classroom.", true);
    loadMyClassrooms();
  } catch (err) {
    setStudentDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

let gamePlayPanel = document.getElementById("player-game-live");
let gameStatus = document.getElementById("player-game-status");
let gameQuestionView = document.getElementById("player-question-view");
let gameTermEl = document.getElementById("player-question-term");
let gameChoices = document.getElementById("player-choices");
let gamePointsView = document.getElementById("player-points-view");
let gamePointsValue = document.getElementById("player-points-value");
let gamePointsReason = document.getElementById("player-points-reason");
let gamePointsTotalValue = document.getElementById("player-points-total-value");
let gameLeaderboardView = document.getElementById("player-leaderboard-view");
let gameLeaderboardList = document.getElementById("player-leaderboard-list");
let gamePodiumView = document.getElementById("player-podium-view");
let gamePodiumRestList = document.getElementById("player-podium-rest-list");

let socket = null;
let currentGameId = null;
let countdownInterval = null;
let revealTimer = null;
let answered = false;
let lastQuestionChoices = [];
let selectedChoiceIndex = null;
let manualClose = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let myLastScore = 0;
let lastScores = new Map();
let lastTickSecond = null;
let confettiFired = false;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1500;
const URGENT_SECONDS = 5;
const TICK_SECONDS = 3;

registerLogoutCleanup(() => {
  closeSocket();
  gamePlayPanel.classList.add("hidden");
  gamePointsView.classList.add("hidden");
  gamePodiumView.classList.add("hidden");
  myLastScore = 0;
  lastScores.clear();
  confettiFired = false;
});

function closeSocket() {
  manualClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  clearRevealTimer();
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}

function scheduleReconnect() {
  // The old connection's countdown/reveal timers are tied to a socket that no
  // longer exists and would otherwise keep ticking and overwrite the status
  // message below with stale text.
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  clearRevealTimer();

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    gameStatus.textContent = "Connection lost. Please refresh the page to reconnect.";
    return;
  }

  reconnectAttempts += 1;
  gameStatus.textContent = `Disconnected. Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(currentGameId);
  }, RECONNECT_DELAY_MS);
}

function clearRevealTimer() {
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function renderWsLeaderboard(players, listEl, skipTopN) {
  listEl = listEl || gameLeaderboardList;
  let skip = skipTopN || 0;
  let visible = players.slice(skip);
  listEl.innerHTML = "";

  if (visible.length === 0) {
    if (skip === 0) listEl.innerHTML = '<li class="empty-state">No players yet.</li>';
    return;
  }

  visible.forEach((player, i) => {
    let item = document.createElement("li");
    let scoreSpan = document.createElement("span");
    scoreSpan.className = "player-score-value";
    let previous = lastScores.has(player.id) ? lastScores.get(player.id) : 0;
    scoreSpan.textContent = previous;

    item.innerHTML = `<span><span class="rank">#${i + 1 + skip}</span>${escapeHtml(player.username)}</span> `;
    let scoreWrap = document.createElement("span");
    scoreWrap.appendChild(scoreSpan);
    scoreWrap.append(" pts");
    item.appendChild(scoreWrap);

    listEl.appendChild(item);
    animateNumber(scoreSpan, previous, player.score);
    lastScores.set(player.id, player.score);
  });
}

function renderPodium(players) {
  let top3 = players.slice(0, 3);
  let slots = [
    { name: document.getElementById("player-podium-1-name"), score: document.getElementById("player-podium-1-score") },
    { name: document.getElementById("player-podium-2-name"), score: document.getElementById("player-podium-2-score") },
    { name: document.getElementById("player-podium-3-name"), score: document.getElementById("player-podium-3-score") },
  ];

  slots.forEach((slot, i) => {
    let player = top3[i];
    if (!player) {
      slot.name.textContent = "";
      slot.score.textContent = "";
      return;
    }
    slot.name.textContent = player.username;
    let previous = lastScores.has(player.id) ? lastScores.get(player.id) : 0;
    slot.score.innerHTML = `<span class="podium-score-value"></span> pts`;
    animateNumber(slot.score.querySelector(".podium-score-value"), previous, player.score);
    lastScores.set(player.id, player.score);
  });

  renderWsLeaderboard(players, gamePodiumRestList, Math.min(3, players.length));

  gamePodiumView.classList.remove("hidden");
  if (!confettiFired) {
    confettiFired = true;
    if (typeof confetti === "function") {
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
    }
  }
}

function startCountdown(deadline) {
  if (countdownInterval) clearInterval(countdownInterval);
  lastTickSecond = null;

  let tick = () => {
    if (answered) return;
    let secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    gameStatus.textContent = `${secondsLeft}s left`;
    gameStatus.classList.toggle("timer-urgent", secondsLeft > 0 && secondsLeft <= URGENT_SECONDS);

    if (secondsLeft <= TICK_SECONDS && secondsLeft > 0 && secondsLeft !== lastTickSecond) {
      lastTickSecond = secondsLeft;
      playSound("tick");
    }
  };

  tick();
  countdownInterval = setInterval(tick, 250);
}

function submitAnswer(choiceIndex, button) {
  if (answered || !socket || socket.readyState !== WebSocket.OPEN) return;
  playSound("click");
  answered = true;
  selectedChoiceIndex = choiceIndex;

  Array.from(gameChoices.children).forEach((btn) => {
    btn.disabled = true;
  });
  button.classList.add("selected");

  socket.send(JSON.stringify({ type: "answer", choiceIndex }));
}

function renderPointsResult(message) {
  gamePointsValue.classList.remove("correct", "incorrect");

  if (message.correct) {
    gamePointsValue.textContent = `+${message.points_awarded} pts`;
    gamePointsValue.classList.add("correct");
    playSound("correct");
  } else {
    gamePointsValue.textContent = "Incorrect";
    gamePointsValue.classList.add("incorrect");
    playSound("incorrect");
  }

  gamePointsReason.textContent = message.reason;
  animateNumber(gamePointsTotalValue, myLastScore, message.total_score);
  myLastScore = message.total_score;
}

function renderChoices(choices) {
  gameChoices.innerHTML = "";
  answered = false;
  selectedChoiceIndex = null;

  choices.forEach((definition, index) => {
    let button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = definition;
    button.addEventListener("click", () => submitAnswer(index, button));
    gameChoices.appendChild(button);
  });
}

function renderRevealChoices(correctIndex) {
  gameChoices.innerHTML = "";

  lastQuestionChoices.forEach((definition, index) => {
    let button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = definition;
    button.disabled = true;

    if (index === correctIndex) {
      button.classList.add("correct");
    } else if (index === selectedChoiceIndex) {
      button.classList.add("incorrect");
    }

    gameChoices.appendChild(button);
  });
}

function handleMessage(event) {
  let message = JSON.parse(event.data);

  if (message.type === "room_state") {
    if (message.status === "waiting") {
      gameStatus.textContent = "Waiting for the professor to start...";
      gameQuestionView.classList.add("hidden");
      gamePointsView.classList.add("hidden");
      gameLeaderboardView.classList.add("hidden");
      gamePodiumView.classList.add("hidden");
    }
    return;
  }

  if (message.type === "question") {
    clearRevealTimer();
    gameLeaderboardView.classList.add("hidden");
    gamePointsView.classList.add("hidden");
    gamePodiumView.classList.add("hidden");
    gameQuestionView.classList.remove("hidden");
    gameTermEl.textContent = message.term;
    lastQuestionChoices = message.choices;
    renderChoices(message.choices);
    startCountdown(Date.now() + message.timeLimit);
    return;
  }

  if (message.type === "answer_ack") {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    gameStatus.textContent = "";
    gameQuestionView.classList.add("hidden");
    renderPointsResult(message);
    gamePointsView.classList.remove("hidden");
    return;
  }

  if (message.type === "reveal") {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    clearRevealTimer();
    answered = true;
    gameStatus.classList.remove("timer-urgent");
    gameStatus.textContent = "Answer revealed! Waiting for the professor to continue...";
    gamePointsView.classList.add("hidden");
    gameLeaderboardView.classList.add("hidden");
    gamePodiumView.classList.add("hidden");
    renderRevealChoices(message.correctIndex);
    gameQuestionView.classList.remove("hidden");

    let leaderboard = message.leaderboard;
    revealTimer = setTimeout(() => {
      revealTimer = null;
      gameQuestionView.classList.add("hidden");
      renderWsLeaderboard(leaderboard, gameLeaderboardList);
      gameLeaderboardView.classList.remove("hidden");
    }, 2500);
    return;
  }

  if (message.type === "game_over") {
    clearRevealTimer();
    gameQuestionView.classList.add("hidden");
    gamePointsView.classList.add("hidden");
    gameLeaderboardView.classList.add("hidden");
    gameStatus.textContent = "Game over!";
    renderPodium(message.leaderboard);
    return;
  }

  if (message.type === "error") {
    gameStatus.textContent = message.message;
  }
}

function connect(gameId) {
  closeSocket();
  manualClose = false;
  currentGameId = gameId;

  let protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/?gameId=${gameId}`);

  socket.addEventListener("open", () => {
    reconnectAttempts = 0;
  });
  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", () => {
    socket = null;
    if (!manualClose) scheduleReconnect();
  });
}

document.getElementById("join-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  playSound("click");
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let game = await submitForm("/games/join", { code: form.code.value });
    form.reset();
    gamePlayPanel.classList.remove("hidden");
    gameQuestionView.classList.add("hidden");
    gamePointsView.classList.add("hidden");
    gameLeaderboardView.classList.add("hidden");
    gamePodiumView.classList.add("hidden");
    gameStatus.textContent = "Joined! Waiting for the professor to start.";
    myLastScore = 0;
    lastScores.clear();
    confettiFired = false;
    connect(game.id);
  } catch (err) {
    setStudentDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});
