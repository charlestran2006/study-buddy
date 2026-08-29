import { apiRequest } from "./api.js";
import { setStudentDashboardMessage, escapeHtml } from "./dom.js";
import { registerStudentDashboardLoader } from "./auth.js";
import { startPracticeForSet } from "./practice.js";

let studentSetsList = document.getElementById("student-my-sets-list");
let collectionView = document.getElementById("study-collection-view");
let viewer = document.getElementById("flashcard-viewer");
let setTitle = document.getElementById("flashcard-set-title");
let setSubtitle = document.getElementById("flashcard-deck-subtitle");
let progressBar = document.getElementById("flashcard-progress-bar");
let counter = document.getElementById("flashcard-counter");
let card = document.getElementById("flashcard");
let cardWrapper = document.getElementById("flashcard-wrapper");
let termText = document.getElementById("flashcard-term-text");
let defText = document.getElementById("flashcard-def-text");
let prevBtn = document.getElementById("flashcard-prev");
let nextBtn = document.getElementById("flashcard-next");
let closeBtn = document.getElementById("flashcard-close-btn");
let shuffleBtn = document.getElementById("flashcard-shuffle-btn");
let completeCard = document.getElementById("flashcard-complete-card");
let completeText = document.getElementById("flashcard-complete-text");
let restartBtn = document.getElementById("flashcard-restart-btn");
let shuffleRestartBtn = document.getElementById("flashcard-shuffle-restart-btn");
let doneBtn = document.getElementById("flashcard-done-btn");
let navControls = document.getElementById("flashcard-nav-controls");

let allLoadedSets = [];
let currentFilter = "all";
let terms = [];
let originalTerms = [];
let index = 0;
let showingDefinition = false;

registerStudentDashboardLoader(loadAllStudentSets);
document.querySelector('#student-tabs [data-target="panel-stu-study"]')?.addEventListener("click", () => {
  closeStudyDeck();
  loadAllStudentSets();
});

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

export function switchToStudyTab() {
  let tabs = document.querySelectorAll("#student-tabs .tab");
  let studyTab = document.querySelector('#student-tabs [data-target="panel-stu-study"]');
  tabs.forEach((t) => t.classList.remove("active"));
  studyTab?.classList.add("active");
  document.querySelectorAll(".dashboard-grid .panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== "panel-stu-study");
  });
}

export async function startStudyForSet(setId) {
  try {
    let studySet = await apiRequest(`/api/sets/${setId}/study`);
    switchToStudyTab();
    showFlashcards(studySet.title, studySet.terms);
  } catch (err) {
    setStudentDashboardMessage(err.message);
  }
}

export function showFlashcards(title, termsList) {
  if (!termsList || termsList.length === 0) {
    setStudentDashboardMessage("This study set has no terms to display.");
    return;
  }
  switchToStudyTab();
  originalTerms = [...termsList];
  terms = [...termsList];
  index = 0;
  showingDefinition = false;

  setTitle.textContent = title;
  setSubtitle.textContent = `${terms.length} term${terms.length === 1 ? "" : "s"} in deck`;

  collectionView?.classList.add("hidden");
  viewer?.classList.remove("hidden");
  viewer?.scrollIntoView({ behavior: "smooth", block: "start" });

  renderCard();
}

export function closeStudyDeck() {
  viewer?.classList.add("hidden");
  collectionView?.classList.remove("hidden");
}

function renderCard() {
  if (index >= terms.length) {
    // Show completion screen
    cardWrapper?.classList.add("hidden");
    navControls?.classList.add("hidden");
    completeCard?.classList.remove("hidden");
    if (progressBar) progressBar.style.width = "100%";
    if (counter) counter.textContent = `Completed ${terms.length} of ${terms.length}`;
    if (completeText) {
      completeText.textContent = `You've reviewed all ${terms.length} terms in "${setTitle.textContent}".`;
    }
    return;
  }

  cardWrapper?.classList.remove("hidden");
  navControls?.classList.remove("hidden");
  completeCard?.classList.add("hidden");

  let term = terms[index];
  if (termText) termText.textContent = term.term;
  if (defText) defText.textContent = term.definition;

  card?.classList.toggle("flipped", showingDefinition);

  if (counter) {
    counter.textContent = `Card ${index + 1} of ${terms.length}`;
  }

  if (progressBar) {
    let pct = Math.round(((index + 1) / terms.length) * 100);
    progressBar.style.width = `${pct}%`;
  }

  if (prevBtn) {
    prevBtn.disabled = index === 0;
  }
  if (nextBtn) {
    nextBtn.textContent = index === terms.length - 1 ? "Finish Deck ✓" : "Next →";
  }
}

function flipCard() {
  showingDefinition = !showingDefinition;
  card?.classList.toggle("flipped", showingDefinition);
}

function nextCard() {
  if (index < terms.length - 1) {
    index++;
    showingDefinition = false;
    card?.classList.remove("flipped");
    renderCard();
  } else {
    index = terms.length; // triggers complete screen
    renderCard();
  }
}

function prevCard() {
  if (index > 0) {
    index--;
    showingDefinition = false;
    card?.classList.remove("flipped");
    renderCard();
  }
}

function shuffleDeck() {
  let array = [...terms];
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  terms = array;
  index = 0;
  showingDefinition = false;
  card?.classList.remove("flipped");
  renderCard();
}

function restartDeck(shouldShuffle = false) {
  if (shouldShuffle) {
    shuffleDeck();
  } else {
    terms = [...originalTerms];
    index = 0;
    showingDefinition = false;
    card?.classList.remove("flipped");
    renderCard();
  }
}

// Event Listeners
cardWrapper?.addEventListener("click", flipCard);
nextBtn?.addEventListener("click", nextCard);
prevBtn?.addEventListener("click", prevCard);
closeBtn?.addEventListener("click", closeStudyDeck);
doneBtn?.addEventListener("click", closeStudyDeck);
shuffleBtn?.addEventListener("click", shuffleDeck);
restartBtn?.addEventListener("click", () => restartDeck(false));
shuffleRestartBtn?.addEventListener("click", () => restartDeck(true));

// Keyboard Navigation
window.addEventListener("keydown", (e) => {
  // Only handle shortcuts when flashcard viewer is active and visible
  if (!viewer || viewer.classList.contains("hidden")) return;
  if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;

  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    flipCard();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    nextCard();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    prevCard();
  } else if (e.key === "s" || e.key === "S") {
    shuffleDeck();
  } else if (e.key === "Escape") {
    closeStudyDeck();
  }
});



