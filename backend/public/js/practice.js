import { apiRequest } from "./api.js";
import { setStudentDashboardMessage } from "./dom.js";
import { registerStudentDashboardLoader } from "./auth.js";

let practiceSelect = document.getElementById("practice-classroom-select");
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

registerStudentDashboardLoader(loadPracticeSetOptions);

export async function loadPracticeSetOptions() {
  try {
    let sets = await apiRequest("/api/my-study-sets");
    practiceSelect.innerHTML = "";

    if (!sets || sets.length === 0) {
      let option = document.createElement("option");
      option.value = "";
      option.textContent = "No study sets available yet";
      practiceSelect.appendChild(option);
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

      practiceSelect.appendChild(optgroup);
    });
  } catch (err) {
    try {
      let classrooms = await apiRequest("/my-classrooms");
      practiceSelect.innerHTML = "";
      classrooms.forEach((c) => {
        let opt = document.createElement("option");
        opt.value = `class:${c.id}`;
        opt.textContent = c.name;
        practiceSelect.appendChild(opt);
      });
    } catch {
      setStudentDashboardMessage(err.message);
    }
  }
}

selectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let selectedVal = practiceSelect.value;

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
      try {
        studySet = await apiRequest(`/api/sets/${selectedVal}/study`);
      } catch {
        studySet = await apiRequest(`/api/classrooms/${selectedVal}/assignment`);
      }
    }

    startPracticeWithTerms(studySet.terms);
  } catch (err) {
    quiz.classList.add("hidden");
    setStudentDashboardMessage(err.message);
  }
});

export async function startPracticeForSet(setId) {
  try {
    let studySet = await apiRequest(`/api/sets/${setId}/study`);
    startPracticeWithTerms(studySet.terms);
    document.querySelector('#student-tabs [data-target="panel-stu-practice"]')?.click();
  } catch (err) {
    quiz.classList.add("hidden");
    setStudentDashboardMessage(err.message);
  }
}

export function startPracticeWithTerms(termsList) {
  if (!termsList || termsList.length < 2) {
    setStudentDashboardMessage("Need at least 2 terms in the set to practice.");
    return;
  }

  terms = termsList;
  order = shuffle(terms.map((_, i) => i));
  index = 0;
  correctCount = 0;
  selectForm.classList.add("hidden");
  summary.classList.add("hidden");
  quiz.classList.remove("hidden");
  showQuestion();
}

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
    finishPractice(false);
  }
}

function finishPractice(endedEarly = false) {
  quiz.classList.add("hidden");
  summary.classList.remove("hidden");

  let answered = index;
  if (endedEarly) {
    if (answered === 0) {
      summaryText.textContent = "Practice ended before answering any questions.";
    } else {
      let pct = Math.round((correctCount / answered) * 100);
      summaryText.textContent = `Practice ended early. You answered ${correctCount} out of ${answered} question${answered === 1 ? "" : "s"} correctly (${pct}%).`;
    }
  } else {
    let totalPct = Math.round((correctCount / order.length) * 100);
    summaryText.textContent = `You completed all questions! Final score: ${correctCount} out of ${order.length} correct (${totalPct}%).`;
  }
}

document.getElementById("practice-end-early-btn")?.addEventListener("click", () => {
  if (index === 0 && correctCount === 0) {
    quiz.classList.add("hidden");
    selectForm.classList.remove("hidden");
    return;
  }
  finishPractice(true);
});

document.getElementById("practice-restart-button")?.addEventListener("click", () => {
  summary.classList.add("hidden");
  startPracticeWithTerms(terms);
});

document.getElementById("practice-choose-set-button")?.addEventListener("click", () => {
  summary.classList.add("hidden");
  selectForm.classList.remove("hidden");
});

