# TalkingHead / TTS — Troubleshooting

## TTS returns 403 Forbidden

### Cause 1: Wrong Google Cloud project
The API key must belong to the **AVATAR Project** (`gen-lang-client-0939877538`).
Keys created in other projects will return 403 even if the Cloud Text-to-Speech API
is enabled there.

Use the **TTS API AVATAR** key from the AVATAR Project credentials page.

### Cause 2: VITE_TTS_API_KEY not passed to Docker build
The key is embedded at build time by Vite. If `VITE_TTS_API_KEY` is missing from
`docker-compose.yml` build args, the image is built with an empty key.
Dev works because Vite reads `frontend/.env` directly at dev-server start.

### Cause 3: Wrong SMTP_FROM / key mismatch (unrelated — see docker/TROUBLESHOOTING.md)

---

## TTS returns 200 OK but avatar does not speak — `EncodingError: Unable to decode audio data`

### Cause
TalkingHead auto-detects audio format based on `audio.canPlayType()`. Chrome reports
OGG support, so TalkingHead requests `OGG-OPUS`. Google TTS returns OGG_OPUS at 24 kHz,
which certain Chrome versions fail to decode via `AudioContext.decodeAudioData()`.

### Fix
Force MP3 encoding in `talkinghead.mjs` by swapping the detection order:
```js
// Before (OGG preferred):
if (audio.canPlayType("audio/ogg")) {
  this.ttsAudioEncoding = "OGG-OPUS";
} else if (audio.canPlayType("audio/mp3")) {
  this.ttsAudioEncoding = "MP3";
}

// After (MP3 preferred — more reliable):
if (audio.canPlayType("audio/mp3")) {
  this.ttsAudioEncoding = "MP3";
} else if (audio.canPlayType("audio/ogg")) {
  this.ttsAudioEncoding = "OGG-OPUS";
}
```
This change is already applied in `modules/talkinghead.mjs`. MP3 is universally
supported and lip-sync timepoints (`enableTimePointing`) work with both formats.

---

## Spanish / Portuguese avatar disappears when presentation starts

### Cause
TalkingHead tries to dynamically import `lipsync-{lang}.mjs`. If the module does not
exist, the import fails and the avatar crashes silently.

### Fix
- `lipsync-es.mjs` — created, handles Spanish phoneme-to-viseme rules
- `lipsync-pt.mjs` — created, handles Portuguese phoneme-to-viseme rules

Both modules follow the exact same structure as `lipsync-fr.mjs` and export
`LipsyncEs` / `LipsyncPt` respectively. TalkingHead loads them by convention:
`lipsync-{lang}.mjs` → `Lipsync{Lang}` class.

---

## Google API keys — which key goes where

| Key name (AVATAR Project) | Env var | Used by |
|---|---|---|
| GEMINI API AVATAR | `VITE_GEMINI_API_KEY` | Frontend chat (gemini.ts) |
| TTS API AVATAR | `VITE_TTS_API_KEY` | TalkingHead avatar voice |
| (backend only) | `GEMINI_API_KEY` in `backend.env` | KB ingestion / retrieval |

Keys are set in:
- `frontend/.env` — local dev
- `docker/.env` — Docker image builds (pushed to Docker Hub)
- `docker/data/backend.env` — backend runtime (never baked into image)
