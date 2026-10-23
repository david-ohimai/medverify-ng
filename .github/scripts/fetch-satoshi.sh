#!/usr/bin/env bash
# Downloads the Satoshi font (Fontshare, ITF Free Font License) into the given
# folder. The licence allows embedding the font in the app but not
# redistributing the files, so they are fetched at build time instead of
# being committed.
set -euo pipefail

DEST="${1:?usage: fetch-satoshi.sh <dest-dir>}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL --retry 3 -o "$WORK/satoshi.zip" "https://api.fontshare.com/v2/fonts/download/satoshi"
unzip -q "$WORK/satoshi.zip" -d "$WORK/out"

mkdir -p "$DEST"
for weight in Light Regular Medium Bold Black; do
  cp "$WORK/out/Satoshi_Complete/Fonts/OTF/Satoshi-$weight.otf" "$DEST/"
done
echo "Satoshi fonts in $DEST:"
ls "$DEST"
