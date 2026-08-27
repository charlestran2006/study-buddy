import { apiRequest } from "./api.js";
import { setStudentDashboardMessage, escapeHtml } from "./dom.js";
import { registerStudentDashboardLoader } from "./auth.js";
import { startPracticeForSet } from "./practice.js";

let studentSetsList = document.getElementById("student-my-sets-list");
let viewer = document.getElementById("flashcard-viewer");
let setTitle = document.getElementById("flashcard-set-title");
let card = document.getElementById("flashcard");
let cardContent = document.getElementById("flashcard-content");
let counter = document.getElementById("flashcard-counter");
let closeBtn = document.getElementById("flashcard-close-btn");

let allLoadedSets = [];
let currentFilter = "all";
let terms = [];
let index = 0;
let showingDefinition = false;

registerStudentDashboardLoader(loadAllStudentSets);
document.querySelector('#student-tabs [data-target="panel-stu-study"]')?.addEventListener("click", loadAllStudentSets);

// Setup sub-tab filter clicks
document.querySelectorAll("#study-sub-tabs .sub-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#study-sub-tabs .sub-tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderFilteredSets();
  });
});

export async function loadAllStudentSets() {
  await loadStudentSetsList();
}

export async function loadStudentSetsList() {
  if (!studentSetsList) return;
  try {
    let sets = await apiRequest("/api/my-study-sets");
    allLoadedSets = sets || [];
    updateTabCounts();
    renderFilteredSets();
  } catch (err) {
    setStudentDashboardMessage(err.message);
  }
}

function updateTabCounts() {
  let countAll = allLoadedSets.length;
  let countClassroom = allLoadedSets.filter((s) => s.source_type === "Classroom Assignment").length;
  let countSaved = allLoadedSets.filter((s) => s.source_type === "My Saved Sets").length;
  let countFavorite = allLoadedSets.filter((s) => s.source_type === "Favorite").length;

  let elAll = document.getElementById("count-all");
  let elClass = document.getElementById("count-classroom");
  let elSaved = document.getElementById("count-saved");
  let elFav = document.getElementById("count-favorite");

  if (elAll) elAll.textContent = countAll;
  if (elClass) elClass.textContent = countClassroom;
  if (elSaved) elSaved.textContent = countSaved;
  if (elFav) elFav.textContent = countFavorite;
}

function renderFilteredSets() {
  if (!studentSetsList) return;
  studentSetsList.innerHTML = "";

  if (allLoadedSets.length === 0) {
    studentSetsList.innerHTML = `
      <li class="empty-state">
        You don't have any study sets in your collection yet.<br>
        <button type="button" class="tab-redirect-btn" style="margin-top: 10px;" onclick="document.querySelector('#student-tabs [data-target=\\'panel-stu-public\\']').click()">
          Explore Public Sets Library
        </button>
      </li>
    `;
    return;
  }

  if (currentFilter === "all") {
    let classroomSets = allLoadedSets.filter((s) => s.source_type === "Classroom Assignment");
    let savedSets = allLoadedSets.filter((s) => s.source_type === "My Saved Sets");
    let favSets = allLoadedSets.filter((s) => s.source_type === "Favorite");

    let renderedCount = 0;

    // 1. Classroom Assignments (split by classroom)
    if (classroomSets.length > 0) {
      renderedCount += classroomSets.length;
      let divider = document.createElement("li");
      divider.className = "section-divider";
      divider.innerHTML = `
        <span class="section-divider-title">Classroom Assignments</span>
        <div class="section-divider-line"></div>
      `;
      studentSetsList.appendChild(divider);

      renderClassroomGroupedSets(classroomSets, true);
    }

    // 2. My Saved Sets
    if (savedSets.length > 0) {
      renderedCount += savedSets.length;
      let divider = document.createElement("li");
      divider.className = "section-divider";
      divider.innerHTML = `
        <span class="section-divider-title">My Saved Sets</span>
        <div class="section-divider-line"></div>
      `;
      studentSetsList.appendChild(divider);

      savedSets.forEach((set) => {
        studentSetsList.appendChild(createSetCard(set, true));
      });
    }

    // 3. Favorites
    if (favSets.length > 0) {
      renderedCount += favSets.length;
      let divider = document.createElement("li");
      divider.className = "section-divider";
      divider.innerHTML = `
        <span class="section-divider-title">Favorites</span>
        <div class="section-divider-line"></div>
      `;
      studentSetsList.appendChild(divider);

      favSets.forEach((set) => {
        studentSetsList.appendChild(createSetCard(set, true));
      });
    }

    if (renderedCount === 0) {
      studentSetsList.innerHTML = '<li class="empty-state">No sets found.</li>';
    }
  } else if (currentFilter === "classroom") {
    let classroomSets = allLoadedSets.filter((s) => s.source_type === "Classroom Assignment");

    if (classroomSets.length === 0) {
      studentSetsList.innerHTML = `
        <li class="empty-state">
          No classroom assignments yet. Join a classroom to see assigned decks.<br>
          <button type="button" class="tab-redirect-btn" style="margin-top: 10px;" onclick="document.querySelector('#student-tabs [data-target=\\'panel-stu-classrooms\\']').click()">
            Open Classrooms
          </button>
        </li>
      `;
      return;
    }

    renderClassroomGroupedSets(classroomSets, false);
  } else {
    let filterKey = currentFilter === "saved" ? "My Saved Sets" : "Favorite";
    let filtered = allLoadedSets.filter((s) => s.source_type === filterKey);

    if (filtered.length === 0) {
      let emptyMsg = currentFilter === "saved"
        ? "No saved personal sets yet. Browse Public Sets to add decks to your sets."
        : "No favorited sets yet. Star sets from the Public Library to see them here.";

      studentSetsList.innerHTML = `
        <li class="empty-state">
          ${emptyMsg}<br>
          <button type="button" class="tab-redirect-btn" style="margin-top: 10px;" onclick="document.querySelector('#student-tabs [data-target=\\'panel-stu-public\\']').click()">
            Explore Public Sets
          </button>
        </li>
      `;
      return;
    }

    filtered.forEach((set) => {
      studentSetsList.appendChild(createSetCard(set, true));
    });
  }
}

