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
  if (hostSocket) hostSocket.close();
  if (playerSocket) playerSocket.close();
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
let hostClassroomSelect = document.getElementById("host-classroom-select");

async function loadClassrooms() {
  try {
    let classrooms = await apiRequest("/classrooms");
    renderClassrooms(classrooms);
  } catch (err) {
    setDashboardMessage(err.message);
  }
}

function renderClassrooms(classrooms) {
  classroomList.innerHTML = "";
  assignClassroomSelect.innerHTML = "";
  hostClassroomSelect.innerHTML = "";

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

    let hostOption = document.createElement("option");
    hostOption.value = classroom.id;
    hostOption.textContent = classroom.name;
    hostClassroomSelect.appendChild(hostOption);
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
let hostSetSelect = document.getElementById("host-set-select");

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

function renderSets(sets) {
  assignSetSelect.innerHTML = "";
  hostSetSelect.innerHTML = "";

  sets.forEach((set) => {
    let option = document.createElement("option");
    option.value = set.id;
    option.textContent = set.title;
    assignSetSelect.appendChild(option);

    let hostOption = document.createElement("option");
    hostOption.value = set.id;
    hostOption.textContent = set.title;
    hostSetSelect.appendChild(hostOption);
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

// --- Student: my classrooms ---

let myClassroomList = document.getElementById("my-classroom-list");
let gameClassroomSelect = document.getElementById("game-classroom-select");

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

function escapeHtml(str) {
  let div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Live Game ---

function wsUrl(classroomId) {
  let protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws?classroomId=${classroomId}`;
}

function renderPlayerList(el, players) {
  el.innerHTML = "";
  if (players.length === 0) {
    el.innerHTML = '<li class="empty-state">No players yet.</li>';
    return;
  }
  players.forEach((p) => {
    let item = document.createElement("li");
    item.textContent = `${p.username} — ${p.score} pts`;
    el.appendChild(item);
  });
}

function renderLeaderboard(el, leaderboard) {
  el.innerHTML = "";
  leaderboard.forEach((p) => {
    let item = document.createElement("li");
    item.textContent = `${p.username} — ${p.score} pts`;
    el.appendChild(item);
  });
}

// --- Live Game (host) ---

let hostGameForm = document.getElementById("host-game-form");
let hostGameLive = document.getElementById("host-game-live");
let hostGameStatus = document.getElementById("host-game-status");
let hostPlayerList = document.getElementById("host-player-list");
let hostQuestionView = document.getElementById("host-question-view");
let hostQuestionTerm = document.getElementById("host-question-term");
let hostQuestionMeta = document.getElementById("host-question-meta");
let hostLeaderboardView = document.getElementById("host-leaderboard-view");
let hostLeaderboardList = document.getElementById("host-leaderboard-list");
let hostSocket = null;

hostGameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  let form = event.target;
  let classroomId = form.classroom_id.value;
  let setId = form.set_id.value;

  if (hostSocket) hostSocket.close();

  hostGameStatus.textContent = "Connecting...";
  hostGameLive.classList.remove("hidden");

  hostSocket = new WebSocket(wsUrl(classroomId));

  hostSocket.addEventListener("open", () => {
    hostGameStatus.textContent = "Connected. Starting game...";
    hostSocket.send(JSON.stringify({ type: "start_game", setId: Number(setId) }));
  });

  hostSocket.addEventListener("message", (event) => {
    handleHostMessage(JSON.parse(event.data));
  });

  hostSocket.addEventListener("close", () => {
    hostGameStatus.textContent = "Disconnected.";
  });

  hostSocket.addEventListener("error", () => {
    hostGameStatus.textContent = "Connection error.";
  });
});

function handleHostMessage(message) {
  if (message.type === "room_state" || message.type === "players_update") {
    renderPlayerList(hostPlayerList, message.players);
  } else if (message.type === "question") {
    hostQuestionView.classList.remove("hidden");
    hostLeaderboardView.classList.add("hidden");
    hostQuestionTerm.textContent = message.term;
    hostQuestionMeta.textContent = `Question ${message.index + 1} of ${message.total}`;
    hostGameStatus.textContent = "Question live.";
  } else if (message.type === "reveal") {
    hostGameStatus.textContent = "Revealing answer...";
    renderLeaderboard(hostLeaderboardList, message.leaderboard);
    hostLeaderboardView.classList.remove("hidden");
  } else if (message.type === "game_over") {
    hostQuestionView.classList.add("hidden");
    hostGameStatus.textContent = "Game over!";
    renderLeaderboard(hostLeaderboardList, message.leaderboard);
    hostLeaderboardView.classList.remove("hidden");
  } else if (message.type === "error") {
    hostGameStatus.textContent = message.message;
  }
}

document.getElementById("host-end-game-button").addEventListener("click", () => {
  if (hostSocket) {
    hostSocket.send(JSON.stringify({ type: "end_game" }));
  }
});

// --- Live Game (player) ---

let joinGameForm = document.getElementById("join-game-form");
let playerGameLive = document.getElementById("player-game-live");
let playerGameStatus = document.getElementById("player-game-status");
let playerQuestionView = document.getElementById("player-question-view");
let playerQuestionTerm = document.getElementById("player-question-term");
let playerChoices = document.getElementById("player-choices");
let playerLeaderboardView = document.getElementById("player-leaderboard-view");
let playerLeaderboardList = document.getElementById("player-leaderboard-list");
let playerSocket = null;
let hasAnsweredCurrent = false;

joinGameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  let form = event.target;
  let classroomId = form.classroom_id.value;

  if (playerSocket) playerSocket.close();

  playerGameStatus.textContent = "Connecting...";
  playerGameLive.classList.remove("hidden");

  playerSocket = new WebSocket(wsUrl(classroomId));

  playerSocket.addEventListener("open", () => {
    playerGameStatus.textContent = "Connected. Waiting for the host to start...";
  });

  playerSocket.addEventListener("message", (event) => {
    handlePlayerMessage(JSON.parse(event.data));
  });

  playerSocket.addEventListener("close", () => {
    playerGameStatus.textContent = "Disconnected.";
  });

  playerSocket.addEventListener("error", () => {
    playerGameStatus.textContent = "Connection error.";
  });
});

function handlePlayerMessage(message) {
  if (message.type === "question") {
    hasAnsweredCurrent = false;
    playerQuestionView.classList.remove("hidden");
    playerLeaderboardView.classList.add("hidden");
    playerQuestionTerm.textContent = message.term;
    playerGameStatus.textContent = `Question ${message.index + 1} of ${message.total}`;
    renderChoices(message.choices);
  } else if (message.type === "answer_ack") {
    playerGameStatus.textContent = "Answer submitted. Waiting for reveal...";
  } else if (message.type === "reveal") {
    playerGameStatus.textContent = "Answer revealed.";
    Array.from(playerChoices.children).forEach((button, index) => {
      button.disabled = true;
      if (index === message.correctIndex) {
        button.classList.add("correct");
      }
    });
    renderLeaderboard(playerLeaderboardList, message.leaderboard);
    playerLeaderboardView.classList.remove("hidden");
  } else if (message.type === "game_over") {
    playerQuestionView.classList.add("hidden");
    playerGameStatus.textContent = "Game over!";
    renderLeaderboard(playerLeaderboardList, message.leaderboard);
    playerLeaderboardView.classList.remove("hidden");
  } else if (message.type === "error") {
    playerGameStatus.textContent = message.message;
  }
}

function renderChoices(choices) {
  playerChoices.innerHTML = "";
  choices.forEach((choice, index) => {
    let button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = choice;
    button.addEventListener("click", () => {
      if (hasAnsweredCurrent) return;
      hasAnsweredCurrent = true;
      Array.from(playerChoices.children).forEach((b) => b.classList.remove("selected"));
      button.classList.add("selected");
      playerSocket.send(JSON.stringify({ type: "answer", choiceIndex: index }));
    });
    playerChoices.appendChild(button);
  });
}
