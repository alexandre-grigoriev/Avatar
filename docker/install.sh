#!/usr/bin/env bash
# install.sh — first-time setup on the Linux target server.
# Run from inside the deployment directory (where docker-compose.yml lives).
#
# What it does:
#   1. Installs Docker Engine if not present
#   2. Creates data/ directories and stub files
#   3. Prompts to configure env files
#   4. Generates a self-signed SSL certificate if none exists
#   5. Pulls images from Docker Hub and starts the stack

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# ── helpers ────────────────────────────────────────────────────────────────────
green()  { echo -e "\033[0;32m$*\033[0m"; }
yellow() { echo -e "\033[1;33m$*\033[0m"; }
red()    { echo -e "\033[0;31m$*\033[0m"; }
ask()    { read -rp "$(yellow "$1")" "$2"; }

# ── 1. Docker ──────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  green "==> Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  green ""
  green "    Docker installed."
  green "    IMPORTANT: log out and back in so group membership takes effect,"
  green "    then re-run this script."
  exit 0
else
  green "==> Docker already installed: $(docker --version)"
fi

if ! docker compose version &>/dev/null 2>&1; then
  green "==> Docker Compose plugin not found — installing..."
  if command -v apt-get &>/dev/null; then
    if ! apt-cache show docker-compose-plugin &>/dev/null 2>&1; then
      green "    Adding Docker's official apt repository..."
      sudo apt-get install -y ca-certificates curl gnupg
      sudo install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      sudo chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
      sudo apt-get update -qq
    fi
    sudo apt-get remove -y docker-buildx 2>/dev/null || true
    sudo apt-get install -y docker-compose-plugin
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y docker-compose-plugin
  elif command -v yum &>/dev/null; then
    sudo yum install -y docker-compose-plugin
  else
    red "ERROR: Cannot install Docker Compose plugin automatically."
    red "       Please install manually: https://docs.docker.com/compose/install/"
    exit 1
  fi
  green "    Docker Compose installed: $(docker compose version)"
fi

# ── 2. Prepare data directory ──────────────────────────────────────────────────
green "==> Creating data directories..."
mkdir -p data/uploads
if [[ ! -f data/users.db ]]; then
  touch data/users.db
  echo "    Created empty data/users.db"
fi

# ── 3. Configure .env (compose) ────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  yellow ""
  yellow "==> ACTION REQUIRED: edit .env"
  yellow "    Set HTTPS_PORT / HTTP_PORT if the defaults (443/80) are already in use."
  yellow "    VITE_GEMINI_API_KEY is already baked into the Docker Hub image — leave it empty."
  yellow ""
  ask "    Press Enter to open .env in nano (Ctrl+C to edit manually later)..." _
  nano .env
fi

# ── 4. Configure backend.env ───────────────────────────────────────────────────
if [[ ! -f data/backend.env ]]; then
  cp data/backend.env.example data/backend.env
  yellow ""
  yellow "==> ACTION REQUIRED: edit data/backend.env"
  yellow "    Mandatory fields:"
  yellow "      FRONTEND_ORIGIN  — public URL, e.g. https://192.168.1.10:443"
  yellow "      APP_BASE_URL     — same as FRONTEND_ORIGIN"
  yellow "      NEO4J_URI        — bolt://your-neo4j-host:7681 (NOT localhost)"
  yellow "      NEO4J_PASSWORD   — your Neo4j password"
  yellow "      GEMINI_API_KEY   — backend Gemini key"
  yellow "      ADMIN_SEED_EMAIL — first admin account email"
  yellow ""
  ask "    Press Enter to open data/backend.env in nano..." _
  nano data/backend.env
fi

# ── 5. SSL certificate ─────────────────────────────────────────────────────────
if [[ ! -f /etc/ssl/avatar/fullchain.pem ]]; then
  yellow ""
  yellow "==> No SSL certificate found at /etc/ssl/avatar/"
  yellow "    Generating a self-signed certificate (valid 10 years)..."
  HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
  yellow "    Detected host IP: ${HOST_IP}"
  ask "    Enter IP or domain for the certificate [${HOST_IP}]: " CERT_CN
  CERT_CN="${CERT_CN:-${HOST_IP}}"

  sudo mkdir -p /etc/ssl/avatar

  # Determine SAN type (IP or DNS)
  if [[ "${CERT_CN}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    SAN="IP:${CERT_CN}"
  else
    SAN="DNS:${CERT_CN}"
  fi

  sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/ssl/avatar/privkey.pem \
    -out    /etc/ssl/avatar/fullchain.pem \
    -subj   "/CN=${CERT_CN}" \
    -addext "subjectAltName=${SAN}"

  # nginx inside the container must be able to read the key
  sudo chmod 644 /etc/ssl/avatar/privkey.pem

  green "    Certificate generated at /etc/ssl/avatar/"
fi

# ── 6. Pull images from Docker Hub and start ───────────────────────────────────
green "==> Pulling images from Docker Hub (backend image is large — ~1 GB)..."
docker compose pull

green "==> Starting Avatar..."
docker compose up -d

echo ""
green "==> Done."
echo ""
echo "  Stack status : docker compose ps"
echo "  Logs         : docker compose logs -f"
echo "  Stop         : docker compose down"
echo ""
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
HTTPS_PORT=$(grep -E '^HTTPS_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '"' || echo 443)
echo "  Open in browser: https://${HOST_IP}:${HTTPS_PORT}"
echo "  (Accept the self-signed certificate warning on first visit)"
echo ""
