import "dotenv/config";
import dns from "dns";
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
import multer from "multer";
import JSZip from "jszip";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const UPLOADS_DIR      = process.env.UPLOADS_DIR      || path.join(__dirname, "../frontend/public/uploads");
const DB_PATH          = process.env.DB_PATH           || path.join(__dirname, "users.db");
const ADMIN_SEED_EMAIL = process.env.ADMIN_SEED_EMAIL  || "alexandre.grigoriev@horiba.com";
const PORT             = process.env.PORT              || 3001;
const FRONTEND_ORIGIN  = process.env.FRONTEND_ORIGIN   || "http://localhost:5173";
const APP_BASE_URL     = process.env.APP_BASE_URL      || FRONTEND_ORIGIN;
// Default FROM to the authenticated SMTP user to avoid Office365 "Send As" rejection
const SMTP_FROM = process.env.SMTP_FROM ||
  (process.env.SMTP_USER ? `"AVATAR Platform" <${process.env.SMTP_USER}>` : '"AVATAR Platform" <noreply@avatar.horiba.com>');

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
// Pre-resolve hostname to IPv4 so nodemailer never does its own DNS (which picks IPv6)
const _smtpHostResolved = process.env.SMTP_HOST
  ? await new Promise((resolve) =>
      dns.resolve4(process.env.SMTP_HOST, (err, addrs) => {
        const ip = !err && addrs?.length ? addrs[0] : process.env.SMTP_HOST;
        if (!err) console.log(`SMTP ${process.env.SMTP_HOST} → ${ip} (IPv4)`);
        resolve(ip);
      })
    )
  : null;

