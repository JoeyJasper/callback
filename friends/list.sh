#!/usr/bin/env bash
# Everyone's address, whether their Dossier is running, and its memory use.

source "$(dirname "$0")/lib.sh"
need_setup
domain="$(setting DOMAIN)"
printf '%-16s %-48s %-10s %s\n' "PERSON" "ADDRESS" "STATE" "MEMORY"
for name in $(people); do
  id="$(dc ps -q "app-$name" 2>/dev/null || true)"
  state="stopped"; memory="-"
  if [ -n "$id" ]; then
    state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
    memory="$(docker stats --no-stream --format '{{.MemUsage}}' "$id" | cut -d/ -f1)"
  fi
  printf '%-16s %-48s %-10s %s\n' "$name" "https://$name.$domain" "$state" "$memory"
done
