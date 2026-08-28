import { submitForm } from "./api.js";
import { setDashboardMessage, escapeHtml, animateNumber, playEntrance } from "./dom.js";
import { registerLogoutCleanup } from "./auth.js";
import { openAnalytics } from "./analytics.js";
import { playSound } from "./sound.js";

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
let hostNextQuestionButton = document.getElementById("host-next-question-button");
let hostEndGameButton = document.getElementById("host-end-game-button");
let hostViewAnalyticsButton = document.getElementById("host-view-analytics-button");
let hostPodiumView = document.getElementById("host-podium-view");
let hostPodiumRestList = document.getElementById("host-podium-rest-list");

let socket = null;
let currentGameId = null;
let currentSetId = null;
let currentSetTitle = null;
let countdownInterval = null;
let manualClose = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let lastScores = new Map();
let lastTickSecond = null;
let confettiFired = false;
let lastRenderedQuestionIndex = null;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1500;
const URGENT_SECONDS = 5;
const TICK_SECONDS = 3;
const LEADERBOARD_ROW_STAGGER_MS = 70;
const MAX_STAGGERED_ROWS = 6;
const PODIUM_FIRST_DELAY_MS = 2000;

registerLogoutCleanup(() => {
  closeSocket();
  hostGameLive.classList.add("hidden");
  hostViewAnalyticsButton.classList.add("hidden");
  hostNextQuestionButton.classList.add("hidden");
  hostPodiumView.classList.add("hidden");
  currentSetId = null;
  currentSetTitle = null;
  lastScores.clear();
  confettiFired = false;
  lastRenderedQuestionIndex = null;
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
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}

function scheduleReconnect() {
  // The old connection's countdown timer is tied to a socket that no longer
  // exists and would otherwise keep ticking and overwrite the status message
  // below with a stale "Xs left" every 250ms.
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    hostGameStatus.textContent = "Connection lost. Please refresh the page to reconnect.";
    return;
  }

  reconnectAttempts += 1;
  hostGameStatus.textContent = `Disconnected. Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(currentGameId);
  }, RECONNECT_DELAY_MS);
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

function renderWsLeaderboard(players, listEl, skipTopN) {
  listEl = listEl || hostLeaderboardList;
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
    let staggerDelay = Math.min(i, MAX_STAGGERED_ROWS) * LEADERBOARD_ROW_STAGGER_MS;
    playEntrance(item, ["animate__fadeInUp", "animate__faster"], staggerDelay);
    animateNumber(scoreSpan, previous, player.score);
    lastScores.set(player.id, player.score);
  });
}

function renderPodium(players) {
  let top3 = players.slice(0, 3);
  let podiumSlots = [
    {
      el: document.querySelector("#host-podium-view .podium-first"),
      name: document.getElementById("host-podium-1-name"),
      score: document.getElementById("host-podium-1-score"),
      anim: ["animate__bounceIn"],
      delay: PODIUM_FIRST_DELAY_MS,
    },
    {
      el: document.querySelector("#host-podium-view .podium-second"),
      name: document.getElementById("host-podium-2-name"),
      score: document.getElementById("host-podium-2-score"),
      anim: ["animate__fadeInUp", "animate__faster"],
      delay: 1000,
    },
    {
      el: document.querySelector("#host-podium-view .podium-third"),
      name: document.getElementById("host-podium-3-name"),
      score: document.getElementById("host-podium-3-score"),
      anim: ["animate__fadeInUp", "animate__faster"],
      delay: 0,
    },
  ];

  // Unhide the podium container BEFORE touching any slot's animation classes:
  // playEntrance()'s remove-reflow-readd cycle only resets a replayed
  // animation correctly on an element that's actually laid out, not one
  // still sitting inside a display:none ancestor.
  hostPodiumView.classList.remove("hidden");

  podiumSlots.forEach((slot, i) => {
    let player = top3[i];
    if (!player) {
      slot.name.textContent = "";
      slot.score.textContent = "";
      slot.el.classList.add("hidden");
      return;
    }
    slot.el.classList.remove("hidden");
    slot.name.textContent = player.username;
    let previous = lastScores.has(player.id) ? lastScores.get(player.id) : 0;
    slot.score.innerHTML = `<span class="podium-score-value"></span> pts`;
    animateNumber(slot.score.querySelector(".podium-score-value"), previous, player.score);
    lastScores.set(player.id, player.score);
    playEntrance(slot.el, slot.anim, slot.delay);
  });

  renderWsLeaderboard(players, hostPodiumRestList, Math.min(3, players.length));

  if (!confettiFired) {
    confettiFired = true;
    setTimeout(() => {
      if (typeof confetti === "function") {
        confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
      }
    }, PODIUM_FIRST_DELAY_MS);
  }
}

function startCountdown(deadline) {
  if (countdownInterval) clearInterval(countdownInterval);
  lastTickSecond = null;

  let tick = () => {
    let secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    hostQuestionMeta.textContent = `${secondsLeft}s left`;
    hostQuestionMeta.classList.toggle("timer-urgent", secondsLeft > 0 && secondsLeft <= URGENT_SECONDS);

    if (secondsLeft <= TICK_SECONDS && secondsLeft > 0 && secondsLeft !== lastTickSecond) {
      lastTickSecond = secondsLeft;
      playSound("tick");
    }
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
    hostNextQuestionButton.classList.add("hidden");
    hostPodiumView.classList.add("hidden");
    return;
  }

  if (message.type === "players_update") {
    renderPlayerList(message.players);
    return;
  }

  if (message.type === "question") {
    hostStartGameButton.classList.add("hidden");
    hostLeaderboardView.classList.add("hidden");
    hostPodiumView.classList.add("hidden");
    hostNextQuestionButton.classList.add("hidden");
    hostQuestionView.classList.remove("hidden");
    hostQuestionTerm.textContent = message.term;
    startCountdown(Date.now() + message.timeLimit);

    // A reconnect resends the SAME in-progress question (server has no
    // "reveal" state, so sendCurrentQuestion() just replays whatever is
    // current). Only play the entrance animation for a genuinely new index,
    // not a resend of content already on screen.
    if (message.index !== lastRenderedQuestionIndex) {
      lastRenderedQuestionIndex = message.index;
      playEntrance(hostQuestionView, ["animate__fadeInUp", "animate__faster"]);
    }
    return;
  }

  if (message.type === "reveal") {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    hostQuestionMeta.classList.remove("timer-urgent");
    hostQuestionMeta.textContent = "Answer revealed — click Next Question to continue.";
    hostPodiumView.classList.add("hidden");
    renderWsLeaderboard(message.leaderboard, hostLeaderboardList);
    hostLeaderboardView.classList.remove("hidden");
    hostNextQuestionButton.classList.remove("hidden");
    return;
  }

  if (message.type === "game_over") {
    hostQuestionView.classList.add("hidden");
    hostStartGameButton.classList.add("hidden");
    hostNextQuestionButton.classList.add("hidden");
    hostLeaderboardView.classList.add("hidden");
    hostGameStatus.textContent = "Game over!";
    renderPodium(message.leaderboard);
    hostViewAnalyticsButton.classList.remove("hidden");
    return;
  }

  if (message.type === "error") {
    setDashboardMessage(message.message);
  }
}

function connect(gameId) {
  closeSocket();
  manualClose = false;
  currentGameId = gameId;

  let protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/?gameId=${gameId}`);

  hostStartGameButton.disabled = true;
  socket.addEventListener("open", () => {
    hostStartGameButton.disabled = false;
    reconnectAttempts = 0;
  });
  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", () => {
    socket = null;
    if (!manualClose) scheduleReconnect();
  });
}

hostGameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  playSound("click");
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let game = await submitForm("/games", {
      classroom_id: form.classroom_id.value,
      set_id: form.set_id.value,
    });
    currentSetId = form.set_id.value;
    currentSetTitle = form.set_id.selectedOptions[0].textContent;
    hostGameLive.classList.remove("hidden");
    hostGameStatus.textContent = "Waiting for players to join...";
    hostQuestionView.classList.add("hidden");
    hostLeaderboardView.classList.add("hidden");
    hostPodiumView.classList.add("hidden");
    hostNextQuestionButton.classList.add("hidden");
    hostViewAnalyticsButton.classList.add("hidden");
    lastScores.clear();
    confettiFired = false;
    lastRenderedQuestionIndex = null;

    let messageEl = document.getElementById("dashboard-message");
    if (messageEl) {
      messageEl.className = "message success";
      messageEl.innerHTML = `
        Game created. Join code: <strong style="font-family: monospace; font-size: 1.1rem; margin: 0 6px;">${game.join_code}</strong>
        <button id="copy-code-btn" type="button" style="margin-left: 10px; padding: 4px 10px; border: 1px solid #059669; border-radius: 4px; background: #059669; color: #ffffff; font-weight: 600; cursor: pointer; font-size: 0.85rem;">Copy Code</button>
      `;

      let copyBtn = document.getElementById("copy-code-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(game.join_code);
            copyBtn.textContent = "Copied! ✓";
            copyBtn.style.background = "#047857";
            setTimeout(() => {
              copyBtn.textContent = "Copy Code";
              copyBtn.style.background = "#059669";
            }, 2000);
          } catch (err) {
            console.error("Failed to copy text: ", err);
          }
        });
      }
    }

    connect(game.id);
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

hostStartGameButton.addEventListener("click", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  playSound("click");
  playSound("ready");
  hostStartGameButton.disabled = true;
  socket.send(JSON.stringify({ type: "start_game" }));
  setTimeout(() => {
    hostStartGameButton.disabled = false;
  }, 1000);
});

hostNextQuestionButton.addEventListener("click", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  playSound("click");
  hostNextQuestionButton.classList.add("hidden");
  socket.send(JSON.stringify({ type: "next_question" }));
});

hostEndGameButton.addEventListener("click", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  playSound("click");
  socket.send(JSON.stringify({ type: "end_game" }));
});

hostViewAnalyticsButton.addEventListener("click", () => {
  if (!currentSetId) return;
  openAnalytics(currentSetId, currentSetTitle, { gameId: currentGameId });
});