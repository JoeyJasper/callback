#!/usr/bin/env bash
# One-time setup on the server: settings, the app image, the database and HTTPS.
#
#   ./setup.sh                      addresses like joel.203-0-113-5.sslip.io (no domain needed)
#   ./setup.sh jobs.example.com     addresses like joel.jobs.example.com
#
# Running it again keeps the settings you have and rebuilds the image.

source "$(dirname "$0")/lib.sh"

command -v docker >/dev/null || die "Docker isn't installed. See README.md, step 2."
docker compose version >/dev/null 2>&1 || die "Docker Compose isn't installed. See README.md, step 2."
command -v openssl >/dev/null || die "openssl isn't installed: sudo apt install -y openssl"

if [ ! -f .env ]; then
  domain="${1:-}"
  if [ -z "$domain" ]; then
    ip="$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
    [ -n "$ip" ] || die "Couldn't work out this server's public IP address. Pass a domain: ./setup.sh jobs.example.com"
    domain="${ip//./-}.sslip.io"
  fi
  read -r -p "Your email, for the HTTPS certificates' expiry notices: " email
  read -r -p "Your time zone [Asia/Dubai]: " tz
  tz="${tz:-Asia/Dubai}"
  {
    echo "# Settings for Callback for you and your friends. Keep this file private."
    echo "DOMAIN=$domain"
    echo "EMAIL=$email"
    echo "POSTGRES_PASSWORD=$(random_hex 24)"
  } > .env
  chmod 600 .env

  source_url="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null | sed -E 's#^git@github.com:#https://github.com/#; s#\.git$##')"
  cat > shared.env <<SHARED
# What every person's Callback starts with. The settings keep the DOSSIER_
# names of Dossier, the project Callback is built on. Each person can change these in
# their own Settings; keys typed there are stored, encrypted, for them only.
# After changing this file: ./update.sh

# Your time zone: nightly backups and the job agent's hour run in it.
TZ=$tz

# A shared AI provider, so your friends don't each need one. Every person's
# AI use is billed to this key. Leave empty to let each person choose.
# For Anthropic: DOSSIER_AI_PROVIDER=anthropic, DOSSIER_AI_MODEL=claude-sonnet-5-5
DOSSIER_AI_PROVIDER=
DOSSIER_AI_MODEL=
DOSSIER_AI_KEY=

# A shared job source for Find jobs and the job agent (JSearch covers the Gulf
# and India). Every person's searches count against this key's plan.
DOSSIER_JOBS_SOURCE=
DOSSIER_JSEARCH_KEY=

# Where your changed copy's source code is: the licence (AGPL) asks that the
# people using it are offered it. Shown in the sidebar and Settings → About.
DOSSIER_SOURCE_URL=$source_url

# This copy is updated with ./update.sh, so it doesn't check for upstream releases,
# and it sends no usage ping.
DOSSIER_UPDATE_CHECK=off
DOSSIER_TELEMETRY=off
SHARED
  chmod 600 shared.env
  say "Saved the settings. People's addresses will be like: you.$domain"
fi

say "Building the app (a few minutes the first time)…"
docker build -t "$IMAGE" "$REPO_DIR" >/dev/null

regenerate
dc up -d db caddy
say ""
say "Ready. Add the first person with: ./add-person.sh <name>"
