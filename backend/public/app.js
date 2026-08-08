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

function renderClassrooms(classrooms) {
  classroomList.innerHTML = "";
  assignClassroomSelect.innerHTML = "";

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

  sets.forEach((set) => {
    let option = document.createElement("option");
    option.value = set.id;
    option.textContent = set.title;
    assignSetSelect.appendChild(option);
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

function escapeHtml(str) {
  let div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
