import { apiRequest } from "./api.js";
import { setStudentDashboardMessage, escapeHtml } from "./dom.js";
import { registerStudentDashboardLoader } from "./auth.js";
import { showFlashcards } from "./flashcards.js";
import { startPracticeForSet } from "./practice.js";

let publicSetList = document.getElementById("public-set-list");

registerStudentDashboardLoader(loadPublicSets);

async function loadPublicSets() {
  try {
    let sets = await apiRequest("/public-sets");
    renderPublicSets(sets);
  } catch (err) {
    setStudentDashboardMessage(err.message);
  }
}

function renderPublicSets(sets) {
  publicSetList.innerHTML = "";

  if (sets.length === 0) {
    publicSetList.innerHTML = '<li class="empty-state">No public study sets yet.</li>';
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
      <button type="button" class="roster-toggle-button study-btn">Study</button>
      <button type="button" class="roster-toggle-button practice-btn">Practice</button>
      <button type="button" class="favorite-toggle-button" title="${set.is_favorited ? "Favorited" : "Favorite"}">${set.is_favorited ? "★" : "☆"}</button>
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

    item.querySelector(".practice-btn").addEventListener("click", async (event) => {
      let button = event.target;
      button.disabled = true;

      try {
        await startPracticeForSet(set.id);
      } catch (err) {
        setStudentDashboardMessage(err.message);
      } finally {
        button.disabled = false;
      }
    });

    let favoriteButton = item.querySelector(".favorite-toggle-button");
    favoriteButton.addEventListener("click", async () => {
      favoriteButton.disabled = true;

      try {
        if (set.is_favorited) {
          await apiRequest(`/favorites/${set.id}`, { method: "DELETE" });
          set.is_favorited = false;
        } else {
          await apiRequest("/favorites", { method: "POST", body: JSON.stringify({ set_id: set.id }) });
          set.is_favorited = true;
        }
        favoriteButton.textContent = set.is_favorited ? "★" : "☆";
        favoriteButton.title = set.is_favorited ? "Favorited" : "Favorite";
      } catch (err) {
        setStudentDashboardMessage(err.message);
      } finally {
        favoriteButton.disabled = false;
      }
    });

    publicSetList.appendChild(item);
  });
}

