#!/usr/bin/env bash
# Trim the clip sections listed in data/test01/timeline.json and convert them to
# H.264 1080x1920 30fps (rotation applied) under public/test01/ for Remotion.
# iPhone footage is HLG HDR (BT.2020), so it is tone-mapped to SDR BT.709.
# Usage: scripts/prepare-test01.sh <directory containing IMG_xxxx.mov>
set -euo pipefail

SRC_DIR=${1:?usage: $0 <source dir>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT_DIR="$ROOT/public/test01"
mkdir -p "$OUT_DIR"

TONEMAP="zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=linear:desat=2,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"

node -e '
const t = require(process.argv[1]);
for (const telop of t.telops)
  for (const c of telop.clips)
    console.log([c.segment, t.assets[c.asset].file, c.start, c.end].join(" "));
' "$ROOT/data/test01/timeline.json" | while read -r seg file start end; do
  src=$(find "$SRC_DIR" -maxdepth 1 -name "*$file" | head -1)
  [ -n "$src" ] || { echo "missing source: $file" >&2; exit 1; }
  ffmpeg -v error -y -i "$src" -ss "$start" -to "$end" \
    -vf "$TONEMAP,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" \
    -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -map 0:v:0 -map 0:a:0 -movflags +faststart \
    "$OUT_DIR/$seg.mp4" </dev/null
  echo "$seg <- $file [$start-$end]"
done