const transporter = nodemailer.createTransport(
  _smtpHostResolved
    ? {
        host:              _smtpHostResolved,
        port:              parseInt(process.env.SMTP_PORT || "587"),
        secure:            process.env.SMTP_SECURE === "true",
        connectionTimeout: 5_000,
        greetingTimeout:   5_000,
        socketTimeout:     5_000,
        auth:   process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        tls: { rejectUnauthorized: false },
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

  // Always print link to console (useful in dev and as fallback)
  console.log("\n── Verification email ────────────────────────────");
  console.log("To:  ", email);
  console.log("Link:", verifyUrl);
  console.log("From:", SMTP_FROM);
  console.log("─────────────────────────────────────────────────\n");

  if (!process.env.SMTP_HOST) return; // dev mode: console only

  try {
    await transporter.sendMail({
      from:    SMTP_FROM,
      to:      email,
      subject: "Confirm your AVATAR Platform account",
      html:    verificationEmailHtml(name, verifyUrl),
    });
    console.log("✓ Verification email sent to", email);
  } catch (err) {
    console.error("✗ SMTP send failed (user was saved; use console link above):", err.message);
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
app.use(express.json({ limit: "10mb" }));
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
    if (existing?.verified && existing?.provider !== "seed" && existing?.provider !== "google")
      return res.status(409).json({ error: "An account with this email already exists" });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const displayName  = name?.trim() || email.split("@")[0];

    if (existing?.provider === "google") {
      // Google user adding email+password — email already proven, activate immediately
      db.prepare("UPDATE users SET name=COALESCE(NULLIF(?,name),name), password_hash=? WHERE email=?")
        .run(displayName, passwordHash, email);
      return res.json({ ok: true, linked: true });
    }

    const verifyToken   = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + VERIFY_TTL_MS).toISOString();

    if (existing) {
      // Re-registration of unverified account: refresh token + password
      db.prepare(`UPDATE users SET name=?, password_hash=?, verify_token=?, verify_expires=?, verified=0 WHERE email=?`)
        .run(displayName, passwordHash, verifyToken, verifyExpires, email);
    } else {
      db.prepare(`INSERT INTO users (id, email, name, password_hash, provider, verified, verify_token, verify_expires)
        VALUES (?, ?, ?, ?, 'email', 0, ?, ?)`)
        .run("email-" + makeId(), email, displayName, passwordHash, verifyToken, verifyExpires);
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
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.password_hash)
      return res.status(401).json({ error: "This account uses Google Sign-In. Please use the Google button.", code: "google_account" });

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

    // Reuse existing token if still valid; otherwise issue a fresh one
    const tokenStillValid = user.verify_token && user.verify_expires &&
      new Date(user.verify_expires) > new Date();
    const verifyToken = tokenStillValid
      ? user.verify_token
      : crypto.randomBytes(32).toString("hex");
    const verifyExpires = tokenStillValid
      ? user.verify_expires
      : new Date(Date.now() + VERIFY_TTL_MS).toISOString();
    if (!tokenStillValid)
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

// ── Presentation import ───────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Convert PDF → 1920×1080 PNGs via Python/PyMuPDF script
const PDF_SCRIPT = path.join(__dirname, "pdf_to_images.py");

async function pdfToImages(pdfBuffer, outDir, W = 1920, H = 1080) {
  // Write buffer to a temp file (Python script reads from disk)
  const tmpPdf = path.join(outDir, "_upload.pdf");
  fs.writeFileSync(tmpPdf, pdfBuffer);
  try {
    const { stdout } = await execAsync(
      `python "${PDF_SCRIPT}" "${tmpPdf}" "${outDir}" ${W} ${H}`
    );
    return JSON.parse(stdout.trim());
  } finally {
    fs.unlinkSync(tmpPdf);
  }
}

// Extract notes text per slide from PPTX buffer
async function extractPptxNotes(pptxBuffer) {
  const zip     = await JSZip.loadAsync(pptxBuffer);
  const presXml = await zip.file("ppt/presentation.xml")?.async("string") ?? "";
  const presRels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string") ?? "";

  // Build rId → slide filename map
  const rIdToSlide = {};
  for (const m of presRels.matchAll(/Id="(rId\d+)"[^>]*Target="slides\/(slide\d+\.xml)"/g))
    rIdToSlide[m[1]] = m[2];

  // Slide order from <p:sldId r:id="...">
  const slideOrder = [...presXml.matchAll(/<p:sldId[^>]+r:id="(rId\d+)"/g)].map(m => m[1]);

  const notes = [];
  for (const rId of slideOrder) {
    const slideName = rIdToSlide[rId];
    if (!slideName) { notes.push(""); continue; }

    const slideNum  = slideName.match(/slide(\d+)\.xml/)?.[1];
    const slideRels = await zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`)?.async("string") ?? "";
    const noteFile  = slideRels.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/)?.[1];
    if (!noteFile) { notes.push(""); continue; }

    const noteXml = await zip.file(`ppt/notesSlides/${noteFile}`)?.async("string") ?? "";

    // Remove slide-image and slide-number placeholder shapes, then extract all <a:t> text
    const cleaned = noteXml
      .replace(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?type="sldImg"(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/g, "")
      .replace(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?type="sldNum"(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/g, "");
    const text = [...cleaned.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map(m => m[1].trim()).filter(Boolean).join(" ");
    notes.push(text);
  }
  return notes;
}

function buildContentFile(notes, images, quizEnabled = false) {
  const count = Math.max(notes.length, images.length);
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const lines = [];
    if (notes[i])  lines.push(notes[i]);
    if (images[i]) lines.push(`image:${images[i]}`);
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n-------\n") + `\n-------\nquiz:${quizEnabled ? "YES" : "NO"}`;
}

app.post("/api/presentations/import",
  requireAuth, requireAdmin,
  upload.fields([{ name: "pptx", maxCount: 1 }, { name: "pdf", maxCount: 1 }]),
  async (req, res) => {
    const { name, description, language } = req.body;
    if (!name?.trim())      return res.status(400).json({ error: "Name is required" });
    if (!req.files?.pdf?.[0]) return res.status(400).json({ error: "PDF file is required" });

    const safeName = name.trim();
    const outDir   = path.join(UPLOADS_DIR, safeName);
    fs.mkdirSync(outDir, { recursive: true });

    try {
      const longLang = language || "english";

      // 1. Convert PDF pages → 1920×1080 PNGs
      const images = await pdfToImages(req.files.pdf[0].buffer, outDir);

      // 2. Extract notes from PPTX or fill blanks (Gemini summarization runs on the frontend after import)
      let notes = [];
      if (req.files?.pptx?.[0]) {
        notes = await extractPptxNotes(req.files.pptx[0].buffer);
      } else {
        notes = images.map(() => "No slide notes");
      }

      // 3. Build and save content file
      const content  = buildContentFile(notes, images);
      fs.writeFileSync(path.join(outDir, `content_${longLang}.txt`), content, "utf-8");

      // 4. Update files.json
      const filesJsonPath = path.join(UPLOADS_DIR, "files.json");
      let filesData = { files: [] };
      try { filesData = JSON.parse(fs.readFileSync(filesJsonPath, "utf-8")); } catch {}
      filesData.files = filesData.files.filter(f => f.name !== safeName);
      filesData.files.push({ name: safeName, description: description?.trim() || "", language: longLang });
      fs.writeFileSync(filesJsonPath, JSON.stringify(filesData, null, 2));

      res.json({ ok: true, slides: images.length, notes: notes.filter(Boolean).length, images, name: safeName, language: longLang });
    } catch (e) {
      console.error("Import error:", e);
      res.status(500).json({ error: "Import failed: " + e.message });
    }
  }
);

// Patch notes after Gemini summarization (frontend calls this after generating notes)
app.patch("/api/presentations/:name/notes", requireAuth, requireAdmin, express.json(), async (req, res) => {
  const { name } = req.params;
  const { notes, language } = req.body;
  if (!Array.isArray(notes) || !language) return res.status(400).json({ error: "notes[] and language required" });

  const contentPath = path.join(UPLOADS_DIR, name, `content_${language}.txt`);
  if (!fs.existsSync(contentPath)) return res.status(404).json({ error: "Content file not found" });

  const existing = fs.readFileSync(contentPath, "utf-8");
  const blocks = existing.split("\n-------\n");
  const quizBlock = blocks[blocks.length - 1]; // preserve quiz:YES/NO line

  // Rebuild blocks replacing only the text part (keep image: lines)
  const rebuilt = blocks.slice(0, -1).map((block, i) => {
    const lines = block.split("\n").filter(l => l.startsWith("image:") || l.startsWith("quiz:"));
    if (notes[i]) lines.unshift(notes[i]);
    return lines.join("\n");
  });
  fs.writeFileSync(contentPath, rebuilt.join("\n-------\n") + "\n-------\n" + quizBlock, "utf-8");
  res.json({ ok: true });
});

// Send quiz results by SMTP
app.post("/api/quiz/send-results", requireAuth, express.json(), async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !subject || !text) return res.status(400).json({ error: "to, subject, text required" });
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text });
    res.json({ ok: true });
  } catch (e) {
    console.error("Quiz results mail error:", e.message);
    res.status(500).json({ error: "Failed to send email: " + e.message });
  }
});

// Save generated quiz questions to question.json
app.post("/api/presentations/:name/quiz", requireAuth, requireAdmin, express.json(), (req, res) => {
  const { name } = req.params;
  const { questions, sendto } = req.body;
  if (!Array.isArray(questions)) return res.status(400).json({ error: "questions[] required" });

  const presDir = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(presDir)) return res.status(404).json({ error: "Presentation not found" });

  fs.writeFileSync(
    path.join(presDir, "question.json"),
    JSON.stringify({ sendto: sendto || "", questions }, null, 2),
    "utf-8"
  );

  // Flip quiz:NO → quiz:YES in all content_*.txt files for this presentation
  for (const file of fs.readdirSync(presDir)) {
    if (/^content_.+\.txt$/.test(file)) {
      const p = path.join(presDir, file);
      const updated = fs.readFileSync(p, "utf-8").replace(/quiz:NO\s*$/, "quiz:YES");
      fs.writeFileSync(p, updated, "utf-8");
    }
  }

  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
await initGoogle();
// Prevent rogue SMTP / socket errors from crashing the process
process.on("uncaughtException",  (err) => console.error("Uncaught:", err.message));
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

app.listen(PORT, () => {
  console.log(`Auth backend  → http://localhost:${PORT}`);
  console.log(`Frontend      → ${FRONTEND_ORIGIN}`);
  console.log(`DB            → ${DB_PATH}`);
  console.log(`SMTP          → ${process.env.SMTP_HOST || "DEV (console log)"}`);
});
