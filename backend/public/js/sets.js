import { apiRequest, submitForm } from "./api.js";
import { setDashboardMessage, escapeHtml } from "./dom.js";
import { openAnalytics } from "./analytics.js";

let termRows = document.getElementById("term-rows");
let assignSetSelect = document.getElementById("assign-set-select");
let hostSetSelect = document.getElementById("host-set-select");
let setList = document.getElementById("set-list");

function createTermRow(container, term) {
  let row = document.createElement("div");
  row.className = "term-row";
  row.innerHTML = `
    <input type="text" class="term-input" placeholder="Term" required />
    <input type="text" class="definition-input" placeholder="Definition" required />
    <button type="button" aria-label="Remove term">&times;</button>
  `;

  if (term) {
    row.querySelector(".term-input").value = term.term;
    row.querySelector(".definition-input").value = term.definition;
    if (term.id) {
      row.dataset.termId = term.id;
    }
  }

  row.querySelector("button").addEventListener("click", () => row.remove());
  container.appendChild(row);
  return row;
}

function readTermRows(container) {
  return Array.from(container.querySelectorAll(".term-row"))
    .map((row) => ({
      id: row.dataset.termId ? Number(row.dataset.termId) : undefined,
      term: row.querySelector(".term-input").value.trim(),
      definition: row.querySelector(".definition-input").value.trim(),
    }))
    .filter((t) => t.term && t.definition);
}

export function addTermRow() {
  createTermRow(termRows);
}

document.getElementById("add-term-row").addEventListener("click", addTermRow);
addTermRow();
addTermRow();

export async function loadSets() {
  try {
    let sets = await apiRequest("/sets");
    renderSets(sets);
  } catch (err) {
    setDashboardMessage(err.message);
  }
}

function renderSets(sets) {
  assignSetSelect.innerHTML = "";
  hostSetSelect.innerHTML = "";
  setList.innerHTML = "";

  if (sets.length === 0) {
    setList.innerHTML = '<li class="empty-state">No study sets yet.</li>';
  }

  sets.forEach((set) => {
    let option = document.createElement("option");
    option.value = set.id;
    option.textContent = set.title;
    assignSetSelect.appendChild(option);

    let hostOption = document.createElement("option");
    hostOption.value = set.id;
    hostOption.textContent = set.title;
    hostSetSelect.appendChild(hostOption);

    let item = document.createElement("li");
    item.className = "classroom-item set-item";
    item.innerHTML = `
      <div>
        <div class="set-name">${escapeHtml(set.title)}</div>
        <div class="set-meta">${escapeHtml(set.description || "")}</div>
      </div>
    `;

    let analyticsButton = document.createElement("button");
    analyticsButton.type = "button";
    analyticsButton.className = "analytics-link-button";
    analyticsButton.textContent = "Struggle Analytics";
    analyticsButton.addEventListener("click", () => openAnalytics(set.id, set.title));
    item.appendChild(analyticsButton);

    let editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "roster-toggle-button";
    editButton.textContent = "Edit";
    item.appendChild(editButton);

    let editContainer = document.createElement("div");
    editContainer.className = "set-edit-container hidden";
    item.appendChild(editContainer);

    editButton.addEventListener("click", async () => {
      if (!editContainer.classList.contains("hidden")) {
        editContainer.classList.add("hidden");
        editContainer.innerHTML = "";
        editButton.textContent = "Edit";
        return;
      }

      editButton.disabled = true;
      try {
        let details = await apiRequest(`/sets/${set.id}`);
        renderEditForm(editContainer, details, () => {
          editContainer.classList.add("hidden");
          editContainer.innerHTML = "";
          editButton.textContent = "Edit";
          loadSets();
        });
        editContainer.classList.remove("hidden");
        editButton.textContent = "Cancel";
      } catch (err) {
        setDashboardMessage(err.message);
      } finally {
        editButton.disabled = false;
      }
    });

    setList.appendChild(item);
  });
}

function renderEditForm(container, set, onSaved) {
  container.innerHTML = `
    <form class="panel-form edit-set-form">
      <label>Title</label>
      <input type="text" class="edit-title-input" required />

      <label>Description</label>
      <textarea class="edit-description-input" rows="2"></textarea>

      <div class="edit-term-rows term-rows"></div>
      <button type="button" class="edit-add-term-row">+ Add Term</button>

      <label class="checkbox-option">
        <input type="checkbox" class="edit-is-public-input" />
        Make this set public (visible to all students)
      </label>

      <button type="submit">Save Changes</button>
    </form>
  `;

  let form = container.querySelector(".edit-set-form");
  let editTermRows = container.querySelector(".edit-term-rows");

  form.querySelector(".edit-title-input").value = set.title;
  form.querySelector(".edit-description-input").value = set.description || "";
  form.querySelector(".edit-is-public-input").checked = Boolean(set.is_public);

  set.terms.forEach((term) => createTermRow(editTermRows, term));

  form.querySelector(".edit-add-term-row").addEventListener("click", () => createTermRow(editTermRows));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let button = form.querySelector("button[type='submit']");
    button.disabled = true;

    let terms = readTermRows(editTermRows);

    if (terms.length === 0) {
      setDashboardMessage("Add at least one term and definition.");
      button.disabled = false;
      return;
    }

    try {
      await apiRequest(`/sets/${set.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: form.querySelector(".edit-title-input").value,
          description: form.querySelector(".edit-description-input").value,
          terms,
          is_public: form.querySelector(".edit-is-public-input").checked,
        }),
      });
      setDashboardMessage("Study set updated.", true);
      onSaved();
    } catch (err) {
      setDashboardMessage(err.message);
      button.disabled = false;
    }
  });
}

document.getElementById("create-set-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button[type='submit']");
  button.disabled = true;

  let terms = readTermRows(termRows);

  if (terms.length === 0) {
    setDashboardMessage("Add at least one term and definition.");
    button.disabled = false;
    return;
  }

  try {
    await submitForm("/sets", {
      title: form.title.value,
      description: form.description.value,
      terms,
      is_public: form.is_public.checked,
    });
    form.reset();
    termRows.innerHTML = "";
    addTermRow();
    addTermRow();
    setDashboardMessage("Study set created.", true);
    loadSets();
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});
