/**
 * routes/auth.js — email auth + Google OAuth
 */
import express from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Issuer } from "openid-client";
import {
  db, sessions, oauthStates, stmtFindByEmail, stmtFindByToken, stmtGoogleUpsert, stmtFindById, stmtUpdateRole,
  getSession, createSession, clearSessionCookie, dbUserToSession, makeId, now,
  COOKIE_NAME, FRONTEND_ORIGIN, BCRYPT_ROUNDS, VERIFY_TTL_MS,
  setGoogleClient,
} from "../shared.js";
import { sendVerificationEmail } from "../email.js";

export const router = express.Router();

// Lazy-initialised Google client — call initGoogle() at startup
let googleClient = null;
export async function initGoogle() {
  if (!process.env.GOOGLE_OAUTH_ENABLED || process.env.GOOGLE_OAUTH_ENABLED === "false") return;
  const googleIssuer = await Issuer.discover("https://accounts.google.com");
  googleClient = new googleIssuer.Client({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uris: [process.env.GOOGLE_REDIRECT_URI],
    response_types: ["code"],
  });
  setGoogleClient(googleClient);
}

function verifiedErrorPage(message) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#374151;">
    <h2 style="color:#ef4444;">Verification failed</h2><p>${message}</p>
    <a href="${FRONTEND_ORIGIN}" style="color:#1677ff;">Go to the application</a>
  </body></html>`;
}

function cleanupStates() {
  const cutoff = now() - 30 * 60 * 1000;
  for (const [k, v] of oauthStates) if (v.createdAt < cutoff) oauthStates.delete(k);
}
function requireReturnTo(req) {
  const rt = req.query.returnTo;
  return rt && typeof rt === "string" && rt.startsWith(FRONTEND_ORIGIN) ? rt : FRONTEND_ORIGIN;
}

// ── Session ───────────────────────────────────────────────────────────────────
router.get("/api/auth/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.sendStatus(401);
  res.json(session.user);
});

router.post("/api/auth/logout", (req, res) => {
  const sid = req.cookies?.[COOKIE_NAME];
  if (sid) sessions.delete(sid);
  clearSessionCookie(res);
  res.sendStatus(204);
});

// ── Email registration ────────────────────────────────────────────────────────
router.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Invalid email address" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const existing = stmtFindByEmail.get(email);
    if (existing?.verified && existing?.provider !== "seed" && existing?.provider !== "google")
      return res.status(409).json({ error: "An account with this email already exists" });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const displayName  = name?.trim() || email.split("@")[0];

    if (existing?.provider === "google") {
      db.prepare("UPDATE users SET name=COALESCE(NULLIF(?,name),name), password_hash=? WHERE email=?").run(displayName, passwordHash, email);
      return res.json({ ok: true, linked: true });
    }

    const verifyToken   = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + VERIFY_TTL_MS).toISOString();

    if (existing) {
      db.prepare("UPDATE users SET name=?, password_hash=?, verify_token=?, verify_expires=?, verified=0 WHERE email=?")
        .run(displayName, passwordHash, verifyToken, verifyExpires, email);
    } else {
      db.prepare("INSERT INTO users (id, email, name, password_hash, provider, verified, verify_token, verify_expires) VALUES (?, ?, ?, ?, 'email', 0, ?, ?)")
        .run("email-" + makeId(), email, displayName, passwordHash, verifyToken, verifyExpires);
    }
    await sendVerificationEmail(email, displayName, verifyToken);
    res.json({ ok: true });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ── Email verification ────────────────────────────────────────────────────────
router.get("/api/auth/verify", (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Missing token");
  const user = stmtFindByToken.get(token);
  if (!user) return res.send(verifiedErrorPage("Invalid or already used verification link."));
  if (new Date(user.verify_expires) < new Date()) return res.send(verifiedErrorPage("This verification link has expired. Please register again."));
  db.prepare("UPDATE users SET verified=1, verify_token=NULL, verify_expires=NULL WHERE id=?").run(user.id);
  res.redirect(`${FRONTEND_ORIGIN}?verified=1`);
});

// ── Email login ───────────────────────────────────────────────────────────────
router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    const user = stmtFindByEmail.get(email);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.password_hash) return res.status(401).json({ error: "This account uses Google Sign-In. Please use the Google button.", code: "google_account" });
    if (!user.verified) return res.status(403).json({ error: "Please verify your email before signing in. Check your inbox.", code: "unverified" });
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

// ── Resend verification ───────────────────────────────────────────────────────
router.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const user = stmtFindByEmail.get(email);
    if (!user || user.verified) return res.json({ ok: true });
    const tokenStillValid = user.verify_token && user.verify_expires && new Date(user.verify_expires) > new Date();
    const verifyToken   = tokenStillValid ? user.verify_token : crypto.randomBytes(32).toString("hex");
    const verifyExpires = tokenStillValid ? user.verify_expires : new Date(Date.now() + VERIFY_TTL_MS).toISOString();
    if (!tokenStillValid) db.prepare("UPDATE users SET verify_token=?, verify_expires=? WHERE id=?").run(verifyToken, verifyExpires, user.id);
    await sendVerificationEmail(email, user.name, verifyToken);
    res.json({ ok: true });
  } catch (e) {
    console.error("Resend error:", e);
    res.status(500).json({ error: "Could not resend email. Please try again." });
  }
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
router.get("/auth/google/login", async (req, res) => {
  if (!googleClient) return res.status(503).send("Google OAuth not configured");
  cleanupStates();
  const returnTo = requireReturnTo(req);
  const state    = makeId();
  oauthStates.set(state, { returnTo, createdAt: now() });
  res.redirect(googleClient.authorizationUrl({ scope: "openid email profile", state, prompt: "select_account" }));
});

router.get("/auth/google/callback", async (req, res) => {
  if (!googleClient) return res.status(503).send("Google OAuth not configured");
  try {
    const params = googleClient.callbackParams(req);
    const st     = oauthStates.get(params.state);
    if (!st) return res.status(400).send("Invalid state");
    oauthStates.delete(params.state);
    const claims = (await googleClient.callback(process.env.GOOGLE_REDIRECT_URI, params, { state: params.state })).claims();
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
