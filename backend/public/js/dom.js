import { apiRequest } from "./api.js";

export let message = document.getElementById("message");

export let authView = document.getElementById("auth-view");
export let dashboardView = document.getElementById("dashboard-view");
export let dashboardMessage = document.getElementById("dashboard-message");
export let studentDashboardView = document.getElementById("student-dashboard-view");
export let studentDashboardMessage = document.getElementById("student-dashboard-message");
export let analyticsView = document.getElementById("analytics-view");

export function setMessage(text, isSuccess) {
  message.textContent = text;
  message.classList.toggle("success", Boolean(isSuccess));
}

export function setDashboardMessage(text, isSuccess) {
  dashboardMessage.textContent = text;
  dashboardMessage.classList.toggle("success", Boolean(isSuccess));
}

export function setStudentDashboardMessage(text, isSuccess) {
  studentDashboardMessage.textContent = text;
  studentDashboardMessage.classList.toggle("success", Boolean(isSuccess));
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    setDashboardMessage("Join code copied to clipboard!", true);
  }).catch(() => {
    setDashboardMessage("Failed to copy join code.");
  });
}

export function escapeHtml(str) {
  let div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function animateNumber(el, from, to, duration = 500) {
  if (from === to) {
    el.textContent = to;
    return;
  }

  let start = performance.now();

  function step(now) {
    let progress = Math.min(1, (now - start) / duration);
    let eased = 1 - Math.pow(1 - progress, 2);
    let value = Math.round(from + (to - from) * eased);
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

export async function loadLeaderboard(gameId, listEl) {
  try {
    let data = await apiRequest(`/games/${gameId}/leaderboard`);
    renderLeaderboard(data.players, listEl);
  } catch (err) {
  }
}

export function renderLeaderboard(players, listEl) {
  listEl.innerHTML = "";

  if (players.length === 0) {
    listEl.innerHTML = '<li class="empty-state">No players yet.</li>';
    return;
  }

  players.forEach((player) => {
    let item = document.createElement("li");
    item.innerHTML = `
      <span><span class="rank">#${player.rank}</span>${escapeHtml(player.username)}</span>
      <span>${player.score} pts</span>
    `;
    listEl.appendChild(item);
  });
}
