# AVATAR

## 11. Docker & Deployment
### Start/Stop Scripts
- Runs the container with the volume mount, port mapping, and .env file
- Prints the URL to access the app
- Optionally opens the browser
- Stops and removes the running container
- Does NOT remove the volume (data persists)

** 'scripts/start_pc.ps1' ** / ** 'scripts/stop_pc.ps1' ** : PowerShell for Windows.

All scripts should be idempotent — safe to run multiple times.

### Optional Cloud Deployment

The container is designed to deploy to AWS App Runner, Render, or any container platform. A Terraform configuration for App Runner may be provided in a deploy/ directory as a stretch goal, but is not part of the core build.

## 12. Testing Strategy
### Unit Tests (within 'frontend/' and 'backend/')

** Backend (pytest) **:

- LLM: structured output parsing handles all valid schemas, graceful handling of malformed responses, trade validation within chat flow
 -API routes: correct status codes, response shapes, error handling