function renderClassroomGroupedSets(classroomSets, isSubgroup = false) {
  let classMap = {};
  classroomSets.forEach((set) => {
    let cNames = set.classroom_names ? set.classroom_names.split(", ") : ["General Classroom"];
    cNames.forEach((cName) => {
      let trimmed = cName.trim();
      if (!classMap[trimmed]) {
        classMap[trimmed] = [];
      }
      if (!classMap[trimmed].some((s) => s.id === set.id)) {
        classMap[trimmed].push(set);
      }
    });
  });

  Object.entries(classMap).forEach(([className, setsInClass]) => {
    let header = document.createElement("li");
    header.className = isSubgroup ? "classroom-group-header" : "section-divider";
    header.innerHTML = `
      <span class="${isSubgroup ? "classroom-group-title" : "section-divider-title"}">${escapeHtml(className)}</span>
      <div class="section-divider-line"></div>
    `;
    studentSetsList.appendChild(header);

    setsInClass.forEach((set) => {
      studentSetsList.appendChild(createSetCard(set, false));
    });
  });
}

function createSetCard(set, showClass = true) {
  let item = document.createElement("li");
  item.className = "classroom-item set-item";

  let classroomInfo = showClass && set.classroom_names ? ` &middot; Class: ${escapeHtml(set.classroom_names)}` : "";
  let authorInfo = set.author ? `By ${escapeHtml(set.author)}` : "";

  item.innerHTML = `
    <div class="set-info" style="flex: 1; min-width: 200px;">
      <div class="classroom-name">${escapeHtml(set.title)}</div>
      <div class="classroom-meta">
        ${authorInfo}${classroomInfo} &middot;
        ${set.term_count} term${set.term_count === 1 ? "" : "s"}
      </div>
      ${set.description ? `<div style="font-size: 0.825rem; color: var(--text-muted); margin-top: 4px;">${escapeHtml(set.description)}</div>` : ""}
    </div>
    <div class="set-actions">
      <button type="button" class="roster-toggle-button study-btn">Study Cards</button>
      <button type="button" class="favorite-toggle-button" title="${set.is_favorited ? "Favorited" : "Favorite"}">${set.is_favorited ? "★" : "☆"}</button>
      ${set.is_owner ? '<button type="button" class="classroom-delete-button delete-btn">Remove</button>' : ''}
    </div>
  `;

  item.querySelector(".study-btn").addEventListener("click", () => {
    startStudyForSet(set.id);
  });

  let favBtn = item.querySelector(".favorite-toggle-button");
  favBtn?.addEventListener("click", async () => {
    favBtn.disabled = true;
    try {
      if (set.is_favorited) {
        await apiRequest(`/favorites/${set.id}`, { method: "DELETE" });
        set.is_favorited = false;
        favBtn.textContent = "☆";
        favBtn.title = "Favorite";
      } else {
        await apiRequest("/favorites", { method: "POST", body: JSON.stringify({ set_id: set.id }) });
        set.is_favorited = true;
        favBtn.textContent = "★";
        favBtn.title = "Favorited";
      }
      loadAllStudentSets();
    } catch (err) {
      setStudentDashboardMessage(err.message);
    } finally {
      favBtn.disabled = false;
    }
  });

  if (set.is_owner) {
    item.querySelector(".delete-btn").addEventListener("click", async () => {
      if (!confirm(`Remove "${set.title}" from your study sets?`)) return;
      try {
        await apiRequest(`/sets/${set.id}`, { method: "DELETE" });
        setStudentDashboardMessage(`Removed "${set.title}".`, true);
        loadAllStudentSets();
      } catch (err) {
        setStudentDashboardMessage(err.message);
      }
    });
  }

  return item;
}

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

card?.addEventListener("click", () => {
  showingDefinition = !showingDefinition;
  renderCard();
});

closeBtn?.addEventListener("click", () => {
  viewer.classList.add("hidden");
});

document.getElementById("flashcard-prev")?.addEventListener("click", () => {
  index = (index - 1 + terms.length) % terms.length;
  showingDefinition = false;
  renderCard();
});

document.getElementById("flashcard-next")?.addEventListener("click", () => {
  index = (index + 1) % terms.length;
  showingDefinition = false;
  renderCard();
});



