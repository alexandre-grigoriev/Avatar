/**
 * email.js — SMTP transporter + verification email
 */
import "dotenv/config";
import dns from "dns";
import nodemailer from "nodemailer";
import { APP_BASE_URL, FRONTEND_ORIGIN } from "./shared.js";

export const SMTP_FROM = process.env.SMTP_FROM ||
  (process.env.SMTP_USER ? `"AVATAR Platform" <${process.env.SMTP_USER}>` : '"AVATAR Platform" <noreply@avatar.horiba.com>');

const _smtpHostResolved = process.env.SMTP_HOST
  ? await new Promise((resolve) =>
      dns.resolve4(process.env.SMTP_HOST, (err, addrs) => {
        const ip = !err && addrs?.length ? addrs[0] : process.env.SMTP_HOST;
        if (!err) console.log(`SMTP ${process.env.SMTP_HOST} → ${ip} (IPv4)`);
        resolve(ip);
      })
    )
  : null;

export const transporter = nodemailer.createTransport(
  _smtpHostResolved
    ? {
        host:              _smtpHostResolved,
        port:              parseInt(process.env.SMTP_PORT || "587"),
        secure:            process.env.SMTP_SECURE === "true",
        connectionTimeout: 5_000,
        greetingTimeout:   5_000,
        socketTimeout:     5_000,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        tls: { rejectUnauthorized: false },
      }
    : { jsonTransport: true }
);

function verificationEmailHtml(name, verifyUrl) {
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f5f7;font-family:Inter,system-ui,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#1677ff;padding:28px 36px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">HORIBA</span>
          <span style="font-size:13px;color:rgba(255,255,255,0.75);margin-left:10px;">AVATAR Platform</span>
        </td></tr>
        <tr><td style="padding:36px 36px 24px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Verify your email</p>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hello${name ? " " + name : ""},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
            Thanks for registering on the HORIBA AVATAR Platform.<br>
            Click the button below to confirm your email address and activate your account.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td style="background:#1677ff;border-radius:8px;">
              <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Confirm my email</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">This link expires in <strong>30 minutes</strong>. If you did not create an account, you can safely ignore this email.</p>
          <p style="margin:16px 0 0;font-size:12px;color:#d1d5db;word-break:break-all;">Or copy this link: ${verifyUrl}</p>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #f3f5f7;font-size:12px;color:#9ca3af;">
          HORIBA FRANCE · AI LAB &nbsp;·&nbsp; AVATAR Platform &nbsp;·&nbsp; Do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendVerificationEmail(email, name, token) {
  const verifyUrl = `${APP_BASE_URL}/api/auth/verify?token=${token}`;
  console.log("\n── Verification email ────────────────────────────");
  console.log("To:  ", email);
  console.log("Link:", verifyUrl);
  console.log("─────────────────────────────────────────────────\n");
  if (!process.env.SMTP_HOST) return;
  try {
    await transporter.sendMail({ from: SMTP_FROM, to: email, subject: "Confirm your AVATAR Platform account", html: verificationEmailHtml(name, verifyUrl) });
    console.log("✓ Verification email sent to", email);
  } catch (err) {
    console.error("✗ SMTP send failed:", err.message);
  }
}
