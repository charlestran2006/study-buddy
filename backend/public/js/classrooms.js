import { apiRequest, submitForm } from "./api.js";
import { setDashboardMessage, escapeHtml, copyToClipboard } from "./dom.js";

let classroomList = document.getElementById("classroom-list");
let assignClassroomSelect = document.getElementById("assign-classroom-select");

export async function loadClassrooms() {
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
    `;
    item.querySelector(".classroom-meta").appendChild(joinCodeSpan);
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
