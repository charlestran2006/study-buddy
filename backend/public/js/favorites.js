import { apiRequest } from "./api.js";
import { setStudentDashboardMessage, escapeHtml } from "./dom.js";
import { showFlashcards, loadAllStudentSets } from "./flashcards.js";
import { startPracticeForSet } from "./practice.js";

let favoriteSetList = document.getElementById("favorite-set-list");

document.querySelector('#student-tabs [data-target="panel-stu-favorites"]')?.addEventListener("click", loadFavorites);

async function loadFavorites() {
  try {
    let sets = await apiRequest("/favorites");
    renderFavorites(sets);
  } catch (err) {
    setStudentDashboardMessage(err.message);
  }
}

function renderFavorites(sets) {
  favoriteSetList.innerHTML = "";

  if (sets.length === 0) {
    favoriteSetList.innerHTML = '<li class="empty-state">You haven\'t favorited any public sets yet.</li>';
    return;
  }

  sets.forEach((set) => {
    let item = document.createElement("li");
    item.className = "classroom-item";
    item.innerHTML = `
      <div class="classroom-name">${escapeHtml(set.title)}</div>
      <div class="classroom-meta">
        By ${escapeHtml(set.professor_username)} &middot;
        ${set.term_count} term${set.term_count === 1 ? "" : "s"}
      </div>
      <div class="set-actions">
        <button type="button" class="roster-toggle-button study-btn">Study</button>
        <button type="button" class="add-to-sets-button">+ Add to My Sets</button>
        <button type="button" class="favorite-toggle-button" title="Favorited">★</button>
      </div>
    `;

    item.querySelector(".study-btn").addEventListener("click", async (event) => {
      let button = event.target;
      button.disabled = true;

      try {
        let details = await apiRequest(`/public-sets/${set.id}`);
        showFlashcards(details.title, details.terms);
        document.querySelector('#student-tabs [data-target="panel-stu-study"]')?.click();
      } catch (err) {
        setStudentDashboardMessage(err.message);
      } finally {
        button.disabled = false;
      }
    });

    let addButton = item.querySelector(".add-to-sets-button");
    addButton.addEventListener("click", async () => {
      addButton.disabled = true;

      try {
        await apiRequest(`/public-sets/${set.id}/copy`, { method: "POST" });
        addButton.textContent = "Added ✓";
        setStudentDashboardMessage(`"${set.title}" added to your study sets.`, true);
        loadAllStudentSets();
      } catch (err) {
        setStudentDashboardMessage(err.message);
        addButton.disabled = false;
      }
    });

    item.querySelector(".favorite-toggle-button").addEventListener("click", async (event) => {
      let button = event.target;
      button.disabled = true;

      try {
        await apiRequest(`/favorites/${set.id}`, { method: "DELETE" });
        item.remove();
        loadAllStudentSets();
        if (favoriteSetList.children.length === 0) {
          renderFavorites([]);
        }
      } catch (err) {
        setStudentDashboardMessage(err.message);
        button.disabled = false;
      }
    });

    favoriteSetList.appendChild(item);
  });
}


