#!/bin/sh
set -eu

WORKSPACE="${AGENT_WORKSPACE:-/workspace}"
TEMPLATES_DIR="/app/templates"

# 1. Get the UID/GID of the mounted host folder
HOST_UID=$(stat -c '%u' "$WORKSPACE")
HOST_GID=$(stat -c '%g' "$WORKSPACE")

# 2. Adjust 'appuser' to match the host IDs so they have 'owner' rights
# We use 'usermod' and 'groupmod' (available in your debian-based image)
if [ "$HOST_UID" != "0" ]; then
    usermod -u "$HOST_UID" appuser
    groupmod -g "$HOST_GID" appuser
fi

# 3. Ensure the workspace is writable by appuser
chown -R appuser:appuser "$WORKSPACE"

if [ ! -d "$WORKSPACE" ]; then
  mkdir -p "$WORKSPACE"
fi

if [ -d "$TEMPLATES_DIR" ]; then
  for name in AGENTS.md HEARTBEAT.md IDENTITY.md SOUL.md USER.md; do
    if [ ! -f "$WORKSPACE/$name" ] && [ -f "$TEMPLATES_DIR/$name" ]; then
      cp "$TEMPLATES_DIR/$name" "$WORKSPACE/$name"
      echo "Initialized $name in $WORKSPACE"
    fi
  done

  if [ -d "$TEMPLATES_DIR/skills" ] && [ ! -d "$WORKSPACE/skills" ]; then
    cp -R "$TEMPLATES_DIR/skills" "$WORKSPACE/skills"
    echo "Initialized skills in $WORKSPACE/skills"
  fi
fi

exec "$@"
