# CLAUDE.md

## Project: AVATAR

---

## Deployment

### Docker Execution

The application is containerized and must be run using Docker.

Responsibilities:
- Run the container with:
  - volume mount (data persistence)
  - port mapping
  - `.env` configuration file
- Print the access URL after startup
- Optionally open the browser

---

### Start / Stop Scripts

Windows:
- scripts/start_pc.ps1
- scripts/stop_pc.ps1

All scripts MUST be:
- Idempotent
- Safe to execute multiple times

---

### Cloud Deployment (Optional)

Target platforms:
- AWS App Runner
- Render
- Any container-based platform

Optional:
- Terraform config in deploy/
Not part of core requirements

---

## Testing Strategy

Unit tests must cover:
- frontend/
- backend/

### Backend (pytest)

LLM Integration:
- Structured outputs follow defined schemas
- Handle malformed responses gracefully
- Validate trades within chat flow

API Routes:
- Correct HTTP status codes
- Proper response structure
- Robust error handling

---

## Coding Standards (IMPORTANT)

General Principles:
- Simplicity first: avoid overengineering
- Write minimal, clear, readable code
- Prefer explicit over implicit behavior

Structure:
- One responsibility per module/function
- Keep functions small and composable
- Use clear naming conventions

Error Handling:
- Do NOT overuse defensive programming
- Avoid unnecessary instance/type checks
- Handle only meaningful exceptions

Comments & Documentation:
- Comments only when necessary
- No redundant comments
- Keep README concise
- No emojis in code or documentation

Execution:
- Prefer reproducible execution via scripts
- Use Docker for consistency across environments

Testing:
- Every critical function must be testable
- Cover edge cases systematically

LLM / Agent Usage:
- Validate all AI-generated outputs
- Enforce schema validation
- Do not trust raw outputs without checks

---

## Guidelines

- Keep implementation simple and robust
- Prioritize correctness over optimization
- Ensure reproducibility (Docker-first)
- Design for safe iteration (scripts + tests)
