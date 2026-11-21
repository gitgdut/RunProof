#!/usr/bin/env bash
# Regenerates abi/*.json from the current sources. Run from repo root.
set -euo pipefail
forge build >/dev/null
for c in GameRegistry CheatRegistry RunProofCore RecordNFT; do
  forge inspect "$c" abi --json > "abi/$c.json"
done
echo "ABIs written to abi/"
