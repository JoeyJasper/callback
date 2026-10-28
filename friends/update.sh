#!/usr/bin/env bash
# Takes the newest code from your fork, rebuilds the app and restarts everyone's
# Callback on it. Each one brings its own database up to date as it starts.
# Also applies changes to shared.env.

source "$(dirname "$0")/lib.sh"
need_setup
say "Backing up first…"
"$FRIENDS_DIR/backup.sh"
git -C "$REPO_DIR" pull --ff-only
say "Building…"
docker build -t "$IMAGE" "$REPO_DIR" >/dev/null
regenerate
dc up -d --remove-orphans
reload_caddy
say "Everyone's Callback is on the new version."
