import { apiRequest, submitForm } from "./api.js";
import { setStudentDashboardMessage, escapeHtml, loadLeaderboard } from "./dom.js";
import { registerLogoutCleanup, registerStudentDashboardLoader } from "./auth.js";

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
let gamePointsTotal = document.getElementById("player-points-total");
let gameLeaderboardView = document.getElementById("player-leaderboard-view");
let gameLeaderboardList = document.getElementById("player-leaderboard-list");

let socket = null;
let currentGameId = null;
let countdownInterval = null;
let revealTimer = null;
let answered = false;
let lastQuestionChoices = [];
let selectedChoiceIndex = null;

registerLogoutCleanup(() => {
  closeSocket();
  gamePlayPanel.classList.add("hidden");
  gamePointsView.classList.add("hidden");
});

function closeSocket() {
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

function clearRevealTimer() {
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function renderWsLeaderboard(players) {
  gameLeaderboardList.innerHTML = "";

  if (players.length === 0) {
    gameLeaderboardList.innerHTML = '<li class="empty-state">No players yet.</li>';
    return;
  }

  players.forEach((player, index) => {
    let item = document.createElement("li");
    item.innerHTML = `
      <span><span class="rank">#${index + 1}</span>${escapeHtml(player.username)}</span>
      <span>${player.score} pts</span>
    `;
    gameLeaderboardList.appendChild(item);
  });
}

function startCountdown(deadline) {
  if (countdownInterval) clearInterval(countdownInterval);

  let tick = () => {
    if (answered) return;
    let secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    gameStatus.textContent = `${secondsLeft}s left`;
  };

  tick();
  countdownInterval = setInterval(tick, 250);
}

function submitAnswer(choiceIndex, button) {
  if (answered || !socket || socket.readyState !== WebSocket.OPEN) return;
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
  } else {
    gamePointsValue.textContent = "Incorrect";
    gamePointsValue.classList.add("incorrect");
  }

  gamePointsReason.textContent = message.reason;
  gamePointsTotal.textContent = `Total score: ${message.total_score}`;
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
    }
    return;
  }

  if (message.type === "question") {
    clearRevealTimer();
    gameLeaderboardView.classList.add("hidden");
    gamePointsView.classList.add("hidden");
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
    gameStatus.textContent = "Answer revealed! Waiting for the professor to continue...";
    gamePointsView.classList.add("hidden");
    gameLeaderboardView.classList.add("hidden");
    renderRevealChoices(message.correctIndex);
    gameQuestionView.classList.remove("hidden");

    let leaderboard = message.leaderboard;
    revealTimer = setTimeout(() => {
      revealTimer = null;
      gameQuestionView.classList.add("hidden");
      renderWsLeaderboard(leaderboard);
      gameLeaderboardView.classList.remove("hidden");
    }, 2500);
    return;
  }

  if (message.type === "game_over") {
    clearRevealTimer();
    gameQuestionView.classList.add("hidden");
    gamePointsView.classList.add("hidden");
    gameLeaderboardView.classList.remove("hidden");
    gameStatus.textContent = "Game over!";
    renderWsLeaderboard(message.leaderboard);
    if (currentGameId) loadLeaderboard(currentGameId, gameLeaderboardList);
    return;
  }

  if (message.type === "error") {
    gameStatus.textContent = message.message;
  }
}

function connect(gameId) {
  closeSocket();
  currentGameId = gameId;

  let protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/?gameId=${gameId}`);

  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", () => {
    socket = null;
  });
}

document.getElementById("join-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
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
    gameStatus.textContent = "Joined! Waiting for the professor to start.";
    connect(game.id);
  } catch (err) {
    setStudentDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});
