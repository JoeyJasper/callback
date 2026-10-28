#!/usr/bin/env bash
# Gives someone a new password, and signs them out everywhere.
#
#   ./reset-password.sh priya

source "$(dirname "$0")/lib.sh"
need_setup
[ $# -eq 1 ] || die "Usage: ./reset-password.sh <name>"
name="$1"
[ -f "people/$name.env" ] || die "$name doesn't have a Dossier. See ./list.sh"

password="$(random_password)"
hash="$(hash_password "$password")"
[[ "$hash" == argon2id:* ]] || die "Couldn't make the password hash. Is the image built? Run ./setup.sh"
sed -i "s|^DOSSIER_PASSWORD=.*|DOSSIER_PASSWORD=$hash|" "people/$name.env"
dc up -d --force-recreate "app-$name" >/dev/null

say "New password for $name: $password"
say "Their data is untouched; they're signed out of every browser."
