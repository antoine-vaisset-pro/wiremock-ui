#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:4200}"
OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/docs/screenshots"
mkdir -p "$OUTPUT_DIR"

declare -A pages=(
  [dashboard]="/ui/dashboard"
  [stub-list]="/ui/stubs"
  [stub-detail]="/ui/stubs/new"
  [request-logs]="/ui/requests"
  [http-requester]="/ui/requester"
  [recording-studio]="/ui/recording"
)

for name in "${!pages[@]}"; do
  npx --yes playwright screenshot \
    --device="Desktop Chrome" \
    --viewport-size="1440,900" \
    "${BASE_URL}${pages[$name]}" \
    "$OUTPUT_DIR/$name.png"
done
