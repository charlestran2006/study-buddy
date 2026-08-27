import { apiRequest } from "./api.js";
import { setDashboardMessage, escapeHtml } from "./dom.js";
import { loadSets } from "./sets.js";

let favoriteSetList = document.getElementById("prof-favorite-set-list");

document.querySelector('#professor-tabs [data-target="panel-prof-favorites"]').addEventListener("click", loadFavorites);

async function loadFavorites() {
  try {
    let sets = await apiRequest("/favorites");
    renderFavorites(sets);
  } catch (err) {
    setDashboardMessage(err.message);
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
      <button type="button" class="favorite-toggle-button" title="Favorited">★</button>
      <button type="button" class="add-to-sets-button">+ Add to My Sets</button>
    `;

    item.querySelector(".favorite-toggle-button").addEventListener("click", async (event) => {
      let button = event.target;
      button.disabled = true;

      try {
        await apiRequest(`/favorites/${set.id}`, { method: "DELETE" });
        item.remove();
        if (favoriteSetList.children.length === 0) {
          renderFavorites([]);
        }
      } catch (err) {
        setDashboardMessage(err.message);
        button.disabled = false;
      }
    });

    item.querySelector(".add-to-sets-button").addEventListener("click", async (event) => {
      let button = event.target;
      button.disabled = true;

      try {
        await apiRequest(`/public-sets/${set.id}/copy`, { method: "POST" });
        button.textContent = "Added ✓";
        setDashboardMessage(`"${set.title}" added to your study sets.`, true);
        loadSets();
      } catch (err) {
        setDashboardMessage(err.message);
        button.disabled = false;
      }
    });

    favoriteSetList.appendChild(item);
  });
}
