#!/usr/bin/env bash
# Brings back a Dossier taken offline with remove-person.sh, data and password as they were.
#
#   ./restore-person.sh priya

source "$(dirname "$0")/lib.sh"
need_setup
[ $# -eq 1 ] || die "Usage: ./restore-person.sh <name>"
name="$1"
[ -f "removed/$name.env" ] || die "There's no removed Dossier for $name."
mv "removed/$name.env" "people/$name.env"
regenerate
dc up -d "app-$name"
reload_caddy
say "$name's Dossier is back at https://$name.$(setting DOMAIN), with their old password."
