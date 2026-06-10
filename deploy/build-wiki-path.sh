#!/usr/bin/env bash
# Build wiki SPA for larpscape.net/wiki/ mirror path.
set -euo pipefail
cd "$(dirname "$0")/.."
export WIKI_BASE=/wiki
export WIKI_OUT=../dist-wiki-path
tsx scripts/build-wiki.ts
vite build --config wiki/vite.config.ts
