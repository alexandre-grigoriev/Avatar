/**
 * email.js — SMTP transporter + verification email
 */
import "dotenv/config";
import dns from "dns";
import os from "os";
import nodemailer from "nodemailer";
import { APP_BASE_URL, FRONTEND_ORIGIN } from "./shared.js";

export const SMTP_FROM = process.env.SMTP_FROM ||
  (process.env.SMTP_USER ? `"AVATAR Platform" <${process.env.SMTP_USER}>` : '"AVATAR Platform" <noreply@avatar.horiba.com>');

const _smtpHost = process.env.SMTP_HOST || null;
const _smtpPort = parseInt(process.env.SMTP_PORT || "465");
// Default: SSL (secure=true) when port 465, STARTTLS (false) otherwise
const _smtpSecure = process.env.SMTP_SECURE !== undefined
  ? process.env.SMTP_SECURE === "true"
  : _smtpPort === 465;

// SMTP_SOURCE_IFACE: name of the network interface to bind outgoing SMTP connections to.
// Used when the server has multiple NICs and only one (e.g. a WiFi adapter named
// "horiba_restricted") can reach the SMTP server (Gmail port 465).
function getIfaceIp(ifaceName) {
  if (!ifaceName) return null;
  const ifaces = os.networkInterfaces();
  const entries = ifaces[ifaceName];
  if (!entries) {
    console.warn(`SMTP_SOURCE_IFACE="${ifaceName}" not found. Available: ${Object.keys(ifaces).join(", ")}`);
    return null;
  }
  const ipv4 = entries.find(a => a.family === "IPv4" && !a.internal);
  if (!ipv4) { console.warn(`SMTP_SOURCE_IFACE="${ifaceName}": no IPv4 address found`); return null; }
  console.log(`SMTP source address: ${ipv4.address} (${ifaceName})`);
  return ipv4.address;
}

// Both containers run with network_mode:host so the container sees all host interfaces.
// SMTP_SOURCE_IFACE resolves to the actual host NIC IP (e.g. wlo1 → 172.31.181.133).
// SMTP_SOURCE_IP is an explicit override if interface lookup is not desired.
const _localAddress =
  getIfaceIp(process.env.SMTP_SOURCE_IFACE || null) ||
  process.env.SMTP_SOURCE_IP ||
  null;

// For SSL (port 465) use the hostname directly so SNI works correctly.
// For plain/STARTTLS, pre-resolve to IPv4 for internal servers that don't respond on IPv6.
const _smtpHostResolved = _smtpHost && !_smtpSecure
  ? await new Promise((resolve) =>
      dns.resolve4(_smtpHost, (err, addrs) => {
        const ip = !err && addrs?.length ? addrs[0] : _smtpHost;
        if (!err) console.log(`SMTP ${_smtpHost} → ${ip} (IPv4)`);
        resolve(ip);
      })
    )
  : _smtpHost;

if (_smtpHost) {
  console.log("── SMTP config ───────────────────────────────────");
  console.log("  host    :", _smtpHostResolved);
  console.log("  port    :", _smtpPort, _smtpSecure ? "(SSL)" : "(STARTTLS)");
  console.log("  user    :", process.env.SMTP_USER || "(none)");
  console.log("  from    :", SMTP_FROM);
  console.log("  localIP :", _localAddress || "(not bound — any interface)");
  console.log("──────────────────────────────────────────────────");
} else {
  console.log("SMTP not configured — emails printed to console only.");
}

export const transporter = nodemailer.createTransport(
  _smtpHostResolved
    ? {
        host:              _smtpHostResolved,
        port:              _smtpPort,
        secure:            _smtpSecure,
        localAddress:      _localAddress || undefined,
        connectionTimeout: 30_000,
        greetingTimeout:   30_000,
        socketTimeout:     60_000,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        tls: { servername: _smtpHost, rejectUnauthorized: false },
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
