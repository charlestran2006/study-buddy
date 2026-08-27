import { apiRequest } from "./api.js";
import { setStudentDashboardMessage } from "./dom.js";
import { registerStudentDashboardLoader } from "./auth.js";

let studySelect = document.getElementById("study-classroom-select");
let viewer = document.getElementById("flashcard-viewer");
let setTitle = document.getElementById("flashcard-set-title");
let card = document.getElementById("flashcard");
let cardContent = document.getElementById("flashcard-content");
let counter = document.getElementById("flashcard-counter");

let terms = [];
let index = 0;
let showingDefinition = false;

registerStudentDashboardLoader(loadStudySetOptions);

export async function loadStudySetOptions() {
  try {
    let sets = await apiRequest("/api/my-study-sets");
    studySelect.innerHTML = "";

    if (!sets || sets.length === 0) {
      let option = document.createElement("option");
      option.value = "";
      option.textContent = "No study sets available yet";
      studySelect.appendChild(option);
      return;
    }

    let groups = {};
    sets.forEach((set) => {
      let groupName = set.source_type || "Other Sets";
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(set);
    });

    Object.entries(groups).forEach(([groupName, groupSets]) => {
      let optgroup = document.createElement("optgroup");
      optgroup.label = groupName;

      groupSets.forEach((set) => {
        let option = document.createElement("option");
        option.value = `set:${set.id}`;
        let extra = set.classroom_names ? ` (${set.classroom_names})` : "";
        option.textContent = `${set.title}${extra} - ${set.term_count} terms`;
        optgroup.appendChild(option);
      });

      studySelect.appendChild(optgroup);
    });
  } catch (err) {
    // Fallback to my-classrooms if needed
    try {
      let classrooms = await apiRequest("/my-classrooms");
      studySelect.innerHTML = "";
      classrooms.forEach((c) => {
        let opt = document.createElement("option");
        opt.value = `class:${c.id}`;
        opt.textContent = c.name;
        studySelect.appendChild(opt);
      });
    } catch {
      setStudentDashboardMessage(err.message);
    }
  }
}

document.getElementById("study-select-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let selectedVal = studySelect.value;

  if (!selectedVal) {
    return;
  }

  try {
    let studySet;
    if (selectedVal.startsWith("set:")) {
      let setId = selectedVal.replace("set:", "");
      studySet = await apiRequest(`/api/sets/${setId}/study`);
    } else if (selectedVal.startsWith("class:")) {
      let classroomId = selectedVal.replace("class:", "");
      studySet = await apiRequest(`/api/classrooms/${classroomId}/assignment`);
    } else {
      // Direct number or fallback
      try {
        studySet = await apiRequest(`/api/sets/${selectedVal}/study`);
      } catch {
        studySet = await apiRequest(`/api/classrooms/${selectedVal}/assignment`);
      }
    }

    showFlashcards(studySet.title, studySet.terms);
  } catch (err) {
    viewer.classList.add("hidden");
    setStudentDashboardMessage(err.message);
  }
});

export async function startStudyForSet(setId) {
  try {
    let studySet = await apiRequest(`/api/sets/${setId}/study`);
    showFlashcards(studySet.title, studySet.terms);
    document.querySelector('#student-tabs [data-target="panel-stu-study"]')?.click();
  } catch (err) {
    setStudentDashboardMessage(err.message);
  }
}

export function showFlashcards(title, termsList) {
  if (!termsList || termsList.length === 0) {
    setStudentDashboardMessage("This study set has no terms to display.");
    return;
  }
  terms = termsList;
  index = 0;
  showingDefinition = false;
  setTitle.textContent = title;
  viewer.classList.remove("hidden");
  viewer.scrollIntoView({ behavior: "smooth", block: "start" });
  renderCard();
}

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

