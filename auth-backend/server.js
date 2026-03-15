import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { Issuer } from "openid-client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "../frontend/public/uploads");

const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const COOKIE_NAME = process.env.COOKIE_NAME || "avatar_session";
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || "false") === "true";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "lax";

// DEV stores (memory)
const sessions = new Map();    // sessionId -> { user, createdAt }
const oauthStates = new Map(); // state -> { returnTo, createdAt }

let googleClient = null;

function now() {
  return Date.now();
}
function makeId() {
  return crypto.randomBytes(24).toString("hex");
}
function setSessionCookie(res, sessionId) {
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    path: "/",
    maxAge: 7 * 24 * 3600 * 1000,
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    path: "/",
  });
}
function getSession(req) {
  const sid = req.cookies?.[COOKIE_NAME];
  if (!sid) return null;
  return sessions.get(sid) || null;
}
function requireReturnTo(req) {
  const rt = req.query.returnTo;
  if (!rt || typeof rt !== "string") return FRONTEND_ORIGIN;
  // allow only frontend origin (safer)
  if (rt.startsWith(FRONTEND_ORIGIN)) return rt;
  return FRONTEND_ORIGIN;
}
function cleanupStates() {
  const cutoff = now() - 30 * 60 * 1000;
  for (const [k, v] of oauthStates) {
    if (v.createdAt < cutoff) oauthStates.delete(k);
  }
}

async function initGoogle() {
  const googleIssuer = await Issuer.discover("https://accounts.google.com");
  googleClient = new googleIssuer.Client({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uris: [process.env.GOOGLE_REDIRECT_URI],
    response_types: ["code"],
  });
}

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));

// Serve slide images from uploads folder
app.use("/uploads", express.static(UPLOADS_DIR));

// GET /api/list-presentations
app.get("/api/list-presentations", (req, res) => {
  const filePath = path.join(UPLOADS_DIR, "files.json");
  try {
    if (!fs.existsSync(filePath)) return res.json([]);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json(parsed.files || []);
  } catch {
    res.json([]);
  }
});

// GET /api/presentation-data?file_name=...&language=...
app.get("/api/presentation-data", (req, res) => {
  const { file_name, language } = req.query;
  if (!file_name) return res.status(400).json({ error: "Missing file_name" });
  const safeName = path.basename(String(file_name));
  const filePath = path.join(UPLOADS_DIR, safeName, `content_${language}.txt`);
  if (!fs.existsSync(filePath)) {
    return res.status(500).json({ error: `Could not file content in ${language}` });
  }
  const data = fs.readFileSync(filePath, "utf-8");
  const blocks = data.split("-------").map(b => b.trim()).filter(Boolean);
  const result = {};
  blocks.forEach((block, index) => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const paragraphs = lines.filter(l => !l.startsWith("image:"));
    const imageLine = lines.find(l => l.startsWith("image:")) || "";
    const image = imageLine.replace("image:", "").trim();
    result[(index + 1).toString()] = [paragraphs, image];
  });
  res.json(result);
});

// Who am I?
app.get("/api/auth/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.sendStatus(401);
  return res.json(session.user);
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  const sid = req.cookies?.[COOKIE_NAME];
  if (sid) sessions.delete(sid);
  clearSessionCookie(res);
  res.sendStatus(204);
});

// Google login
app.get("/auth/google/login", async (req, res) => {
  console.log("Redirect URI used =", process.env.GOOGLE_REDIRECT_URI);
  
  cleanupStates();
  const returnTo = requireReturnTo(req);
  const state = makeId();
  oauthStates.set(state, { returnTo, createdAt: now() });

  const url = googleClient.authorizationUrl({
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  res.redirect(url);
});

// Google callback
app.get("/auth/google/callback", async (req, res) => {
  try {
    const params = googleClient.callbackParams(req);
    const state = params.state;

    const st = oauthStates.get(state);
    if (!st) return res.status(400).send("Invalid state");
    oauthStates.delete(state);

    const tokenSet = await googleClient.callback(
      process.env.GOOGLE_REDIRECT_URI,
      params,
      { state }
    );

    const claims = tokenSet.claims();

    const user = {
      name: claims.name || claims.given_name || "Google User",
      email: claims.email,
      provider: "google",
    };

    const sid = makeId();
    sessions.set(sid, { user, createdAt: now() });
    setSessionCookie(res, sid);

    res.redirect(st.returnTo);
  } catch (e) {
    console.error("Google callback error:", e);
    res.status(500).send("OAuth error");
  }
});

await initGoogle();

app.listen(PORT, () => {
  console.log(`Auth backend running on http://localhost:${PORT}`);
  console.log(`CORS origin: ${FRONTEND_ORIGIN}`);
});
