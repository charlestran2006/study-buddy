import { apiRequest, submitForm } from "./api.js";
import {
  authView,
  dashboardView,
  dashboardMessage,
  studentDashboardView,
  studentDashboardMessage,
  analyticsView,
  message,
  setMessage,
} from "./dom.js";
import { loadClassrooms } from "./classrooms.js";
import { loadSets } from "./sets.js";

let tabs = document.querySelectorAll(".tab");
let forms = document.querySelectorAll(".auth-form");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");

    forms.forEach((form) => {
      form.classList.toggle("hidden", form.id !== tab.dataset.target);
    });

    setMessage("");
  });
});

let studentDashboardLoaders = [];
export function registerStudentDashboardLoader(fn) {
  studentDashboardLoaders.push(fn);
}

let professorDashboardLoaders = [];
export function registerProfessorDashboardLoader(fn) {
  professorDashboardLoaders.push(fn);
}

export function showProfessorDashboard(user) {
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  document.getElementById("dashboard-username").textContent = `${user.username} (${user.role})`;
  loadClassrooms();
  loadSets();
  professorDashboardLoaders.forEach((fn) => fn());
}

export function showStudentDashboard(user) {
  authView.classList.add("hidden");
  studentDashboardView.classList.remove("hidden");
  document.getElementById("student-dashboard-username").textContent = `${user.username} (${user.role})`;
  studentDashboardLoaders.forEach((fn) => fn());
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");

  let username = form.username.value.trim();
  let password = form.password.value;

  if (!username || !password) {
    setMessage("Please fill out all fields.");
    return;
  }

  button.disabled = true;
  let originalButtonText = button.textContent;
  button.textContent = "Logging in...";

  try {
    let user = await submitForm("/login", { username, password });

    if (user.role === "professor") {
      showProfessorDashboard(user);
    } else {
      showStudentDashboard(user);
    }
  } catch (err) {
    setMessage(err.message);
  } finally {
    button.disabled = false;
    button.textContent = originalButtonText;
  }
});

document.getElementById("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");

  let username = form.username.value.trim();
  let email = form.email.value.trim();
  let password = form.password.value;
  let role = form.role.value;

  if (!username || !email || !password || !role) {
    setMessage("Please fill out all required fields.");
    return;
  }

  if (password.length < 6) {
    setMessage("Password must be at least 6 characters long.");
    return;
  }

  button.disabled = true;
  let originalButtonText = button.textContent;
  button.textContent = "Creating Account...";

  try {
    await submitForm("/signup", { username, email, password, role });

    let user = await submitForm("/login", { username, password });

    if (user.role === "professor") {
      showProfessorDashboard(user);
    } else {
      showStudentDashboard(user);
    }
  } catch (err) {
    setMessage(err.message);
  } finally {
    button.disabled = false;
    button.textContent = originalButtonText;
  }
});

let logoutCleanupFns = [];
export function registerLogoutCleanup(fn) {
  logoutCleanupFns.push(fn);
}

async function logout() {
  try {
    await apiRequest("/logout", { method: "POST" });
  } catch (err) {
  }
  logoutCleanupFns.forEach((fn) => fn());
  dashboardView.classList.add("hidden");
  studentDashboardView.classList.add("hidden");
  analyticsView.classList.add("hidden");
  authView.classList.remove("hidden");
  document.getElementById("login-form").reset();
}

document.getElementById("logout-button").addEventListener("click", logout);
document.getElementById("student-logout-button").addEventListener("click", logout);
