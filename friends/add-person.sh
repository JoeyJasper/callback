#!/usr/bin/env bash
# Gives someone their own Dossier: a database, an app and an address.
#
#   ./add-person.sh priya
#
# Prints their address and a password to send them. Nobody else, you
# included, can see into their Dossier without that password.

source "$(dirname "$0")/lib.sh"
need_setup
[ $# -eq 1 ] || die "Usage: ./add-person.sh <name>"
name="$1"
valid_name "$name"
[ ! -f "people/$name.env" ] || die "$name already has a Dossier. To give them a new password: ./reset-password.sh $name"

dc up -d db >/dev/null
db="$(db_name "$name")"
dc exec -T db sh -c "psql -U dossier -d dossier -tAc \"SELECT 1 FROM pg_database WHERE datname = '$db'\" | grep -q 1 || createdb -U dossier $db"

password="$(random_password)"
hash="$(hash_password "$password")"
[[ "$hash" == argon2id:* ]] || die "Couldn't make the password hash. Is the image built? Run ./setup.sh"

domain="$(setting DOMAIN)"
umask 077
cat > "people/$name.env" <<PERSON
# $name's Dossier. Keep this file private.
DATABASE_URL=postgresql://dossier:$(setting POSTGRES_PASSWORD)@db:5432/$db
DOSSIER_PASSWORD=$hash
DOSSIER_SECRET=$(openssl rand -base64 32)
DOSSIER_PUBLIC_URL=https://$name.$domain
PERSON

regenerate
dc up -d "app-$name"
reload_caddy

say ""
say "Done. Send $name:"
say ""
say "  Address:  https://$name.$domain"
say "  Password: $password"
say ""
say "It can take a minute the first time while the HTTPS certificate is issued."
say "The password isn't stored anywhere; if it's lost: ./reset-password.sh $name"
