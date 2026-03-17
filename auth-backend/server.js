import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { Issuer } from "openid-client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const UPLOADS_DIR      = process.env.UPLOADS_DIR      || path.join(__dirname, "../frontend/public/uploads");
const DB_PATH          = process.env.DB_PATH           || path.join(__dirname, "users.db");
const ADMIN_SEED_EMAIL = process.env.ADMIN_SEED_EMAIL  || "alexandre.grigoriev@horiba.com";
const PORT             = process.env.PORT              || 3001;
const FRONTEND_ORIGIN  = process.env.FRONTEND_ORIGIN   || "http://localhost:5173";
const APP_BASE_URL     = process.env.APP_BASE_URL      || FRONTEND_ORIGIN;
const SMTP_FROM        = process.env.SMTP_FROM         || '"AVATAR Platform" <noreply@avatar.horiba.com>';

const COOKIE_NAME     = process.env.COOKIE_NAME     || "avatar_session";
const COOKIE_SECURE   = String(process.env.COOKIE_SECURE || "false") === "true";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE  || "lax";

const BCRYPT_ROUNDS   = 10;
const VERIFY_TTL_MS   = 30 * 60 * 1000; // 30 minutes

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT UNIQUE NOT NULL,
    name           TEXT,
    picture        TEXT,
    role           TEXT NOT NULL DEFAULT 'user',
    provider       TEXT NOT NULL DEFAULT 'email',
    password_hash  TEXT,
    verified       INTEGER NOT NULL DEFAULT 0,
    verify_token   TEXT,
    verify_expires TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    last_login     TEXT
  )
`);

// Migrate existing DB (add new columns if missing)
for (const col of [
  "ALTER TABLE users ADD COLUMN provider      TEXT NOT NULL DEFAULT 'email'",
  "ALTER TABLE users ADD COLUMN password_hash TEXT",
  "ALTER TABLE users ADD COLUMN verified      INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN verify_token  TEXT",
  "ALTER TABLE users ADD COLUMN verify_expires TEXT",
]) {
  try { db.exec(col); } catch { /* column already exists */ }
}
// Google users are always verified
db.exec("UPDATE users SET verified = 1 WHERE provider = 'google' AND verified = 0");

// Seed first admin
db.prepare(`
  INSERT INTO users (id, email, name, role, provider, verified)
  VALUES (?, ?, 'Administrator', 'admin', 'seed', 1)
  ON CONFLICT(email) DO UPDATE SET role = 'admin' WHERE role = 'user'
