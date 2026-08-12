let tabs = document.querySelectorAll(".tab");
let forms = document.querySelectorAll(".auth-form");
let message = document.getElementById("message");

let authView = document.getElementById("auth-view");
let dashboardView = document.getElementById("dashboard-view");
let dashboardMessage = document.getElementById("dashboard-message");
let studentDashboardView = document.getElementById("student-dashboard-view");
let studentDashboardMessage = document.getElementById("student-dashboard-message");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");

    forms.forEach((form) => {
      form.classList.toggle("hidden", form.id !== tab.dataset.target);
    });

    setMessage("");
  });
});

function setMessage(text, isSuccess) {
  message.textContent = text;
  message.classList.toggle("success", Boolean(isSuccess));
}

function setDashboardMessage(text, isSuccess) {
  dashboardMessage.textContent = text;
  dashboardMessage.classList.toggle("success", Boolean(isSuccess));
}

function setStudentDashboardMessage(text, isSuccess) {
  studentDashboardMessage.textContent = text;
  studentDashboardMessage.classList.toggle("success", Boolean(isSuccess));
}

async function apiRequest(url, options) {
  let response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "something went wrong");
  }

  return data;
}

function submitForm(url, body) {
  return apiRequest(url, { method: "POST", body: JSON.stringify(body) });
}

function showProfessorDashboard(user) {
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  document.getElementById("dashboard-username").textContent = `${user.username} (${user.role})`;
  loadClassrooms();
  loadSets();
}

