import { submitForm } from "./api.js";
import { setDashboardMessage, escapeHtml, loadLeaderboard } from "./dom.js";
import { registerLogoutCleanup } from "./auth.js";

let hostGameForm = document.getElementById("host-game-form");
let hostGameLive = document.getElementById("host-game-live");
let hostGameStatus = document.getElementById("host-game-status");
let hostStartGameButton = document.getElementById("host-start-game-button");
let hostPlayerList = document.getElementById("host-player-list");
let hostQuestionView = document.getElementById("host-question-view");
let hostQuestionTerm = document.getElementById("host-question-term");
let hostQuestionMeta = document.getElementById("host-question-meta");
let hostLeaderboardView = document.getElementById("host-leaderboard-view");
let hostLeaderboardList = document.getElementById("host-leaderboard-list");
let hostEndGameButton = document.getElementById("host-end-game-button");

let socket = null;
let currentGameId = null;
let countdownInterval = null;

registerLogoutCleanup(() => {
  closeSocket();
  hostGameLive.classList.add("hidden");
});

function closeSocket() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}

function renderPlayerList(players) {
  hostPlayerList.innerHTML = "";

  if (players.length === 0) {
    hostPlayerList.innerHTML = '<li class="empty-state">No players yet.</li>';
    return;
  }

  players.forEach((player) => {
    let item = document.createElement("li");
    item.textContent = `${player.username} — ${player.score} pts`;
    hostPlayerList.appendChild(item);
  });

  hostGameStatus.textContent = `${players.length} player${players.length === 1 ? "" : "s"} currently viewing`;
}

function renderWsLeaderboard(players) {
  hostLeaderboardList.innerHTML = "";

  if (players.length === 0) {
    hostLeaderboardList.innerHTML = '<li class="empty-state">No players yet.</li>';
    return;
  }

  players.forEach((player, index) => {
    let item = document.createElement("li");
    item.innerHTML = `
      <span><span class="rank">#${index + 1}</span>${escapeHtml(player.username)}</span>
      <span>${player.score} pts</span>
    `;
    hostLeaderboardList.appendChild(item);
  });
}

function startCountdown(deadline) {
  if (countdownInterval) clearInterval(countdownInterval);

  let tick = () => {
    let secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    hostQuestionMeta.textContent = `${secondsLeft}s left`;
  };

  tick();
  countdownInterval = setInterval(tick, 250);
}

function handleMessage(event) {
  let message = JSON.parse(event.data);

  if (message.type === "room_state") {
    renderPlayerList(message.players);
    hostStartGameButton.classList.toggle("hidden", message.status !== "waiting");
    hostQuestionView.classList.toggle("hidden", message.status !== "in_progress");
    hostLeaderboardView.classList.toggle("hidden", message.status !== "finished");
    return;
  }

  if (message.type === "players_update") {
    renderPlayerList(message.players);
    return;
  }

  if (message.type === "question") {
    hostStartGameButton.classList.add("hidden");
    hostLeaderboardView.classList.add("hidden");
    hostQuestionView.classList.remove("hidden");
    hostQuestionTerm.textContent = message.term;
    startCountdown(Date.now() + message.timeLimit);
    return;
  }

  if (message.type === "reveal") {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    hostQuestionMeta.textContent = "Answer revealed — next question coming up...";
    renderWsLeaderboard(message.leaderboard);
    hostLeaderboardView.classList.remove("hidden");
    return;
  }

  if (message.type === "game_over") {
    hostQuestionView.classList.add("hidden");
    hostStartGameButton.classList.add("hidden");
    hostLeaderboardView.classList.remove("hidden");
    hostGameStatus.textContent = "Game over!";
    renderWsLeaderboard(message.leaderboard);
    if (currentGameId) loadLeaderboard(currentGameId, hostLeaderboardList);
    return;
  }

  if (message.type === "error") {
    setDashboardMessage(message.message);
  }
}

function connect(gameId) {
  closeSocket();
  currentGameId = gameId;

  let protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/?gameId=${gameId}`);

  hostStartGameButton.disabled = true;
  socket.addEventListener("open", () => {
    hostStartGameButton.disabled = false;
  });
  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", () => {
    socket = null;
  });
}

hostGameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let game = await submitForm("/games", {
      classroom_id: form.classroom_id.value,
      set_id: form.set_id.value,
    });
    hostGameLive.classList.remove("hidden");
    hostGameStatus.textContent = "Waiting for players to join...";
    hostQuestionView.classList.add("hidden");
    hostLeaderboardView.classList.add("hidden");
    setDashboardMessage(`Game created. Join code: ${game.join_code}`, true);
    connect(game.id);
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

hostStartGameButton.addEventListener("click", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  hostStartGameButton.disabled = true;
  socket.send(JSON.stringify({ type: "start_game" }));
  setTimeout(() => {
    hostStartGameButton.disabled = false;
  }, 1000);
});

hostEndGameButton.addEventListener("click", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "end_game" }));
});