`).run("seed-" + ADMIN_SEED_EMAIL, ADMIN_SEED_EMAIL);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtFindById      = db.prepare("SELECT * FROM users WHERE id = ?");
const stmtFindByEmail   = db.prepare("SELECT * FROM users WHERE email = ?");
const stmtFindByToken   = db.prepare("SELECT * FROM users WHERE verify_token = ?");
const stmtAllUsers      = db.prepare("SELECT id, email, name, picture, role, provider, verified, created_at, last_login FROM users ORDER BY created_at");
const stmtUpdateRole    = db.prepare("UPDATE users SET role = ? WHERE id = ?");
const stmtGoogleUpsert  = db.prepare(`
  INSERT INTO users (id, email, name, picture, provider, verified, last_login)
  VALUES (?, ?, ?, ?, 'google', 1, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    name       = excluded.name,
    picture    = excluded.picture,
    last_login = excluded.last_login
`);

// ── Email / SMTP ──────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport(
  process.env.SMTP_HOST
    ? {
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth:   process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      }
    : { jsonTransport: true } // dev fallback: logs email as JSON
);

function verificationEmailHtml(name, verifyUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f5f7;font-family:Inter,system-ui,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1677ff;padding:28px 36px;">
            <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">HORIBA</span>
            <span style="font-size:13px;color:rgba(255,255,255,0.75);margin-left:10px;">AVATAR Platform</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 36px 24px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Verify your email</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hello${name ? " " + name : ""},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Thanks for registering on the HORIBA AVATAR Platform.<br>
              Click the button below to confirm your email address and activate your account.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#1677ff;border-radius:8px;">
                  <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                    Confirm my email
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
              This link expires in <strong>30 minutes</strong>. If you did not create an account, you can safely ignore this email.
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:#d1d5db;word-break:break-all;">
              Or copy this link: ${verifyUrl}
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #f3f5f7;font-size:12px;color:#9ca3af;">
            HORIBA FRANCE · AI LAB &nbsp;·&nbsp; AVATAR Platform &nbsp;·&nbsp; Do not reply to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendVerificationEmail(email, name, token) {
  const verifyUrl = `${APP_BASE_URL}/api/auth/verify?token=${token}`;
  const info = await transporter.sendMail({
    from:    SMTP_FROM,
    to:      email,
    subject: "Confirm your AVATAR Platform account",
    html:    verificationEmailHtml(name, verifyUrl),
  });
  // Dev fallback: log the link when no real SMTP
  if (info?.envelope === undefined && info?.message) {
    const msg = JSON.parse(info.message);
    console.log("\n── [DEV] Verification email ──────────────────────");
    console.log("To:      ", email);
    console.log("Link:    ", verifyUrl);
    console.log("─────────────────────────────────────────────────\n");
  } else if (!process.env.SMTP_HOST) {
    console.log("\n── [DEV] Verification email ──────────────────────");
    console.log("To:      ", email);
    console.log("Link:    ", verifyUrl);
    console.log("─────────────────────────────────────────────────\n");
  }
}

// ── Session store ─────────────────────────────────────────────────────────────
const sessions    = new Map();
const oauthStates = new Map();

let googleClient = null;

function now()    { return Date.now(); }
function makeId() { return crypto.randomBytes(24).toString("hex"); }

function setSessionCookie(res, sessionId) {
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true, secure: COOKIE_SECURE, sameSite: COOKIE_SAMESITE,
    path: "/", maxAge: 7 * 24 * 3600 * 1000,
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: COOKIE_SECURE, sameSite: COOKIE_SAMESITE, path: "/" });
}
function getSession(req) {
  const sid = req.cookies?.[COOKIE_NAME];
  return sid ? (sessions.get(sid) || null) : null;
}
function requireReturnTo(req) {
  const rt = req.query.returnTo;
  return rt && typeof rt === "string" && rt.startsWith(FRONTEND_ORIGIN) ? rt : FRONTEND_ORIGIN;
}
function cleanupStates() {
  const cutoff = now() - 30 * 60 * 1000;
  for (const [k, v] of oauthStates) if (v.createdAt < cutoff) oauthStates.delete(k);
}
function createSession(res, user) {
  const sid = makeId();
  sessions.set(sid, { user, createdAt: now() });
  setSessionCookie(res, sid);
}
function dbUserToSession(dbUser) {
  return {
    id:       dbUser.id,
    name:     dbUser.name,
    email:    dbUser.email,
    picture:  dbUser.picture,
    role:     dbUser.role,
    provider: dbUser.provider,
  };
}

// ── Middleware ────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.sendStatus(401);
  req.session = session;
  next();
}
function requireAdmin(req, res, next) {
  if (req.session?.user?.role !== "admin") return res.sendStatus(403);
  next();
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
async function initGoogle() {
  const googleIssuer = await Issuer.discover("https://accounts.google.com");
  googleClient = new googleIssuer.Client({
    client_id:      process.env.GOOGLE_CLIENT_ID,
    client_secret:  process.env.GOOGLE_CLIENT_SECRET,
    redirect_uris:  [process.env.GOOGLE_REDIRECT_URI],
    response_types: ["code"],
  });
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/uploads", express.static(UPLOADS_DIR));

// ── Presentations ─────────────────────────────────────────────────────────────
app.get("/api/list-presentations", (req, res) => {
  const filePath = path.join(UPLOADS_DIR, "files.json");
  try {
    if (!fs.existsSync(filePath)) return res.json([]);
    res.json(JSON.parse(fs.readFileSync(filePath, "utf8")).files || []);
  } catch { res.json([]); }
});

app.get("/api/presentation-data", (req, res) => {
  const { file_name, language } = req.query;
  if (!file_name) return res.status(400).json({ error: "Missing file_name" });
  const safeName = path.basename(String(file_name));
  const filePath = path.join(UPLOADS_DIR, safeName, `content_${language}.txt`);
  if (!fs.existsSync(filePath))
    return res.status(500).json({ error: `Could not find content in ${language}` });

  const blocks = fs.readFileSync(filePath, "utf-8").split("-------").map(b => b.trim()).filter(Boolean);
  let quizEnabled = true;
  const result    = {};
  let slideIndex  = 0;
  for (const block of blocks) {
    const m = block.match(/^quiz:(YES|NO)$/i);
    if (m) { quizEnabled = m[1].toUpperCase() === "YES"; continue; }
    slideIndex++;
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    result[slideIndex.toString()] = [
      lines.filter(l => !l.startsWith("image:")),
      (lines.find(l => l.startsWith("image:")) || "").replace("image:", "").trim(),
    ];
  }
  res.json({ slides: result, quizEnabled });
});

// ── Auth: session ─────────────────────────────────────────────────────────────
app.get("/api/auth/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.sendStatus(401);
  res.json(session.user);
});

app.post("/api/auth/logout", (req, res) => {
  const sid = req.cookies?.[COOKIE_NAME];
  if (sid) sessions.delete(sid);
  clearSessionCookie(res);
  res.sendStatus(204);
});

// ── Auth: email registration ──────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Invalid email address" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const existing = stmtFindByEmail.get(email);
    if (existing && existing.verified && existing.provider !== "seed")
      return res.status(409).json({ error: "An account with this email already exists" });

    const passwordHash  = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verifyToken   = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + VERIFY_TTL_MS).toISOString();
    const displayName   = name?.trim() || email.split("@")[0];

    if (existing) {
      // Re-registration of unverified account: refresh token + password
      db.prepare(`
        UPDATE users SET name=?, password_hash=?, verify_token=?, verify_expires=?, verified=0 WHERE email=?
      `).run(displayName, passwordHash, verifyToken, verifyExpires, email);
    } else {
      db.prepare(`
        INSERT INTO users (id, email, name, password_hash, provider, verified, verify_token, verify_expires)
        VALUES (?, ?, ?, ?, 'email', 0, ?, ?)
      `).run("email-" + makeId(), email, displayName, passwordHash, verifyToken, verifyExpires);
    }

    await sendVerificationEmail(email, displayName, verifyToken);
    res.json({ ok: true });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ── Auth: email verification link ─────────────────────────────────────────────
app.get("/api/auth/verify", (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Missing token");

  const user = stmtFindByToken.get(token);
  if (!user) return res.send(verifiedErrorPage("Invalid or already used verification link."));

  if (new Date(user.verify_expires) < new Date())
    return res.send(verifiedErrorPage("This verification link has expired. Please register again."));

  db.prepare("UPDATE users SET verified=1, verify_token=NULL, verify_expires=NULL WHERE id=?").run(user.id);

  res.redirect(`${FRONTEND_ORIGIN}?verified=1`);
});

function verifiedErrorPage(message) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#374151;">
    <h2 style="color:#ef4444;">Verification failed</h2><p>${message}</p>
    <a href="${FRONTEND_ORIGIN}" style="color:#1677ff;">Go to the application</a>
  </body></html>`;
}

