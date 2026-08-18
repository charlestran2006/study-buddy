import { submitForm } from "./api.js";
import { setDashboardMessage } from "./dom.js";

document.getElementById("assign-set-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    await submitForm("/assignments", {
      set_id: form.set_id.value,
      classroom_id: form.classroom_id.value,
    });
    setDashboardMessage("Study set assigned to classroom.", true);
  } catch (err) {
    setDashboardMessage(err.message);
  } finally {
    button.disabled = false;
  }
});
