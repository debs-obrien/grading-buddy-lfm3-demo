#!/usr/bin/env bash
# Deploy Grading Buddy v2 to Cloudflare Pages.
# Project name: grading-buddy-lfm3-demo
#
# Do NOT pre-gzip ORT wasm. Cloudflare Pages ignores Content-Encoding from
# _headers, so a pre-gzipped .wasm is served as raw gzip bytes and browsers fail
# with: WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 1f 8b …
# Pages also rejects any single file over 25 MiB; the asyncify wasm is ~25.6 MiB
# and is loaded at runtime from jsDelivr by the worker (see shared/ort.ts).
set -euo pipefail
cd "$(dirname "$0")"

npm ci
npm test
npm run typecheck
npm run build

echo "Largest files in dist/:"
find dist -type f -printf '%s %p\n' | sort -n | tail -20

# Fail if anything is over the Pages 25 MiB limit.
while IFS= read -r line; do
  bytes=${line%% *}
  file=${line#* }
  if [ "$bytes" -ge 26214400 ]; then
    echo "ERROR: $file is $bytes bytes (>= 25 MiB). Do not pre-gzip; do not ship asyncify.wasm in dist/." >&2
    exit 1
  fi
done < <(find dist -type f -printf '%s %p\n')

if find dist -type f -name '*.wasm' | grep -q asyncify; then
  echo "ERROR: asyncify wasm must not be in dist/; worker loads it from jsDelivr." >&2
  exit 1
fi

echo "Ready to deploy. Run (when you mean to publish):"
echo "  npx wrangler pages deploy dist --project-name grading-buddy-lfm3-demo"
# Intentionally not run here — the interview demo is deployed only when asked.
