import { apiRequest, submitForm } from "./api.js";
import { setStudentDashboardMessage, escapeHtml, loadLeaderboard } from "./dom.js";
import { registerLogoutCleanup, registerStudentDashboardLoader } from "./auth.js";

let myClassroomList = document.getElementById("my-classroom-list");
let gameClassroomSelect = document.getElementById("game-classroom-select");

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
  gameClassroomSelect.innerHTML = "";

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

    let option = document.createElement("option");
    option.value = classroom.id;
    option.textContent = classroom.name;
    gameClassroomSelect.appendChild(option);
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

let gameStatusMessage = document.getElementById("game-status-message");
let gamePlayPanel = document.getElementById("game-play-panel");
let gameWaiting = document.getElementById("game-waiting");
let gameQuestion = document.getElementById("game-question");
let gameFinished = document.getElementById("game-finished");
let gameProgressLine = document.getElementById("game-progress-line");
let gameTermEl = document.getElementById("game-term");
let gameChoices = document.getElementById("game-choices");
let gameAnswerStatus = document.getElementById("game-answer-status");
let gameFinalLeaderboard = document.getElementById("game-final-leaderboard");
let studentGamePollInterval = null;
let studentGameId = null;

registerLogoutCleanup(() => {
  stopStudentGamePolling();
  gamePlayPanel.classList.add("hidden");
});

function stopStudentGamePolling() {
  if (studentGamePollInterval) {
    clearInterval(studentGamePollInterval);
    studentGamePollInterval = null;
  }
}

function showGamePane(pane) {
  [gameWaiting, gameQuestion, gameFinished].forEach((el) => {
    el.classList.toggle("hidden", el !== pane);
  });
}

function renderStudentGame(state) {
  if (state.status === "waiting") {
    showGamePane(gameWaiting);
    return;
  }

  if (state.status === "finished") {
    showGamePane(gameFinished);
    loadLeaderboard(studentGameId, gameFinalLeaderboard);
    return;
  }

  showGamePane(gameQuestion);
  gameProgressLine.textContent = `Question ${state.current_term_index + 1} of ${state.total_terms}`;
  gameTermEl.textContent = state.current_term ? state.current_term.term : "";
  renderChoices(state);
}

function renderChoices(state) {
  gameChoices.innerHTML = "";
  let termId = state.current_term ? state.current_term.id : null;
  let lastAnswer = state.last_answer;

  (state.choices || []).forEach((choice) => {
    let button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = choice.definition;
    button.dataset.termId = choice.term_id;

    if (state.answered) {
      button.disabled = true;
      if (lastAnswer && choice.term_id === lastAnswer.correct_term_id) {
        button.classList.add("correct");
      } else if (lastAnswer && choice.term_id === lastAnswer.selected_term_id) {
        button.classList.add("incorrect");
      }
    } else {
      button.addEventListener("click", () => submitChoice(termId, choice.term_id));
    }

    gameChoices.appendChild(button);
  });

  gameAnswerStatus.classList.toggle("hidden", !state.answered);
  if (state.answered) {
    gameAnswerStatus.textContent = "Answer locked in! Waiting for other players to submit...";
  }
}

async function submitChoice(termId, selectedTermId) {
  Array.from(gameChoices.children).forEach((button) => {
    button.disabled = true;
  });

  gameAnswerStatus.classList.remove("hidden");
  gameAnswerStatus.textContent = "Submitting answer...";

  try {
    let result = await apiRequest(`/games/${studentGameId}/answer`, {
      method: "POST",
      body: JSON.stringify({ term_id: termId, selected_term_id: selectedTermId }),
    });

    Array.from(gameChoices.children).forEach((button) => {
      let choiceTermId = Number(button.dataset.termId);
      if (choiceTermId === result.correct_term_id) {
        button.classList.add("correct");
      } else if (choiceTermId === selectedTermId) {
        button.classList.add("incorrect");
      }
    });

    gameAnswerStatus.classList.remove("hidden");
    gameAnswerStatus.textContent = "Answer locked in! Waiting for other players to submit...";
  } catch (err) {
    gameStatusMessage.textContent = err.message;
    Array.from(gameChoices.children).forEach((button) => {
      button.disabled = false;
    });
    gameAnswerStatus.classList.add("hidden");
  }
}

function pollStudentGame(gameId) {
  stopStudentGamePolling();
  studentGameId = gameId;
  gamePlayPanel.classList.remove("hidden");

  let poll = async () => {
    try {
      let state = await apiRequest(`/games/${gameId}/state`);
      renderStudentGame(state);

      if (state.status === "finished") {
        stopStudentGamePolling();
      }
    } catch (err) {
      stopStudentGamePolling();
    }
  };

  poll();
  studentGamePollInterval = setInterval(poll, 1500);
}

document.getElementById("join-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let game = await submitForm("/games/join", { code: form.code.value });
    form.reset();
    gameStatusMessage.textContent = "Joined! Waiting for the professor to start.";
    pollStudentGame(game.id);
  } catch (err) {
    gameStatusMessage.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
