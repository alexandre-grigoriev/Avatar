# DEPLOYMENT.md — Avatar

Deployment guide for production using Docker Compose.  
All deployment artifacts live in the `docker/` folder.

Two deployment modes are supported:

| Mode | When to use |
|------|-------------|
| **A — Package deploy** (recommended) | No git on the server. Build images on dev machine, ship via Docker Hub. |
| **B — Clone & build** | Git is available on the server. Clone the repo and build images there. |

---

## Mode A — Deploy without cloning the repository

### A1 — Via Docker Hub (recommended)

Images are pushed to `aipoclab` on Docker Hub.  
The server only needs Docker and a compose file — no source code, no tarballs.

#### On your dev machine (Windows) — push images

```powershell
# First time only — log in to Docker Hub
docker login -u aipoclab

# Copy docker\.env.example → docker\.env and set VITE_GEMINI_API_KEY
copy docker\.env.example docker\.env
notepad docker\.env

# Build and push (run from the project root)
.\docker\push.ps1              # pushes aipoclab/avatar-backend:latest
                               #        aipoclab/avatar-frontend:latest

# To push a versioned release as well:
.\docker\push.ps1 1.2.0        # pushes :1.2.0 AND :latest
```

> **PowerShell execution policy:** if scripts are blocked, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

> **Note on build time:** the backend image includes LibreOffice (for PPTX conversion).
> The first build takes ~10–15 minutes. Subsequent builds reuse the layer cache.

#### On the Linux server — first install

Copy the files below to the server (no source code needed):

```
docker/docker-compose.release.yml  →  ~/avatar/docker-compose.yml
docker/.env.example                →  ~/avatar/.env.example
docker/data/backend.env.example    →  ~/avatar/data/backend.env.example
docker/install.sh                  →  ~/avatar/install.sh
```

Using `scp` from your Windows machine:

```powershell
ssh user@server "mkdir -p ~/avatar/data"
scp docker\docker-compose.release.yml  user@server:~/avatar/docker-compose.yml
scp docker\.env.example                user@server:~/avatar/
scp docker\data\backend.env.example    user@server:~/avatar/data/
scp docker\install.sh                  user@server:~/avatar/
```

Then on the server:

```bash
cd ~/avatar
bash install.sh
```

`install.sh` will:
- Install Docker Engine if not present
- Create `data/` directories and an empty `users.db`
- Open `.env` and `data/backend.env` in `nano` for credentials
- Generate a self-signed SSL certificate if none exists
- Run `docker compose pull` (pulls images from Docker Hub)
- Start the stack

#### Updating the application

```powershell
# Windows dev machine — after code changes
.\docker\push.ps1
```

```bash
# Linux server — pull new images and restart
cd ~/avatar
docker compose pull && docker compose up -d
```

> `data/` is never touched — users, presentations, and credentials survive every update.

---

### A2 — Via tarball (air-gapped servers, no internet)

> Use this only if the target server cannot reach Docker Hub.

```powershell
# Windows dev machine — build and save images as tarballs
cd docker
docker compose build
docker save aipoclab/avatar-backend:latest  | gzip > avatar-backend.tar.gz
docker save aipoclab/avatar-frontend:latest | gzip > avatar-frontend.tar.gz
```

Transfer to the server:
```powershell
scp docker\avatar-backend.tar.gz  user@server:~/
scp docker\avatar-frontend.tar.gz user@server:~/
```

On the server:
```bash
docker load < ~/avatar-backend.tar.gz
docker load < ~/avatar-frontend.tar.gz
cd ~/avatar
docker compose up -d
```

---

## Mode B — Clone & build on the server

Use this if git is available on the server and you prefer to build there.

```bash
git clone <repo-url> avatar
cd avatar

# Configure
cp docker/.env.example docker/.env
nano docker/.env                       # set VITE_GEMINI_API_KEY
mkdir -p docker/data
cp docker/data/backend.env.example docker/data/backend.env
nano docker/data/backend.env          # set all mandatory fields

# Create data stubs
touch docker/data/users.db
mkdir -p docker/data/uploads

# Generate SSL certificate (see SSL section below)

# Build and start
cd docker
docker compose up -d --build
```