function showStudentDashboard(user) {
  authView.classList.add("hidden");
  studentDashboardView.classList.remove("hidden");
  document.getElementById("student-dashboard-username").textContent = `${user.username} (${user.role})`;
  loadMyClassrooms();
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let user = await submitForm("/login", {
      username: form.username.value,
      password: form.password.value,
    });

    if (user.role === "professor") {
      showProfessorDashboard(user);
    } else {
      showStudentDashboard(user);
    }
  } catch (err) {
    setMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    await submitForm("/signup", {
      username: form.username.value,
      email: form.email.value,
      password: form.password.value,
      role: form.role.value,
    });

    let user = await submitForm("/login", {
      username: form.username.value,
      password: form.password.value,
    });

    if (user.role === "professor") {
      showProfessorDashboard(user);
    } else {
      showStudentDashboard(user);
    }
  } catch (err) {
    setMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

async function logout() {
  try {
    await apiRequest("/logout", { method: "POST" });
  } catch (err) {
    // ignore, clear the UI regardless
  }
  stopGamePolling();
  stopStudentGamePolling();
  activeGame.classList.add("hidden");
  gamePlayPanel.classList.add("hidden");
  dashboardView.classList.add("hidden");
  studentDashboardView.classList.add("hidden");
  authView.classList.remove("hidden");
  document.getElementById("login-form").reset();
}

document.getElementById("logout-button").addEventListener("click", logout);
document.getElementById("student-logout-button").addEventListener("click", logout);

// --- Classrooms ---

let classroomList = document.getElementById("classroom-list");
let assignClassroomSelect = document.getElementById("assign-classroom-select");

async function loadClassrooms() {
  try {
    let classrooms = await apiRequest("/classrooms");
    renderClassrooms(classrooms);
  } catch (err) {
    setDashboardMessage(err.message);
  }
}

let gameClassroomSelect = document.getElementById("game-classroom-select");

function renderClassrooms(classrooms) {
  classroomList.innerHTML = "";
  assignClassroomSelect.innerHTML = "";
  gameClassroomSelect.innerHTML = "";

  if (classrooms.length === 0) {
    classroomList.innerHTML = '<li class="empty-state">No classrooms yet.</li>';
  }

  classrooms.forEach((classroom) => {
    let item = document.createElement("li");
    item.className = "classroom-item";
    item.innerHTML = `
      <div class="classroom-name">${escapeHtml(classroom.name)}</div>
      <div class="classroom-meta">
        ${classroom.student_count} student${classroom.student_count === 1 ? "" : "s"} &middot;
        join code <span class="join-code">${escapeHtml(classroom.join_code)}</span>
      </div>
    `;
    classroomList.appendChild(item);

    let option = document.createElement("option");
    option.value = classroom.id;
    option.textContent = classroom.name;
    assignClassroomSelect.appendChild(option);

    let gameOption = document.createElement("option");
    gameOption.value = classroom.id;
    gameOption.textContent = classroom.name;
    gameClassroomSelect.appendChild(gameOption);
  });
}

document.getElementById("create-classroom-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    await submitForm("/classrooms", { name: form.name.value });
    form.reset();
    setDashboardMessage("Classroom created.", true);
    loadClassrooms();
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

// --- Study sets ---

let termRows = document.getElementById("term-rows");
let assignSetSelect = document.getElementById("assign-set-select");
let gameSetSelect = document.getElementById("game-set-select");

function addTermRow() {
  let row = document.createElement("div");
  row.className = "term-row";
  row.innerHTML = `
    <input type="text" class="term-input" placeholder="Term" required />
    <input type="text" class="definition-input" placeholder="Definition" required />
    <button type="button" aria-label="Remove term">&times;</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  termRows.appendChild(row);
}

document.getElementById("add-term-row").addEventListener("click", addTermRow);
addTermRow();
addTermRow();

async function loadSets() {
  try {
    let sets = await apiRequest("/sets");
    renderSets(sets);
  } catch (err) {
    setDashboardMessage(err.message);
  }
}

let gameSetSelect = document.getElementById("game-set-select");

function renderSets(sets) {
  assignSetSelect.innerHTML = "";
  gameSetSelect.innerHTML = "";

  sets.forEach((set) => {
    let option = document.createElement("option");
    option.value = set.id;
    option.textContent = set.title;
    assignSetSelect.appendChild(option);

    let gameOption = option.cloneNode(true);
    gameSetSelect.appendChild(gameOption);
  });
}

document.getElementById("create-set-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button[type='submit']");
  button.disabled = true;

  let terms = Array.from(termRows.querySelectorAll(".term-row"))
    .map((row) => ({
      term: row.querySelector(".term-input").value.trim(),
      definition: row.querySelector(".definition-input").value.trim(),
    }))
    .filter((t) => t.term && t.definition);

  if (terms.length === 0) {
    setDashboardMessage("Add at least one term and definition.");
    button.disabled = false;
    return;
  }

  try {
    await submitForm("/sets", {
      title: form.title.value,
      description: form.description.value,
      terms,
    });
    form.reset();
    termRows.innerHTML = "";
    addTermRow();
    addTermRow();
    setDashboardMessage("Study set created.", true);
    loadSets();
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

// --- Assignments ---

document.getElementById("assign-set-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    await submitForm("/assignments", {
      set_id: form.set_id.value,
      classroom_id: form.classroom_id.value,
    });
    setDashboardMessage("Study set assigned to classroom.", true);
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

// --- Games (professor) ---

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

function stopGamePolling() {
  if (gamePollInterval) {
    clearInterval(gamePollInterval);
    gamePollInterval = null;
  }
}

async function loadLeaderboard(gameId, listEl) {
  try {
    let data = await apiRequest(`/games/${gameId}/leaderboard`);
    renderLeaderboard(data.players, listEl);
  } catch (err) {
    // ignore transient errors while polling
  }
}

function renderLeaderboard(players, listEl) {
  listEl.innerHTML = "";

  if (players.length === 0) {
    listEl.innerHTML = '<li class="empty-state">No players yet.</li>';
    return;
  }

  players.forEach((player) => {
    let item = document.createElement("li");
    item.innerHTML = `
      <span><span class="rank">#${player.rank}</span>${escapeHtml(player.username)}</span>
      <span>${player.score} pts</span>
    `;
    listEl.appendChild(item);
  });
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

  // finished
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
    let game = await submitForm("/games", { set_id: form.set_id.value });
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

// --- Student: my classrooms ---

let myClassroomList = document.getElementById("my-classroom-list");

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

// --- Games (student) ---

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
    gameAnswerStatus.textContent = "Waiting for the professor to move to the next question…";
  }
}

async function submitChoice(termId, selectedTermId) {
  Array.from(gameChoices.children).forEach((button) => {
    button.disabled = true;
  });

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
    gameAnswerStatus.textContent = "Waiting for the professor to move to the next question…";
  } catch (err) {
    gameStatusMessage.textContent = err.message;
    Array.from(gameChoices.children).forEach((button) => {
      button.disabled = false;
    });
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

function escapeHtml(str) {
  let div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Live game ---

let gameView = document.getElementById("game-view");
let gameMessage = document.getElementById("game-message");
let gameStatusBadge = document.getElementById("game-status-badge");
let gameJoinCodeDisplay = document.getElementById("game-join-code-display");
let gameTimer = document.getElementById("game-timer");
let gameProfessorControls = document.getElementById("game-professor-controls");
let gameQuestion = document.getElementById("game-question");
let gameTermFront = document.getElementById("game-term-front");
let gameAnswerForm = document.getElementById("game-answer-form");
let gameAnswerMessage = document.getElementById("game-answer-message");
let gameWaitingMessage = document.getElementById("game-waiting-message");
let gameFinishedMessage = document.getElementById("game-finished-message");
let gamePlayerList = document.getElementById("game-player-list");

let currentGameId = null;
let currentGameRole = null;
let currentGameJoinCode = null;
let gamePollTimer = null;
let lastAnsweredTermIndex = null;
let currentTermIndex = null;

function setGameMessage(text) {
  gameMessage.textContent = text;
}

function enterGameView(gameId, role, joinCode) {
  currentGameId = gameId;
  currentGameRole = role;
  currentGameJoinCode = joinCode || null;
  lastAnsweredTermIndex = null;

  dashboardView.classList.add("hidden");
  studentDashboardView.classList.add("hidden");
  gameView.classList.remove("hidden");

  gameProfessorControls.classList.toggle("hidden", role !== "professor");
  gameAnswerForm.reset();
  setGameMessage("");
  gameAnswerMessage.textContent = "";

  pollGame();
  gamePollTimer = setInterval(pollGame, 2000);
}

function leaveGameView() {
  if (gamePollTimer) {
    clearInterval(gamePollTimer);
    gamePollTimer = null;
  }

  gameView.classList.add("hidden");

  if (currentGameRole === "professor") {
    dashboardView.classList.remove("hidden");
  } else {
    studentDashboardView.classList.remove("hidden");
  }

  currentGameId = null;
  currentGameRole = null;
}

document.getElementById("leave-game-button").addEventListener("click", leaveGameView);

async function pollGame() {
  if (!currentGameId) return;

  try {
    let game = await apiRequest(`/games/${currentGameId}`);
    renderGame(game);
  } catch (err) {
    setGameMessage(err.message);
  }
}

function renderGame(game) {
  gameStatusBadge.textContent = game.status;
  gameStatusBadge.className = `game-status-badge ${game.status}`;

  if (currentGameJoinCode) {
    gameJoinCodeDisplay.textContent = `code ${currentGameJoinCode}`;
    gameJoinCodeDisplay.classList.remove("hidden");
  }

  gameQuestion.classList.add("hidden");
  gameWaitingMessage.classList.add("hidden");
  gameFinishedMessage.classList.add("hidden");
  gameTimer.classList.add("hidden");

  if (game.status === "waiting") {
    gameWaitingMessage.classList.remove("hidden");
  } else if (game.status === "active" && game.current_term) {
    gameTermFront.textContent = game.current_term.term;
    gameQuestion.classList.remove("hidden");
    gameTimer.textContent = `${game.time_remaining}s`;
    gameTimer.classList.remove("hidden");
    currentTermIndex = game.current_term_index;

    if (game.current_term_index !== lastAnsweredTermIndex) {
      gameAnswerForm.reset();
      gameAnswerMessage.textContent = "";
    }
  } else if (game.status === "finished") {
    gameFinishedMessage.classList.remove("hidden");
  }

  renderGamePlayers(game.players);
}

function renderGamePlayers(players) {
  gamePlayerList.innerHTML = "";

  if (!players || players.length === 0) {
    gamePlayerList.innerHTML = '<li class="empty-state">No players yet.</li>';
    return;
  }

  players.forEach((player) => {
    let item = document.createElement("li");
    item.className = "player-item";
    item.innerHTML = `
      <span>${escapeHtml(player.username)}</span>
      <span class="player-score">${player.score}</span>
    `;
    gamePlayerList.appendChild(item);
  });
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
    enterGameView(game.id, "professor", game.join_code);
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("join-game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let result = await submitForm("/games/join", { code: form.code.value });
    form.reset();
    enterGameView(result.game_id, "student", null);
  } catch (err) {
    setStudentDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("start-game-button").addEventListener("click", async () => {
  try {
    await apiRequest(`/games/${currentGameId}/start`, { method: "POST" });
    setGameMessage("");
    pollGame();
  } catch (err) {
    setGameMessage(err.message);
  }
});

document.getElementById("end-game-button").addEventListener("click", async () => {
  try {
    await apiRequest(`/games/${currentGameId}/end`, { method: "POST" });
    setGameMessage("");
    pollGame();
  } catch (err) {
    setGameMessage(err.message);
  }
});

gameAnswerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let result = await apiRequest(`/games/${currentGameId}/answer`, {
      method: "POST",
      body: JSON.stringify({ answer: form.answer.value }),
    });
    lastAnsweredTermIndex = currentTermIndex;
    gameAnswerMessage.textContent = result.correct
      ? `Correct! Score: ${result.score}`
      : `Not quite. Score: ${result.score}`;
    gameAnswerMessage.classList.toggle("success", result.correct);
  } catch (err) {
    gameAnswerMessage.textContent = err.message;
    gameAnswerMessage.classList.remove("success");
  } finally {
    button.disabled = false;
  }
});
