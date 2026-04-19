#!/usr/bin/env bash
# docker/push.sh — build images and push to Docker Hub (aipoclab).
# Linux/macOS equivalent of push.ps1
#
# Usage (from ANY directory inside the project):
#   bash docker/push.sh           # pushes :latest
#   bash docker/push.sh 1.2.0     # pushes :1.2.0 AND :latest

set -euo pipefail

TAG="${1:-latest}"
HUB_ORG="aipoclab"
BACKEND_IMAGE="${HUB_ORG}/avatar-backend"
FRONTEND_IMAGE="${HUB_ORG}/avatar-frontend"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: docker/.env not found."
  echo "       Copy docker/.env.example to docker/.env and fill in VITE_GEMINI_API_KEY."
  exit 1
fi

# Load KEY=VALUE pairs from .env
set -o allexport
# shellcheck disable=SC1090
source <(grep -E '^\s*[^#=\s].*=' "${ENV_FILE}")
set +o allexport

if [[ -z "${VITE_GEMINI_API_KEY:-}" ]]; then
  echo "ERROR: VITE_GEMINI_API_KEY is not set in docker/.env"
  exit 1
fi

echo "==> Building images (this may take several minutes on first build)..."
pushd "${SCRIPT_DIR}" > /dev/null
docker compose build

if [[ "${TAG}" != "latest" ]]; then
  echo "==> Tagging :${TAG}..."
  docker tag "${BACKEND_IMAGE}:latest"  "${BACKEND_IMAGE}:${TAG}"
  docker tag "${FRONTEND_IMAGE}:latest" "${FRONTEND_IMAGE}:${TAG}"
fi

echo "==> Pushing to Docker Hub..."
docker push "${BACKEND_IMAGE}:latest"
docker push "${FRONTEND_IMAGE}:latest"
if [[ "${TAG}" != "latest" ]]; then
  docker push "${BACKEND_IMAGE}:${TAG}"
  docker push "${FRONTEND_IMAGE}:${TAG}"
fi

popd > /dev/null

echo ""
echo "==> Done."
echo "    ${BACKEND_IMAGE}:latest"
echo "    ${FRONTEND_IMAGE}:latest"
echo ""
echo "On the Linux server:"
echo "  docker compose pull && docker compose up -d"
