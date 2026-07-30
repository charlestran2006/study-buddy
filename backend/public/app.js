let tabs = document.querySelectorAll(".tab");
let forms = document.querySelectorAll(".auth-form");
let message = document.getElementById("message");

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

function setMessage(text, isSuccess) {
  message.textContent = text;
  message.classList.toggle("success", Boolean(isSuccess));
}

async function submitForm(url, body) {
  let response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  let data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "something went wrong");
  }

  return data;
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    let user = await submitForm("/login", {
      username: form.username.value,
      password: form.password.value,
    });
    setMessage(`Welcome back, ${user.username}!`, true);
  } catch (err) {
    setMessage(err.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let form = event.target;
  let button = form.querySelector("button");
  button.disabled = true;

  try {
    await submitForm("/signup", {
      username: form.username.value,
      email: form.email.value,
      password: form.password.value,
    });

    let user = await submitForm("/login", {
      username: form.username.value,
      password: form.password.value,
    });

    setMessage(`Account created. Welcome, ${user.username}!`, true);
  } catch (err) {
    setMessage(err.message);
  } finally {
    button.disabled = false;
  }
});
