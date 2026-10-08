import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const form = document.querySelector("#habit-form");
const formError = document.querySelector("#form-error");
let mode = "login";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function refresh() {
  const data = await api("/api/habits");
  document.querySelector("#today").textContent = `Hoy ${data.today}`;
  listEl.innerHTML = "";
  if (!data.habits.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay habitos.";
    listEl.append(empty);
    return;
  }
  data.habits.forEach((habit) => {
    const li = document.createElement("li");
    li.className = "item";
    const top = document.createElement("div");
    top.className = "top";
    const name = document.createElement("strong");
    name.textContent = habit.name;
    const streak = document.createElement("span");
    streak.textContent = `racha ${habit.streak}`;
    const check = document.createElement("button");
    check.type = "button";
    check.className = `check${habit.doneToday ? " on" : ""}`;
    check.textContent = habit.doneToday ? "Hecho" : "Marcar";
    check.addEventListener("click", async () => { await api(`/api/habits/${habit.id}/check`, { method: "POST" }); await refresh(); });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/habits/${habit.id}`, { method: "DELETE" }); await refresh(); });
    top.append(name, streak, check, del);
    const dots = document.createElement("div");
    dots.className = "dots";
    habit.days.forEach((day) => {
      const dot = document.createElement("span");
      dot.className = `dot${day.done ? " on" : ""}`;
      dot.title = day.day;
      dots.append(dot);
    });
    li.append(top, dots);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/habits", { method: "POST", body: JSON.stringify({ name: document.querySelector("#name").value.trim() }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
