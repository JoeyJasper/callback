# Shared by the scripts in this folder. Not meant to be run on its own.

set -euo pipefail

FRIENDS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$FRIENDS_DIR/.." && pwd)"
IMAGE="callback-friends:latest"
cd "$FRIENDS_DIR"

say() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

need_setup() {
  [ -f .env ] || die "Run ./setup.sh first."
}

# Docker Compose with this folder's files and settings.
dc() {
  docker compose --project-directory "$FRIENDS_DIR" -f compose.yml -f people.yml --env-file .env "$@"
}

# A value from .env, e.g. setting DOMAIN.
setting() {
  grep -E "^$1=" .env | head -n1 | cut -d= -f2-
}

# Lower-case letters, digits and hyphens, starting with a letter: it becomes a web address.
valid_name() {
  [[ "$1" =~ ^[a-z][a-z0-9-]{1,19}$ ]] || die "Use 2–20 lower-case letters, digits or hyphens, starting with a letter (e.g. joel, priya-k)."
}

db_name() { printf 'callback_%s' "${1//-/_}"; }

people() {
  for file in people/*.env; do
    [ -e "$file" ] || continue
    basename "$file" .env
  done
}

random_hex() { openssl rand -hex "$1"; }

# A password that's easy to type: 4 groups of 4 letters and digits, without look-alikes.
random_password() {
  local chars="abcdefghjkmnpqrstuvwxyz23456789" out="" i
  for i in $(seq 1 16); do
    out+="${chars:$(( $(od -An -N2 -tu2 /dev/urandom | tr -d ' ') % ${#chars} )):1}"
    if [ $((i % 4)) -eq 0 ] && [ "$i" -lt 16 ]; then out+="-"; fi
  done
  printf '%s' "$out"
}

# The argon2id hash Callback signs in with, made by the image's own hash-password.
hash_password() {
  printf '%s\n' "$1" | docker run --rm -i "$IMAGE" hash-password 2>/dev/null | tail -n1
}

# people.yml: one app per person, and the Caddyfile: one address per person.
regenerate() {
  local domain email name list
  domain="$(setting DOMAIN)"
  email="$(setting EMAIL)"
  list="$(people)"
  {
    say "# Made by the scripts in this folder from people/*.env. Don't edit by hand."
    if [ -z "$list" ]; then
      say "services: {}"
    else
      say "services:"
      for name in $list; do
        cat <<YAML
  app-$name:
    image: $IMAGE
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file:
      - shared.env
      - people/$name.env
    volumes:
      - data-$name:/data
    # Room for Chromium, which prints the PDFs; most of the time it uses far less.
    mem_limit: 1g
YAML
      done
      say "volumes:"
      for name in $list; do say "  data-$name:"; done
    fi
  } > people.yml

  {
    say "# Made by the scripts in this folder. Don't edit by hand."
    say "{"
    if [ -n "$email" ]; then say "  email $email"; fi
    say "}"
    for name in $list; do
      say ""
      say "$name.$domain {"
      say "  encode zstd gzip"
      say "  reverse_proxy app-$name:3000"
      say "}"
    done
  } > Caddyfile
}

reload_caddy() {
  dc up -d caddy >/dev/null
  dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || dc restart caddy >/dev/null
}
