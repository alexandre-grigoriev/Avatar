/**
 * routes/users.js — user management (admin only)
 */
import express from "express";
import { sessions, stmtAllUsers, stmtUpdateRole, requireAuth, requireAdmin } from "../shared.js";

export const router = express.Router();

router.get("/api/users", requireAuth, requireAdmin, (req, res) => {
  res.json(stmtAllUsers.all());
});

router.put("/api/users/:id/role", requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!["admin", "contributor", "user"].includes(role))
    return res.status(400).json({ error: "Invalid role. Must be admin | contributor | user" });
  const info = stmtUpdateRole.run(role, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "User not found" });
  for (const [, session] of sessions)
    if (session.user.id === req.params.id) session.user.role = role;
  res.json({ ok: true });
});
