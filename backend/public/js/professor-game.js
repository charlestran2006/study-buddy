import { apiRequest, submitForm } from "./api.js";
import { setDashboardMessage, loadLeaderboard } from "./dom.js";
import { registerLogoutCleanup } from "./auth.js";

let activeGame = document.getElementById("active-game");
let gameJoinCode = document.getElementById("game-join-code");
let gamePlayerCount = document.getElementById("game-player-count");
let startGameButton = document.getElementById("start-game-button");
let hostQuestion = document.getElementById("host-question");
let gameProgress = document.getElementById("game-progress");
let hostTerm = document.getElementById("host-term");
let hostTally = document.getElementById("host-tally");
let hostAnsweredCount = document.getElementById("host-answered-count");
let nextQuestionButton = document.getElementById("next-question-button");
let gameLeaderboardList = document.getElementById("game-leaderboard");
let gamePollInterval = null;
let currentGameId = null;

registerLogoutCleanup(() => {
  stopGamePolling();
  activeGame.classList.add("hidden");
});

function stopGamePolling() {
  if (gamePollInterval) {
    clearInterval(gamePollInterval);
    gamePollInterval = null;
  }
}

function renderProfessorGame(game) {
  gamePlayerCount.textContent = `${game.player_count} player${game.player_count === 1 ? "" : "s"} joined`;

  if (game.status === "waiting") {
    startGameButton.classList.remove("hidden");
    hostQuestion.classList.add("hidden");
    gameLeaderboardList.classList.add("hidden");
    return;
  }

  startGameButton.classList.add("hidden");

  if (game.status === "active") {
    hostQuestion.classList.remove("hidden");
    gameLeaderboardList.classList.add("hidden");
    gameProgress.textContent = `Question ${game.current_term_index + 1} of ${game.total_terms}`;
    hostTerm.textContent = game.current_term ? game.current_term.term : "";
    renderHostTally(game.choices || []);
    hostAnsweredCount.textContent = `${game.answered_count} of ${game.player_count} answered · ${game.correct_count} correct`;
    return;
  }

  hostQuestion.classList.add("hidden");
  gameLeaderboardList.classList.remove("hidden");
  loadLeaderboard(game.id, gameLeaderboardList);
}

function renderHostTally(choices) {
  hostTally.innerHTML = "";
  choices.forEach((choice) => {
    let item = document.createElement("li");
    item.textContent = choice.definition;
    hostTally.appendChild(item);
  });
}

function pollGame(gameId) {
  stopGamePolling();
  currentGameId = gameId;

  let poll = async () => {
    try {
      let game = await apiRequest(`/games/${gameId}`);
      renderProfessorGame(game);

      if (game.status === "finished") {
        stopGamePolling();
      }
    } catch (err) {
      stopGamePolling();
    }
  };

  poll();
  gamePollInterval = setInterval(poll, 3000);
}

document.getElementById("create-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let game = await submitForm("/games", {
      classroom_id: form.classroom_id.value,
      set_id: form.set_id.value,
    });
    gameJoinCode.textContent = game.join_code;
    startGameButton.disabled = false;
    activeGame.classList.remove("hidden");
    setDashboardMessage("Game created.", true);
    pollGame(game.id);
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

startGameButton.addEventListener("click", async () => {
  if (!currentGameId) {
    return;
  }

  startGameButton.disabled = true;

  try {
    await apiRequest(`/games/${currentGameId}/start`, { method: "POST" });
    setDashboardMessage("Game started.", true);
  } catch (err) {
    setDashboardMessage(err.message);
    startGameButton.disabled = false;
  }
});

nextQuestionButton.addEventListener("click", async () => {
  if (!currentGameId) {
    return;
  }

  nextQuestionButton.disabled = true;

  try {
    await apiRequest(`/games/${currentGameId}/next`, { method: "POST" });
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    nextQuestionButton.disabled = false;
  }
});
