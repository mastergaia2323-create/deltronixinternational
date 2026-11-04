#!/usr/bin/env bash
# Launches the Google Search Console MCP server (mcp-search-console, from
# github.com/AminForou/mcp-gsc) with service-account auth.
#
# Credentials come from the environment, never from the repo:
#   GSC_SERVICE_ACCOUNT_JSON  - full JSON of the service account key (e.g. a
#                               cloud environment secret), written to a private
#                               temp file at startup; or
#   GSC_CREDENTIALS_PATH      - path to an existing key file (local machines).
set -euo pipefail

if [[ -z "${GSC_CREDENTIALS_PATH:-}" ]]; then
  if [[ -z "${GSC_SERVICE_ACCOUNT_JSON:-}" ]]; then
    echo "gsc-mcp: set GSC_SERVICE_ACCOUNT_JSON or GSC_CREDENTIALS_PATH" >&2
    exit 1
  fi
  creds_dir="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/gsc-mcp-$(id -u)"
  mkdir -p "$creds_dir"
  chmod 700 "$creds_dir"
  umask 077
  printf '%s' "$GSC_SERVICE_ACCOUNT_JSON" > "$creds_dir/service_account.json"
  export GSC_CREDENTIALS_PATH="$creds_dir/service_account.json"
fi

exec uvx mcp-search-console==0.4.1
