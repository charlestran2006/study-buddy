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

function renderRoster(rosterList, students) {
  rosterList.innerHTML = "";

  if (students.length === 0) {
    rosterList.innerHTML = '<li class="empty-state">No students have joined yet.</li>';
    return;
  }

  students.forEach((student) => {
    let item = document.createElement("li");
    item.className = "roster-item";
    item.innerHTML = `
      <span class="roster-name">${escapeHtml(student.username)}</span>
      <span class="roster-email">${escapeHtml(student.email)}</span>
    `;
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

    item.innerHTML = `
      <div class="classroom-name">${escapeHtml(classroom.name)}</div>
      <div class="classroom-meta">
        ${classroom.student_count} student${classroom.student_count === 1 ? "" : "s"} &middot;
        join code
      </div>
      <button type="button" class="roster-toggle-button">View Roster</button>
      <ul class="roster-list hidden"></ul>
    `;
    item.querySelector(".classroom-meta").appendChild(joinCodeSpan);

    let rosterButton = item.querySelector(".roster-toggle-button");
    let rosterList = item.querySelector(".roster-list");
    let rosterLoaded = false;

    rosterButton.addEventListener("click", async () => {
      let isHidden = rosterList.classList.contains("hidden");

      if (!isHidden) {
        rosterList.classList.add("hidden");
        rosterButton.textContent = "View Roster";
        return;
      }

      if (!rosterLoaded) {
        rosterButton.disabled = true;
        try {
          let details = await apiRequest(`/classrooms/${classroom.id}`);
          renderRoster(rosterList, details.students);
          rosterLoaded = true;
        } catch (err) {
          setDashboardMessage(err.message);
          return;
        } finally {
          rosterButton.disabled = false;
        }
      }

      rosterList.classList.remove("hidden");
      rosterButton.textContent = "Hide Roster";
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
