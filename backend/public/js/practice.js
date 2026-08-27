import { apiRequest } from "./api.js";
import { setStudentDashboardMessage } from "./dom.js";
import { registerStudentDashboardLoader } from "./auth.js";

let classroomSelect = document.getElementById("practice-classroom-select");
let selectForm = document.getElementById("practice-select-form");
let quiz = document.getElementById("practice-quiz");
let summary = document.getElementById("practice-summary");
let progressText = document.getElementById("practice-progress-text");
let scoreText = document.getElementById("practice-score-text");
let termEl = document.getElementById("practice-term");
let choicesEl = document.getElementById("practice-choices");
let summaryText = document.getElementById("practice-summary-text");

let terms = [];
let order = [];
let index = 0;
let correctCount = 0;
let answering = false;

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

selectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let classroomId = classroomSelect.value;

  if (!classroomId) {
    return;
  }

  try {
    let studySet = await apiRequest(`/api/classrooms/${classroomId}/assignment`);

    if (studySet.terms.length < 2) {
      setStudentDashboardMessage("Need at least 2 terms in the set to practice.");
      return;
    }

    terms = studySet.terms;
    order = shuffle(terms.map((_, i) => i));
    index = 0;
    correctCount = 0;
    selectForm.classList.add("hidden");
    summary.classList.add("hidden");
    quiz.classList.remove("hidden");
    showQuestion();
  } catch (err) {
    quiz.classList.add("hidden");
    setStudentDashboardMessage(err.message);
  }
});

function shuffle(array) {
  let copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function showQuestion() {
  answering = true;
  let term = terms[order[index]];
  progressText.textContent = `Question ${index + 1} of ${order.length}`;
  scoreText.textContent = `Score: ${correctCount}/${index}`;
  termEl.textContent = term.term;

  let distractorPool = terms.filter((t) => t.id !== term.id);
  let distractors = shuffle(distractorPool).slice(0, Math.min(3, distractorPool.length));
  let choices = shuffle([term, ...distractors]);

  choicesEl.innerHTML = "";
  choices.forEach((choice) => {
    let button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = choice.definition;
    button.addEventListener("click", () => selectAnswer(button, choice, term));
    choicesEl.appendChild(button);
  });
}

async function selectAnswer(button, choice, correctTerm) {
  if (!answering) {
    return;
  }
  answering = false;

  let isCorrect = choice.id === correctTerm.id;
  button.classList.add("selected", isCorrect ? "correct" : "incorrect");

  Array.from(choicesEl.children).forEach((btn) => {
    btn.disabled = true;
    if (!isCorrect && btn.textContent === correctTerm.definition) {
      btn.classList.add("correct");
    }
  });

  if (isCorrect) {
    correctCount += 1;
  }

  apiRequest("/progress", {
    method: "POST",
    body: JSON.stringify({ term_id: correctTerm.id, correct: isCorrect }),
  }).catch(() => {});

  await new Promise((resolve) => setTimeout(resolve, 900));

  index += 1;
  if (index < order.length) {
    showQuestion();
  } else {
    finishPractice();
  }
}

function finishPractice() {
  quiz.classList.add("hidden");
  summary.classList.remove("hidden");
  let pct = Math.round((correctCount / order.length) * 100);
  summaryText.textContent = `You got ${correctCount} out of ${order.length} correct (${pct}%).`;
}

document.getElementById("practice-restart-button").addEventListener("click", () => {
  summary.classList.add("hidden");
  selectForm.classList.remove("hidden");
});
