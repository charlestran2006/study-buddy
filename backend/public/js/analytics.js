import { apiRequest } from "./api.js";
import { dashboardView, analyticsView, escapeHtml } from "./dom.js";

let analyticsSetTitle = document.getElementById("analytics-set-title");
let analyticsMessage = document.getElementById("analytics-message");
let analyticsGameList = document.getElementById("analytics-game-list");
let analyticsStudentSelect = document.getElementById("analytics-student-select");
let analyticsHeatmapList = document.getElementById("analytics-heatmap-list");
let analyticsHeatmapChartCanvas = document.getElementById("analytics-heatmap-chart");
let analyticsBackButton = document.getElementById("analytics-back-button");

let currentSetId = null;
let currentGameId = null;
let heatmapChart = null;

const ACCURACY_COLORS = {
  notAsked: "#6b7280",
  low: "#e21b3c",
  mid: "#d89e00",
  high: "#26890c",
};

function barColorForAccuracy(accuracyPct) {
  if (accuracyPct === null) return ACCURACY_COLORS.notAsked;
  if (accuracyPct < 50) return ACCURACY_COLORS.low;
  if (accuracyPct <= 75) return ACCURACY_COLORS.mid;
  return ACCURACY_COLORS.high;
}

function setAnalyticsMessage(text, isSuccess) {
  analyticsMessage.textContent = text;
  analyticsMessage.classList.toggle("success", Boolean(isSuccess));
}

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString();
}

async function loadRosterForGames(games) {
  let classrooms = new Map();
  games.forEach((game) => {
    if (!classrooms.has(game.classroom_id)) {
      classrooms.set(game.classroom_id, game.classroom_name);
    }
  });

  let students = new Map();

  await Promise.all(
    Array.from(classrooms.keys()).map(async (classroomId) => {
      try {
        let classroom = await apiRequest(`/classrooms/${classroomId}`);
        classroom.students.forEach((student) => {
          students.set(student.id, student.username);
        });
      } catch (err) {
      }
    })
  );

  return Array.from(students.entries())
    .map(([id, username]) => ({ id, username }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

function renderGameList(games) {
  analyticsGameList.innerHTML = "";

  let allTimeItem = document.createElement("li");
  allTimeItem.className = "classroom-item game-list-item selected";
  allTimeItem.innerHTML = `<div class="classroom-name">All-time (combined)</div>`;
  allTimeItem.addEventListener("click", () => selectGame(null, allTimeItem));
  analyticsGameList.appendChild(allTimeItem);

  if (games.length === 0) {
    let empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No games have been played from this set yet.";
    analyticsGameList.appendChild(empty);
    return;
  }

  games.forEach((game) => {
    let item = document.createElement("li");
    item.className = "classroom-item game-list-item";
    item.dataset.gameId = game.id;
    item.innerHTML = `
      <div class="classroom-name">${escapeHtml(formatDateTime(game.created_at))}</div>
      <div class="classroom-meta">
        ${escapeHtml(game.classroom_name)} &middot; ${game.status} &middot;
        ${game.player_count} player${game.player_count === 1 ? "" : "s"}
      </div>
    `;
    item.addEventListener("click", () => selectGame(game.id, item));
    analyticsGameList.appendChild(item);
  });
}

function selectGame(gameId, item) {
  currentGameId = gameId;
  analyticsGameList.querySelectorAll(".game-list-item").forEach((el) => {
    el.classList.remove("selected");
  });
  item.classList.add("selected");
  loadHeatmap();
}

function renderStudentSelect(students) {
  analyticsStudentSelect.innerHTML = "";

  let wholeClassOption = document.createElement("option");
  wholeClassOption.value = "";
  wholeClassOption.textContent = "Whole class";
  analyticsStudentSelect.appendChild(wholeClassOption);

  students.forEach((student) => {
    let option = document.createElement("option");
    option.value = student.id;
    option.textContent = student.username;
    analyticsStudentSelect.appendChild(option);
  });
}

function renderHeatmapChart(rows) {
  if (heatmapChart) {
    heatmapChart.destroy();
    heatmapChart = null;
  }

  if (rows.length === 0) return;

  analyticsHeatmapChartCanvas.parentElement.style.height = `${Math.max(120, rows.length * 44)}px`;

  heatmapChart = new Chart(analyticsHeatmapChartCanvas, {
    type: "bar",
    data: {
      labels: rows.map((row) => `${row.term} (n=${row.attempts})`),
      datasets: [
        {
          data: rows.map((row) => (row.accuracy_pct === null ? 0 : Math.max(row.accuracy_pct, 3))),
          backgroundColor: rows.map((row) => barColorForAccuracy(row.accuracy_pct)),
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: { callback: (value) => `${value}%` },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              let row = rows[context.dataIndex];
              return row.accuracy_pct === null
                ? "Not asked yet"
                : `${row.correct}/${row.attempts} correct (${row.accuracy_pct}%)`;
            },
          },
        },
      },
    },
  });
}

function renderHeatmap(rows) {
  renderHeatmapChart(rows);
  analyticsHeatmapList.innerHTML = "";

  if (rows.length === 0) {
    analyticsHeatmapList.innerHTML = '<li class="empty-state">This study set has no terms.</li>';
    return;
  }

  rows.forEach((row) => {
    let item = document.createElement("li");
    item.className = "classroom-item heatmap-item";

    let statsHtml =
      row.accuracy_pct === null
        ? `<span class="not-asked">Not asked yet</span>`
        : `${row.correct}/${row.attempts} correct &middot; <span class="accuracy-value">${row.accuracy_pct}%</span>`;

    item.innerHTML = `
      <span class="term-name">${escapeHtml(row.term)}</span>
      <span class="term-stats">${statsHtml}</span>
    `;
    analyticsHeatmapList.appendChild(item);
  });
}

async function loadHeatmap() {
  if (!currentSetId) return;

  let params = new URLSearchParams();
  if (currentGameId) params.set("game_id", currentGameId);
  if (analyticsStudentSelect.value) params.set("student_id", analyticsStudentSelect.value);

  try {
    let rows = await apiRequest(`/sets/${currentSetId}/heatmap?${params.toString()}`);
    renderHeatmap(rows);
  } catch (err) {
    setAnalyticsMessage(err.message);
  }
}

analyticsStudentSelect.addEventListener("change", loadHeatmap);

analyticsBackButton.addEventListener("click", () => {
  analyticsView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
});

export async function openAnalytics(setId, setTitle, options) {
  currentSetId = setId;
  currentGameId = (options && options.gameId) || null;
  setAnalyticsMessage("");
  analyticsSetTitle.textContent = `Struggle Analytics — ${setTitle}`;
  analyticsGameList.innerHTML = '<li class="empty-state">Loading games...</li>';
  analyticsHeatmapList.innerHTML = "";
  analyticsStudentSelect.innerHTML = "";

  dashboardView.classList.add("hidden");
  analyticsView.classList.remove("hidden");

  try {
    let games = await apiRequest(`/sets/${setId}/games`);
    renderGameList(games);

    if (currentGameId) {
      let items = analyticsGameList.querySelectorAll(".game-list-item");
      let matchingItem = Array.from(items).find((el) => Number(el.dataset.gameId) === currentGameId);
      if (matchingItem) {
        items.forEach((el) => el.classList.remove("selected"));
        matchingItem.classList.add("selected");
      } else {
        currentGameId = null;
      }
    }

    let students = await loadRosterForGames(games);
    renderStudentSelect(students);

    await loadHeatmap();
  } catch (err) {
    setAnalyticsMessage(err.message);
  }
}
