import { URL } from "node:url";
import { connect, isReady, users, habits, checks, toId } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function dayKey(date = new Date()) { return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function prevDay(key) { const [year, month, day] = key.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); }
function lastDays(count = 14) { const days = []; let cursor = dayKey(); for (let i = 0; i < count; i += 1) { days.unshift(cursor); cursor = prevDay(cursor); } return days; }
function streakOf(days, today) { let streak = 0; let cursor = today; const set = new Set(days); while (set.has(cursor)) { streak += 1; cursor = prevDay(cursor); } return streak; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;
  const today = dayKey();
  const days = lastDays(14);

  if (method === "GET" && pathname === "/api/habits") {
    const rows = await habits().find({ userId }).sort({ createdAt: 1 }).toArray();
    const marks = await checks().find({ userId }).toArray();
    const habitsOut = rows.map((habit) => {
      const mine = marks.filter((mark) => String(mark.habitId) === String(habit._id)).map((mark) => mark.day);
      return { id: String(habit._id), name: habit.name, doneToday: mine.includes(today), streak: streakOf(mine, today), days: days.map((day) => ({ day, done: mine.includes(day) })) };
    });
    return sendJson(res, 200, { today, habits: habitsOut });
  }
  if (method === "POST" && pathname === "/api/habits") {
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "El habito es obligatorio" });
    const result = await habits().insertOne({ userId, name: name.slice(0, 40), createdAt: new Date() });
    return sendJson(res, 201, { habit: { id: String(result.insertedId), name: name.slice(0, 40), doneToday: false, streak: 0, days: days.map((day) => ({ day, done: false })) } });
  }
  const match = pathname.match(/^\/api\/habits\/([a-fA-F0-9]{24})(?:\/check)?$/);
  if (match) {
    const id = toId(match[1]);
    const habit = await habits().findOne({ _id: id, userId });
    if (!habit) return sendJson(res, 404, { error: "Habito no encontrado" });
    if (method === "POST" && pathname.endsWith("/check")) {
      const existing = await checks().findOne({ userId, habitId: String(id), day: today });
      if (existing) await checks().deleteOne({ _id: existing._id });
      else await checks().insertOne({ userId, habitId: String(id), day: today, createdAt: new Date() });
      return sendJson(res, 200, { ok: true, done: !existing });
    }
    if (method === "DELETE") {
      await habits().deleteOne({ _id: id, userId });
      await checks().deleteMany({ userId, habitId: String(id) });
      return sendEmpty(res, 204);
    }
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Habitos en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
