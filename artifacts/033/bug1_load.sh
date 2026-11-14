#!/bin/bash
# Spec 033 bug 1 load test (runs ON the VPS). Usage: bug1_load.sh OUTDIR
# 3 demo URLs x 30 calls (1-8 s random gaps, one loop per URL) + Ask poll every 3 s + stars every 60 s.
OUT=${1:-/tmp/bug1}; mkdir -p "$OUT"; B=${B:-http://127.0.0.1:8002}
ASK="$B/api/ask?q=How%20did%20the%20Winter%20War%20end%3F&ui=en"
( while :; do curl -s --compressed -o /dev/null "$ASK"; sleep 3; done ) & P1=$!
( while :; do curl -s --compressed -o /dev/null "$B/api/stars"; sleep 60; done ) & P2=$!
run() { # name url
  for i in $(seq 30); do
    curl -s --compressed -o "$OUT/$1.body" -w '%{time_starttransfer} %{time_total}\n' "$2" >> "$OUT/$1.ttfb"
    sha256sum < "$OUT/$1.body" | cut -c1-16 >> "$OUT/$1.sha"
    sleep $((RANDOM%8+1))
  done
}
PIDS=""
run asof2006 "$B/api/asof/1256?at=2006-12-31" & PIDS="$PIDS $!"
run asof2012 "$B/api/asof/1256?at=2012-12-31" & PIDS="$PIDS $!"
run card2006 "$B/api/diff/1256?from=1862876&to=23500447" & PIDS="$PIDS $!"
run diff2012 "$B/api/diff/1256?from=12468838&to=23500447" & PIDS="$PIDS $!"
wait $PIDS
kill $P1 $P2 2>/dev/null
for n in asof2006 asof2012 card2006 diff2012; do
  echo "$n sha-unique=$(sort -u $OUT/$n.sha | wc -l) $(sha256sum < $OUT/$n.body | cut -c1-16)"
  cut -d' ' -f1 $OUT/$n.ttfb | sort -n | awk -v n=$n '{a[NR]=$1; if($1>0.5)o++} END{printf "%s n=%d p50=%.0fms p95=%.0fms max=%.0fms over500=%d\n", n, NR, a[int((NR+1)/2)]*1000, a[int(NR*0.95+0.5)]*1000, a[NR]*1000, o}'
done