---

## Architecture

```
Browser
  │
  ▼
[Nginx :443]  ─── serves ────▶  React SPA (static files + talking_heads/)
  │
  │  reverse-proxy
  ├── /api/*      ──────────▶  [Backend Node.js :3001]
  ├── /auth/*     ──────────▶         │
  └── /uploads/*  ──────────▶         ├── SQLite  (users.db)
                                       ├── uploads/ (presentation slides)
                                       ├── Neo4j  (knowledge base, external)
                                       └── Python (LibreOffice / PyMuPDF)
```

- **Frontend** — React 19 / Vite + TalkingHead 3D avatar; compiled at build time, served by Nginx.
- **Backend** — Node.js / Express; handles auth, presentations, knowledge base, Python script execution.
- **Neo4j** — external instance (not managed by this compose file).
- **SQLite** — single file `users.db`; lives on the host, mounted into the backend container.
- **Python** — `pptx_import.py` (LibreOffice headless) and `pdf_to_images.py` (PyMuPDF) run inside the backend container.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Docker Engine | ≥ 24 |
| Docker Compose plugin | ≥ 2.20 |
| Neo4j | 5.x — running and reachable from the Docker host |
| Gemini API key | from [Google AI Studio](https://aistudio.google.com/) |

---

## Directory layout after setup

```
docker/
├── docker-compose.yml
├── .env                     ← compose variables (created from .env.example)
├── .env.example             ← template
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf
└── data/                    ← host-side persistent data (git-ignored)
    ├── backend.env          ← backend runtime config (created from backend.env.example)
    ├── backend.env.example  ← template
    ├── users.db             ← SQLite database (created empty on first deploy)
    └── uploads/             ← presentation slides and content files
```

---

## Step 1 — Create the compose environment file

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env`:

```env
# Port exposed on the host
HTTPS_PORT=5236
HTTP_PORT=5237

# Gemini API key — embedded in the React bundle at build time
VITE_GEMINI_API_KEY=AIzaSy...
```

> **Note:** `VITE_GEMINI_API_KEY` is baked into the React bundle during `docker compose build`.
> Changing it later requires a rebuild: `docker compose build frontend && docker compose up -d frontend`.

---

## Step 2 — Create the backend runtime config

```bash
cp docker/data/backend.env.example docker/data/backend.env
```

Edit `docker/data/backend.env` — mandatory fields:

```env
# Public URL where users reach the app
FRONTEND_ORIGIN=https://172.31.14.92:5236
APP_BASE_URL=https://172.31.14.92:5236

# Neo4j — use the host IP, NOT localhost
NEO4J_URI=bolt://172.31.14.92:7681
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4jadmin

# Gemini (backend — KB ingestion & retrieval)
GEMINI_API_KEY=AIzaSy...

# Admin seed account — auto-approved as admin on first startup
ADMIN_SEED_EMAIL=admin@your-domain.com
```

Optional:

```env
# Email (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="AVATAR Platform" <your@gmail.com>

# Google OAuth
GOOGLE_OAUTH_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://172.31.14.92:5236/auth/google/callback

# LDAP / Active Directory
LDAP_ENABLED=true
LDAP_URL=ldaps://HFRDC01.jy.fr
LDAP_DOMAIN=jy.fr
LDAP_BASE_DN=DC=jy,DC=fr
LDAP_SEARCH_ATTR=sAMAccountName
```

> **LDAP with self-signed certificate:** add `NODE_TLS_REJECT_UNAUTHORIZED=0` to `data/backend.env`.

---

## Step 3 — Initialise persistent data

```bash
touch docker/data/users.db
mkdir -p docker/data/uploads
```

---

## Step 4 — SSL certificate

`nginx.conf` requires SSL — the frontend container will not start without a certificate.

### Option A — Self-signed certificate (IP address, no domain)

```bash
sudo mkdir -p /etc/ssl/avatar
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/ssl/avatar/privkey.pem \
  -out    /etc/ssl/avatar/fullchain.pem \
  -subj   "/CN=172.31.14.92" \
  -addext "subjectAltName=IP:172.31.14.92"

# nginx inside the container must be able to read the key
sudo chmod 644 /etc/ssl/avatar/privkey.pem
```

Browsers will show a one-time security warning — click "Advanced → Proceed".

### Option B — Let's Encrypt (requires a real domain)

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com
sudo mkdir -p /etc/ssl/avatar
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /etc/ssl/avatar/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem  /etc/ssl/avatar/
sudo chmod 644 /etc/ssl/avatar/privkey.pem
```

Auto-renew (add to cron):
```bash
sudo crontab -e
# Add:
0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/your-domain.com/*.pem /etc/ssl/avatar/ && docker compose -f ~/avatar/docker-compose.yml restart frontend
```

---

## Step 5 — Build and start

```bash
# From the docker/ directory
docker compose up -d --build
```

> The first build takes ~10–15 minutes (npm install + LibreOffice in the backend image).

---

## Step 6 — Verify

```bash
docker compose ps
docker compose logs -f

# Backend health
curl -k https://localhost/api/../health
# or directly: curl http://localhost:3001/health
```

Open `https://172.31.14.92:5236` in a browser and log in with the `ADMIN_SEED_EMAIL` account.

---

## Day-2 operations

### Update the application

```bash
git pull
cd docker
docker compose build
docker compose up -d
```

### Update credentials only

```bash
# Edit docker/data/backend.env, then:
docker compose restart backend
```

### Update `VITE_GEMINI_API_KEY`

```bash
# Edit docker/.env, then:
docker compose build frontend
docker compose up -d frontend
```

### View logs

```bash
docker compose logs backend  -f --tail=100
docker compose logs frontend -f --tail=50
```

### Stop / start

```bash
docker compose down      # stops containers, preserves data
docker compose up -d     # restarts without rebuilding
```

### Full reset (presentations only)

```bash
rm -rf docker/data/uploads/*
docker compose restart backend
```

### Full reset (wipe everything including users)

```bash
docker compose down
rm -f docker/data/users.db
rm -rf docker/data/uploads
touch docker/data/users.db && mkdir -p docker/data/uploads
docker compose up -d
```

---

## Neo4j setup

Avatar connects to an **existing** Neo4j 5.x instance. It does not manage Neo4j itself.

Neo4j indexes are created automatically on first backend startup.  
The backend uses:
- `gemini-embedding-001` (3072 dimensions) for embeddings
- `gemini-2.0-flash` for KB enrichment and retrieval

### Neo4j reachability

Use the **host machine's LAN IP** in `NEO4J_URI`, not `localhost` — inside a container, `localhost` resolves to the container itself.

```env
NEO4J_URI=bolt://172.31.14.92:7681   ✓
NEO4J_URI=bolt://localhost:7681       ✗
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Backend exits immediately | Bad `backend.env` (syntax error or missing var) | `docker compose logs backend` |
| Frontend keeps restarting | Certificate not found at `/etc/ssl/avatar/` | Generate cert (Step 4) |
| Frontend restarts, permission denied on privkey | `openssl` creates `privkey.pem` as `600` | `sudo chmod 644 /etc/ssl/avatar/privkey.pem` |
| PPTX import fails | LibreOffice or Python packages issue | `docker compose exec backend python pptx_import.py --help` |
| PDF import fails | PyMuPDF issue | `docker compose exec backend python pdf_to_images.py` |
| Neo4j connection refused | `NEO4J_URI` uses `localhost` | Use host LAN IP instead |
| LDAP login fails with cert error | Self-signed LDAPS cert | Add `NODE_TLS_REJECT_UNAUTHORIZED=0` to `data/backend.env` |
| `VITE_GEMINI_API_KEY` not working | Key not set at build time | `docker compose build frontend && docker compose up -d frontend` |
| Port already in use | Another service on the host | Change `HTTPS_PORT` / `HTTP_PORT` in `docker/.env` |
| After nginx.conf edit, old config served | `nginx.conf` is baked into the image | Rebuild: `docker compose build frontend && docker compose up -d frontend` |
| Uploads 404 after deploy | `UPLOADS_DIR` not set | Ensure `UPLOADS_DIR: /data/uploads` in compose `environment:` |
