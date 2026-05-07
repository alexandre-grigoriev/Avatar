# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend — run from `frontend/`
```bash
npm run dev      # dev server on :5173
npm run build    # production build → dist/
npm run lint     # ESLint
```

### Backend — run from `backend/`
```bash
node server.js   # starts on :3001
```

### Python (PPTX/PDF import) — project root
```bash
.venv/Scripts/python backend/pptx_import.py <pptx> <out_dir>   # Windows
.venv/bin/python      backend/pptx_import.py <pptx> <out_dir>   # Linux
```

### Docker — run from `docker/`
```powershell
.\push.ps1          # build + push to Docker Hub (aipoclab/avatar-*)
```
```bash
docker compose -f docker-compose.release.yml pull && docker compose -f docker-compose.release.yml up -d
docker compose -f docker-compose.release.yml logs -f backend
```

## Architecture

### Two-service stack
- **Frontend** (`frontend/`) — React 19 + TypeScript + Tailwind v4, Vite (rolldown-vite), port 5173
- **Backend** (`backend/`) — Express ESM, port 3001

In production both containers use `network_mode: host`. nginx (inside the frontend image) listens on ports `5236` (HTTPS) and `5237` (HTTP) and proxies `/api`, `/auth`, `/uploads` to `127.0.0.1:3001`.

In dev, `vite.config.js` proxies `/api`, `/auth`, `/uploads` to `localhost:3001`.

### TalkingHead 3D library
Lives in `frontend/talking_heads/` — never bundled by Vite. A custom `serveStatic` Vite plugin serves it at `/talking_heads/` in dev and copies it to `dist/talking_heads/` on build.

**Loading pattern** (`TalkingHeadAvatar.tsx`): a dynamic `<script type="module">` injects the import at runtime, stores the class on `window.__TalkingHeadClass__`, and signals via `CustomEvent`. Direct Vite imports would fail because Vite can't analyze the `.mjs` files in `/public`.

**Lipsync modules** are dynamically imported by TalkingHead: `lipsync-{lang}.mjs` must export `Lipsync{Lang}`. Available: `en`, `fr`, `es`, `pt`, `ar`, `ja`, `zh`, `ru`. A missing module crashes the avatar silently.

**Audio encoding**: forced to MP3 in `talkinghead.mjs` (OGG-OPUS causes `decodeAudioData` failures in Chrome).

### Authentication
Sessions are in-memory (`Map` in `backend/shared.js`) — wiped on every backend restart. Three auth methods:
- **LDAP** (default): `ldaps://HFRDC01.jy.fr`, attribute `sAMAccountName`, username = lastname only (e.g. `grigoriev`)
- **Google OAuth**: toggled by `GOOGLE_OAUTH_ENABLED`
- **Email/password**: with SMTP email verification

Roles: `admin` > `contributor` > `user`. Middleware: `requireAuth`, `requireAdmin`, `requireContributor` in `shared.js`.

### Knowledge base (Graph RAG)
`backend/kb.js` — Neo4j + Gemini embeddings.
- Embedding: `gemini-embedding-001` (3072 dims)
- Chat: `gemini-2.5-flash`
- Documents enriched and stored in French; translated to user language at query time
- 4 parallel retrieval strategies merged per query

### Presentations & uploads
- Slide images: `uploads/{name}/*.png` (Linux is case-sensitive — `.BMP` ≠ `.bmp`)
- Content: `uploads/{name}/content_{lang}.txt` — slide blocks separated by `\n-------\n`
- Quiz: `uploads/{name}/question.json` — `{ sendto, questions[] }`
- PPTX import: PowerPoint COM on Windows (must be open), LibreOffice headless on Linux

### API keys
| Variable | File | Used by |
|---|---|---|
| `VITE_GEMINI_API_KEY` | `docker/.env`, `frontend/.env` | Frontend chat (browser) |
| `VITE_TTS_API_KEY` | `docker/.env`, `frontend/.env` | TalkingHead TTS (browser) |
| `GEMINI_API_KEY` | `docker/data/backend.env` | KB ingestion/retrieval (server) |

Both `VITE_*` keys are baked into the frontend image at build time via `docker-compose.yml` build args. If a key is missing from `build.args`, the image is built with an empty key — dev works (Vite reads `frontend/.env` directly) but the server returns 403.

### SMTP (production)
Gmail SSL port 465 via WiFi interface `wlo1` (corporate ethernet blocks 465). A systemd service (`smtp-wifi-routing.service`) routes port-465 traffic through `wlo1` using iptables marks + policy routing. `SMTP_SOURCE_IFACE=wlo1` in `backend.env` binds the outgoing socket; visible only because `network_mode: host` exposes all host interfaces to the container.

See `docker/TROUBLESHOOTING.md` and `frontend/talking_heads/TROUBLESHOOTING.md` for diagnosed production issues.
