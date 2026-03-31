#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <environment> [team-scope-id] [project-url]"
  echo "  environment   : vercel environment (production | preview | development). default: production"
  echo "  team-scope-id : optional vercel team id (e.g. team_xxx)"
  echo "  Note: project-url is ignored (kept for compatibility)."
  echo "Required env vars:"
  echo "  DATABASE_URL : Local Postgres connection string"
  echo "  CONDUCTOR_BASE_URL    : Optional, default http://localhost:8080/api"
  exit 1
fi

TARGET_ENV="${1:-production}"
TEAM_SCOPE="${2:-}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required."
  exit 1
fi

SCOPE_ARGS=()
if [[ -n "$TEAM_SCOPE" ]]; then
  SCOPE_ARGS+=(--scope "$TEAM_SCOPE")
fi

echo "Adding DATABASE_URL (${TARGET_ENV})..."
printf '%s\n' "$DATABASE_URL" | npx vercel env add DATABASE_URL "$TARGET_ENV" "${SCOPE_ARGS[@]}" --yes

if [[ -n "${CONDUCTOR_BASE_URL:-}" ]]; then
  echo "Adding CONDUCTOR_BASE_URL (${TARGET_ENV})..."
  printf '%s\n' "$CONDUCTOR_BASE_URL" | npx vercel env add CONDUCTOR_BASE_URL "$TARGET_ENV" "${SCOPE_ARGS[@]}" --yes
fi

echo "Done."
