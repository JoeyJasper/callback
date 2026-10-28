#!/usr/bin/env bash
# Takes someone's Callback offline. Their data is kept unless you add --delete-data.
#
#   ./remove-person.sh priya                 offline, data kept (add them again to restore it)
#   ./remove-person.sh priya --delete-data   offline, and their database and files deleted for good

source "$(dirname "$0")/lib.sh"
need_setup
[ $# -ge 1 ] || die "Usage: ./remove-person.sh <name> [--delete-data]"
name="$1"
[ -f "people/$name.env" ] || die "$name doesn't have a Callback. See ./list.sh"

dc stop "app-$name" >/dev/null 2>&1 || true
dc rm -f "app-$name" >/dev/null 2>&1 || true
mkdir -p removed
mv "people/$name.env" "removed/$name.env"
regenerate
reload_caddy

if [ "${2:-}" = "--delete-data" ]; then
  read -r -p "Delete all of $name's data for good? Type their name to confirm: " confirm
  if [ "$confirm" = "$name" ]; then
    dc exec -T db dropdb -U callback --if-exists "$(db_name "$name")"
    docker volume rm "callback-friends_data-$name" >/dev/null 2>&1 || true
    rm -f "removed/$name.env"
    say "$name's Callback and data are deleted."
    exit 0
  fi
  say "Not confirmed: their data is kept."
fi
say "$name's Callback is offline. Their data is kept; to bring it back: ./restore-person.sh $name"
