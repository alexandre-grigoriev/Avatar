# Docker Deployment — Troubleshooting

## SMTP / Email not working

### Symptom: `bind EADDRNOTAVAIL <ip>`
The IP set in `SMTP_SOURCE_IP` does not exist inside the Docker container.
Docker containers run in an isolated network namespace and cannot bind to host interface IPs.

**Fix:** Use `network_mode: host` for the backend container so it shares the host's network
namespace and can see all host interfaces. nginx (frontend) connects to the backend via
`127.0.0.1:3001` in this mode.

### Symptom: `SMTP_SOURCE_IFACE="wlo1" not found. Available: lo, eth0`
The container cannot see the host's network interfaces — `network_mode: host` is not active.
The `docker-compose.release.yml` on the server was not updated (only the image was pulled,
not the compose file itself).

**Fix:** Manually update `docker-compose.release.yml` on the server to add `network_mode: host`
to both the backend and frontend services, and remove the `networks:` section.
The compose file is NOT part of the Docker image — it must be edited on the server directly.

### Symptom: Connection timeout on port 465 (Gmail SMTP)
Gmail SMTP port 465 is blocked on the corporate ethernet (`enp5s0`).
The WiFi interface (`wlo1`) can reach it, but Docker routes traffic through the default route.

**Fix:** Add a host-level routing rule to send all port-465 traffic through `wlo1`:
```bash
# One-time setup (already done on ML-Prod):
echo "200 smtp_via_wifi" | sudo tee -a /etc/iproute2/rt_tables
sudo ip route add default via 172.31.180.1 dev wlo1 table smtp_via_wifi
sudo ip route add 172.31.180.0/22 dev wlo1 src 172.31.181.133 table smtp_via_wifi
sudo iptables -t mangle -A OUTPUT -p tcp --dport 465 -j MARK --set-mark 200
sudo ip rule add fwmark 200 lookup smtp_via_wifi

# Persistent across reboots:
sudo systemctl enable --now smtp-wifi-routing.service
```
The systemd service file is at `/etc/systemd/system/smtp-wifi-routing.service`.

### Symptom: `401 Unauthorized` on `/api/quiz/send-results`
Sessions are stored in memory and are wiped on every backend restart.
The user was logged in before the restart but their session is now gone.

**Fix:** Log out and log back in after each backend restart. Quiz results email sending
does not require authentication (the route has `requireAuth` removed intentionally —
quiz takers may not be logged in).

### Symptom: Email sent (in Gmail Sent folder) but not received at HORIBA address
HORIBA's corporate Exchange server filters emails from external Gmail senders.

**Fix:** Check the Junk/Spam folder in Outlook. Mark `alexandre.grigoriev@gmail.com`
as a trusted sender, or configure the quiz `sendto` address to use a Gmail address instead.

### SMTP_FROM must match the Gmail account
Gmail SMTP rejects or silently rewrites the FROM address if it does not match the
authenticated account. Always use:
```env
SMTP_FROM="HORIBA AVATAR Platform" <alexandre.grigoriev@gmail.com>
```

---

## nginx not reachable after `network_mode: host`

### Symptom: `ERR_CONNECTION_REFUSED` after changing docker-compose
When both services use `network_mode: host`, the nginx config must listen on the actual
exposed ports (`5236`/`5237`) rather than `443`/`80`, and proxy to `127.0.0.1:3001`
instead of `backend:3001` (Docker DNS is not available in host mode).

**Fix:** `docker/nginx.conf` already contains the correct configuration. If the site
goes down after a compose change, verify the compose file on the server is correct and
that the latest frontend image (with the updated nginx.conf) has been pulled.

---

## API keys not baked into the Docker image

### Symptom: TTS works in dev but returns 403 on the server
`VITE_TTS_API_KEY` was missing from the `build.args` section in `docker-compose.yml`.
Vite dev server reads `frontend/.env` directly, so dev works. The Docker build receives
an empty string for the key, which overrides the `.env` file and produces `?key=` (empty)
in TTS requests.

**Fix:** Both keys must be declared in `docker-compose.yml` under `frontend.build.args`:
```yaml
args:
  VITE_GEMINI_API_KEY: ${VITE_GEMINI_API_KEY}
  VITE_TTS_API_KEY: ${VITE_TTS_API_KEY}
```
And in `docker/Dockerfile.frontend`:
```dockerfile
ARG VITE_GEMINI_API_KEY
ARG VITE_TTS_API_KEY
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV VITE_TTS_API_KEY=$VITE_TTS_API_KEY
```
Keys are sourced from `docker/.env` at build time and embedded into the React bundle.
