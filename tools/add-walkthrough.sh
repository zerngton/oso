#!/usr/bin/env bash
# Turns a walk-through video (e.g. from Sora) into scroll-scrubbed frames for the hero.
# Usage: tools/add-walkthrough.sh path/to/walkthrough.mp4 [frames=150] [width=1600]
set -euo pipefail
cd "$(dirname "$0")/.."
src="${1:?pass the video file}"
frames="${2:-150}"
width="${3:-1600}"

dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
fps=$(python3 -c "print(round($frames / $dur, 4))")

mkdir -p assets/frames
find assets/frames -name 'f_*.webp' -delete
ffmpeg -v error -i "$src" -vf "fps=$fps,scale=$width:-2:flags=lanczos" -c:v libwebp -quality 78 assets/frames/f_%04d.webp
count=$(find assets/frames -name 'f_*.webp' | wc -l | tr -d ' ')

sed -i -E "s/const WALK = \{ count: [0-9]+,/const WALK = { count: $count,/" site.html
tools/build.sh
echo "$count frames written to assets/frames, WALK.count set to $count"
