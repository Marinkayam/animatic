#!/bin/bash
# compose.sh <dir> [crf]: title + each recorded scene (trimmed, captioned) + end -> <dir>/animatic.mp4
set -euo pipefail
cd "$1"; CRF=${2:-24}
F="-r 30 -c:v libx264 -preset veryfast -crf $CRF -pix_fmt yuv420p -an -loglevel error"
ffmpeg -y -loop 1 -t 2.5 -i title.png -vf scale=1440:900 $F 00-title.mp4
ffmpeg -y -loop 1 -t 3.5 -i end.png   -vf scale=1440:900 $F 99-end.mp4
for w in [0-9][0-9]-*.webm; do
  n=${w%.webm}; ts=$(node -p "require('./$n.json').trimStart")
  # fade the caption in over 0.3s
  ffmpeg -y -ss "$ts" -i "$w" -loop 1 -i "cap-$n.png" -filter_complex \
    "[0:v]fps=30,scale=1440:900,setsar=1[v];[1:v]format=rgba,fade=in:st=0.2:d=0.3:alpha=1[c];[v][c]overlay=0:0:shortest=1" $F "$n.mp4"
done
{ echo "file '00-title.mp4'"; for w in [0-9][0-9]-*.webm; do echo "file '${w%.webm}.mp4'"; done; echo "file '99-end.mp4'"; } > list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -c copy animatic.mp4
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 animatic.mp4); s=$(du -k animatic.mp4 | cut -f1)
echo "animatic.mp4: ${d%.*}s, $((s/1024)).$(( (s%1024)*10/1024 )) MB"
