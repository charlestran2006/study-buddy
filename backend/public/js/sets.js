import { apiRequest, submitForm } from "./api.js";
import { setDashboardMessage } from "./dom.js";

let termRows = document.getElementById("term-rows");
let assignSetSelect = document.getElementById("assign-set-select");
let hostSetSelect = document.getElementById("host-set-select");

export function addTermRow() {
  let row = document.createElement("div");
  row.className = "term-row";
  row.innerHTML = `
    <input type="text" class="term-input" placeholder="Term" required />
    <input type="text" class="definition-input" placeholder="Definition" required />
    <button type="button" aria-label="Remove term">&times;</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  termRows.appendChild(row);
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

  sets.forEach((set) => {
    let option = document.createElement("option");
    option.value = set.id;
    option.textContent = set.title;
    assignSetSelect.appendChild(option);

    let hostOption = document.createElement("option");
    hostOption.value = set.id;
    hostOption.textContent = set.title;
    hostSetSelect.appendChild(hostOption);
  });
}

document.getElementById("create-set-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button[type='submit']");
  button.disabled = true;

  let terms = Array.from(termRows.querySelectorAll(".term-row"))
    .map((row) => ({
      term: row.querySelector(".term-input").value.trim(),
      definition: row.querySelector(".definition-input").value.trim(),
    }))
    .filter((t) => t.term && t.definition);

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
