/**
 * server.js — entry point: app setup, middleware, router mounting, startup
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { UPLOADS_DIR, FRONTEND_ORIGIN, PORT } from "./shared.js";
import { router as authRouter, initGoogle } from "./routes/auth.js";
import { router as usersRouter } from "./routes/users.js";
import { router as presentationsRouter } from "./routes/presentations.js";
import { router as knowledgeBaseRouter } from "./routes/knowledgeBase.js";
import { initKnowledgeBase } from "./kb.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(authRouter);
app.use(usersRouter);
app.use(presentationsRouter);
app.use(knowledgeBaseRouter);

// ── Startup ───────────────────────────────────────────────────────────────────
await initGoogle();
await initKnowledgeBase();

process.on("uncaughtException",  (err) => { console.error("Uncaught:", err.message); process.exit(1); });
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

const server = app.listen(PORT, () => {
  console.log(`Backend  → http://localhost:${PORT}`);
  console.log(`Frontend → ${FRONTEND_ORIGIN}`);
});
server.on("error", (err) => { console.error(`Failed to start: ${err.message}`); process.exit(1); });
