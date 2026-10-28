#!/usr/bin/env bash
# A dump of every person's database in backups/, kept for 14 days. Each Dossier
# also makes its own nightly backup inside its data volume; this is the
# server-level one. To run it every night at 02:30, add this with `crontab -e`:
#
#   30 2 * * * /path/to/dossier/friends/backup.sh >/dev/null 2>&1

source "$(dirname "$0")/lib.sh"
need_setup
mkdir -p backups
day="$(date +%Y-%m-%d)"
for name in $(people); do
  dc exec -T db pg_dump -U dossier -Fc "$(db_name "$name")" > "backups/$name-$day.dump"
done
chmod 600 backups/*.dump 2>/dev/null || true
find backups -name '*.dump' -mtime +14 -delete
say "Backed up $(people | wc -l | tr -d ' ') Dossier(s) to $FRIENDS_DIR/backups."
