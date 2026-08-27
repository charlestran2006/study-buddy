import { apiRequest } from "./api.js";
import { setDashboardMessage, escapeHtml } from "./dom.js";
import { registerProfessorDashboardLoader } from "./auth.js";
import { loadSets } from "./sets.js";

let publicSetList = document.getElementById("prof-public-set-list");

registerProfessorDashboardLoader(loadPublicSets);

async function loadPublicSets() {
  try {
    let sets = await apiRequest("/public-sets");
    renderPublicSets(sets);
  } catch (err) {
    setDashboardMessage(err.message);
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
      <button type="button" class="roster-toggle-button">View Terms</button>
      <button type="button" class="favorite-toggle-button" title="${set.is_favorited ? "Favorited" : "Favorite"}">${set.is_favorited ? "★" : "☆"}</button>
      <button type="button" class="add-to-sets-button">+ Add to My Sets</button>
      <ul class="roster-list hidden"></ul>
    `;

    let viewButton = item.querySelector(".roster-toggle-button");
    let termList = item.querySelector(".roster-list");
    let termsLoaded = false;

    viewButton.addEventListener("click", async () => {
      let isHidden = termList.classList.contains("hidden");

      if (!isHidden) {
        termList.classList.add("hidden");
        viewButton.textContent = "View Terms";
        return;
      }

      if (!termsLoaded) {
        viewButton.disabled = true;
        try {
          let details = await apiRequest(`/public-sets/${set.id}`);
          renderTerms(termList, details.terms);
          termsLoaded = true;
        } catch (err) {
          setDashboardMessage(err.message);
          return;
        } finally {
          viewButton.disabled = false;
        }
      }

      termList.classList.remove("hidden");
      viewButton.textContent = "Hide Terms";
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
        setDashboardMessage(err.message);
      } finally {
        favoriteButton.disabled = false;
      }
    });

    let addButton = item.querySelector(".add-to-sets-button");
    addButton.addEventListener("click", async () => {
      addButton.disabled = true;

      try {
        await apiRequest(`/public-sets/${set.id}/copy`, { method: "POST" });
        addButton.textContent = "Added ✓";
        setDashboardMessage(`"${set.title}" added to your study sets.`, true);
        loadSets();
      } catch (err) {
        setDashboardMessage(err.message);
        addButton.disabled = false;
      }
    });

    publicSetList.appendChild(item);
  });
}

function renderTerms(termList, terms) {
  termList.innerHTML = "";

  terms.forEach((term) => {
    let item = document.createElement("li");
    item.className = "roster-item";
    item.innerHTML = `
      <span class="roster-name">${escapeHtml(term.term)}</span>
      <span class="roster-email">${escapeHtml(term.definition)}</span>
    `;
    termList.appendChild(item);
  });
}
