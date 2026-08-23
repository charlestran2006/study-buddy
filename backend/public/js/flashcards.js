import { apiRequest } from "./api.js";
import { setStudentDashboardMessage } from "./dom.js";
import { registerStudentDashboardLoader } from "./auth.js";

let classroomSelect = document.getElementById("study-classroom-select");
let viewer = document.getElementById("flashcard-viewer");
let setTitle = document.getElementById("flashcard-set-title");
let card = document.getElementById("flashcard");
let cardContent = document.getElementById("flashcard-content");
let counter = document.getElementById("flashcard-counter");

let terms = [];
let index = 0;
let showingDefinition = false;

registerStudentDashboardLoader(loadClassroomOptions);

async function loadClassroomOptions() {
  try {
    let classrooms = await apiRequest("/my-classrooms");
    classroomSelect.innerHTML = "";
    classrooms.forEach((classroom) => {
      let option = document.createElement("option");
      option.value = classroom.id;
      option.textContent = classroom.name;
      classroomSelect.appendChild(option);
    });
  } catch (err) {
    setStudentDashboardMessage(err.message);
  }
}

document.getElementById("study-select-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let classroomId = classroomSelect.value;

  if (!classroomId) {
    return;
  }

  try {
    let studySet = await apiRequest(`/api/classrooms/${classroomId}/assignment`);
    terms = studySet.terms;
    index = 0;
    showingDefinition = false;
    setTitle.textContent = studySet.title;
    viewer.classList.remove("hidden");
    renderCard();
  } catch (err) {
    viewer.classList.add("hidden");
    setStudentDashboardMessage(err.message);
  }
});

function renderCard() {
  let term = terms[index];
  cardContent.textContent = showingDefinition ? term.definition : term.term;
  card.classList.toggle("flashcard-flipped", showingDefinition);
  counter.textContent = `Card ${index + 1} of ${terms.length} — click to flip`;
}

card.addEventListener("click", () => {
  showingDefinition = !showingDefinition;
  renderCard();
});

document.getElementById("flashcard-prev").addEventListener("click", () => {
  index = (index - 1 + terms.length) % terms.length;
  showingDefinition = false;
  renderCard();
});

document.getElementById("flashcard-next").addEventListener("click", () => {
  index = (index + 1) % terms.length;
  showingDefinition = false;
  renderCard();
});
