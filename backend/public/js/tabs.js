export function initDashboardTabs(navId) {
  let tabs = document.querySelectorAll(`#${navId} .tab`);
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".dashboard-grid .panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== tab.dataset.target);
      });
    });
  });
}

initDashboardTabs("professor-tabs");
initDashboardTabs("student-tabs");