// ── Auth: email login ─────────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const user = stmtFindByEmail.get(email);
    if (!user || !user.password_hash)
      return res.status(401).json({ error: "Invalid email or password" });

    if (!user.verified)
      return res.status(403).json({ error: "Please verify your email before signing in. Check your inbox.", code: "unverified" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });

    db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(user.id);

    createSession(res, dbUserToSession(user));
    res.json({ ok: true });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── Auth: resend verification ─────────────────────────────────────────────────
app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const user = stmtFindByEmail.get(email);
    if (!user || user.verified) return res.json({ ok: true }); // silent — don't reveal existence

    const verifyToken   = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + VERIFY_TTL_MS).toISOString();
    db.prepare("UPDATE users SET verify_token=?, verify_expires=? WHERE id=?")
      .run(verifyToken, verifyExpires, user.id);
    await sendVerificationEmail(email, user.name, verifyToken);
    res.json({ ok: true });
  } catch (e) {
    console.error("Resend error:", e);
    res.status(500).json({ error: "Could not resend email. Please try again." });
  }
});

// ── Auth: Google OAuth ────────────────────────────────────────────────────────
app.get("/auth/google/login", async (req, res) => {
  cleanupStates();
  const returnTo = requireReturnTo(req);
  const state    = makeId();
  oauthStates.set(state, { returnTo, createdAt: now() });
  res.redirect(googleClient.authorizationUrl({ scope: "openid email profile", state, prompt: "select_account" }));
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const params = googleClient.callbackParams(req);
    const st     = oauthStates.get(params.state);
    if (!st) return res.status(400).send("Invalid state");
    oauthStates.delete(params.state);

    const claims = (await googleClient.callback(process.env.GOOGLE_REDIRECT_URI, params, { state: params.state })).claims();

    // Remove any seed/email entry with same address before upserting by Google sub
    const existingByEmail = stmtFindByEmail.get(claims.email);
    const inheritedRole   = existingByEmail && existingByEmail.id !== claims.sub ? existingByEmail.role : null;
    if (inheritedRole) db.prepare("DELETE FROM users WHERE id=?").run(existingByEmail.id);

    stmtGoogleUpsert.run(claims.sub, claims.email, claims.name || claims.given_name || "Google User", claims.picture || null);
    if (inheritedRole && inheritedRole !== "user") stmtUpdateRole.run(inheritedRole, claims.sub);

    createSession(res, dbUserToSession(stmtFindById.get(claims.sub)));
    res.redirect(st.returnTo);
  } catch (e) {
    console.error("Google callback error:", e);
    res.status(500).send("OAuth error");
  }
});

// ── User management (admin) ───────────────────────────────────────────────────
app.get("/api/users", requireAuth, requireAdmin, (req, res) => {
  res.json(stmtAllUsers.all());
});

app.put("/api/users/:id/role", requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!["admin", "contributor", "user"].includes(role))
    return res.status(400).json({ error: "Invalid role. Must be admin | contributor | user" });

  const info = stmtUpdateRole.run(role, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "User not found" });

  for (const [, session] of sessions)
    if (session.user.id === req.params.id) session.user.role = role;

  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
await initGoogle();
app.listen(PORT, () => {
  console.log(`Auth backend  → http://localhost:${PORT}`);
  console.log(`Frontend      → ${FRONTEND_ORIGIN}`);
  console.log(`DB            → ${DB_PATH}`);
  console.log(`SMTP          → ${process.env.SMTP_HOST || "DEV (console log)"}`);
});
