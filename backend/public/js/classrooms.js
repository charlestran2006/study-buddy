import { apiRequest, submitForm } from "./api.js";
import { setDashboardMessage, escapeHtml, copyToClipboard } from "./dom.js";

let classroomList = document.getElementById("classroom-list");
let assignClassroomSelect = document.getElementById("assign-classroom-select");
let hostClassroomSelect = document.getElementById("host-classroom-select");

export async function loadClassrooms() {
  try {
    let classrooms = await apiRequest("/classrooms");
    renderClassrooms(classrooms);
  } catch (err) {
    setDashboardMessage(err.message);
  }
}

function renderRoster(rosterList, students, classroomId, onRemoved) {
  rosterList.innerHTML = "";

  if (students.length === 0) {
    rosterList.innerHTML = '<li class="empty-state">No students have joined yet.</li>';
    return;
  }

  students.forEach((student) => {
    let item = document.createElement("li");
    item.className = "roster-item";
    item.innerHTML = `
      <span class="roster-info">
        <span class="roster-name">${escapeHtml(student.username)}</span>
        <span class="roster-email">${escapeHtml(student.email)}</span>
      </span>
      <button type="button" class="roster-remove-button">Remove</button>
    `;

    item.querySelector(".roster-remove-button").addEventListener("click", async (event) => {
      let button = event.target;
      button.disabled = true;

      try {
        await apiRequest(`/classrooms/${classroomId}/students/${student.id}`, { method: "DELETE" });
        item.remove();
        onRemoved();
      } catch (err) {
        setDashboardMessage(err.message);
        button.disabled = false;
      }
    });

    rosterList.appendChild(item);
  });
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

    let joinCodeSpan = document.createElement("span");
    joinCodeSpan.className = "join-code";
    joinCodeSpan.textContent = classroom.join_code;
    joinCodeSpan.style.cursor = "pointer";
    joinCodeSpan.title = "Click to copy join code";
    joinCodeSpan.addEventListener("click", () => copyToClipboard(classroom.join_code));

    let studentCount = classroom.student_count;

    item.innerHTML = `
      <div class="classroom-name">${escapeHtml(classroom.name)}</div>
      <div class="classroom-meta">
        <span class="student-count-text"></span> &middot;
        join code
      </div>
      <button type="button" class="roster-toggle-button">View Roster</button>
      <button type="button" class="roster-toggle-button classroom-rename-button">Rename</button>
      <button type="button" class="classroom-delete-button">Delete Classroom</button>
      <form class="panel-form classroom-rename-form hidden">
        <input type="text" class="classroom-rename-input" required />
        <button type="submit">Save</button>
      </form>
      <ul class="roster-list hidden"></ul>
    `;
    item.querySelector(".classroom-meta").appendChild(joinCodeSpan);

    let nameDiv = item.querySelector(".classroom-name");
    let renameButton = item.querySelector(".classroom-rename-button");
    let renameForm = item.querySelector(".classroom-rename-form");
    let renameInput = item.querySelector(".classroom-rename-input");

    renameButton.addEventListener("click", () => {
      let isHidden = renameForm.classList.contains("hidden");

      if (isHidden) {
        renameInput.value = classroom.name;
        renameForm.classList.remove("hidden");
        renameButton.textContent = "Cancel";
      } else {
        renameForm.classList.add("hidden");
        renameButton.textContent = "Rename";
      }
    });

    renameForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      let button = renameForm.querySelector("button[type='submit']");
      button.disabled = true;

      try {
        let updated = await apiRequest(`/classrooms/${classroom.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: renameInput.value }),
        });
        classroom.name = updated.name;
        nameDiv.textContent = updated.name;
        option.textContent = updated.name;
        hostOption.textContent = updated.name;
        renameForm.classList.add("hidden");
        renameButton.textContent = "Rename";
        setDashboardMessage("Classroom renamed.", true);
      } catch (err) {
        setDashboardMessage(err.message);
      } finally {
        button.disabled = false;
      }
    });

    let countText = item.querySelector(".student-count-text");
    function updateCountText() {
      countText.textContent = `${studentCount} student${studentCount === 1 ? "" : "s"}`;
    }
    updateCountText();

    let rosterButton = item.querySelector(".roster-toggle-button");
    let rosterList = item.querySelector(".roster-list");
    let rosterLoaded = false;

    async function loadRoster() {
      rosterButton.disabled = true;
      try {
        let details = await apiRequest(`/classrooms/${classroom.id}`);
        studentCount = details.students.length;
        updateCountText();
        renderRoster(rosterList, details.students, classroom.id, () => {
          studentCount -= 1;
          updateCountText();
        });
        rosterLoaded = true;
      } catch (err) {
        setDashboardMessage(err.message);
      } finally {
        rosterButton.disabled = false;
      }
    }

    rosterButton.addEventListener("click", async () => {
      let isHidden = rosterList.classList.contains("hidden");

      if (!isHidden) {
        rosterList.classList.add("hidden");
        rosterButton.textContent = "View Roster";
        return;
      }

      if (!rosterLoaded) {
        await loadRoster();
      }

      rosterList.classList.remove("hidden");
      rosterButton.textContent = "Hide Roster";
    });

    item.querySelector(".classroom-delete-button").addEventListener("click", async () => {
      let confirmed = window.confirm(
        `Delete "${classroom.name}"? This removes all students, assignments, and game history for this classroom. This cannot be undone.`
      );

      if (!confirmed) {
        return;
      }

      try {
        await apiRequest(`/classrooms/${classroom.id}`, { method: "DELETE" });
        setDashboardMessage("Classroom deleted.", true);
        loadClassrooms();
      } catch (err) {
        setDashboardMessage(err.message);
      }
    });

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
