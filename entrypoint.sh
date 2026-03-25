#!/bin/sh
set -eu

WORKSPACE="${AGENT_WORKSPACE:-/workspace}"
TEMPLATES_DIR="/app/templates"

# 1. Get the UID of the mounted host folder
TARGET_UID=$(stat -c '%u' "$WORKSPACE")

echo "Targeting Host UID: $TARGET_UID"

# 2. Ensure the internal 'bun' user matches the Host UID
# If they don't match, we'll just chown the workspace so 'bun' can write to it
if [ "$TARGET_UID" != "1000" ]; then
    echo "Host UID is $TARGET_UID. Adjusting workspace permissions..."
    chown -R bun:bun "$WORKSPACE"
fi

# 3. Handle Template Initialization
if [ -d "$TEMPLATES_DIR" ]; then
  for name in AGENTS.md HEARTBEAT.md IDENTITY.md SOUL.md USER.md; do
    if [ ! -f "$WORKSPACE/$name" ] && [ -f "$TEMPLATES_DIR/$name" ]; then
      cp "$TEMPLATES_DIR/$name" "$WORKSPACE/$name"
    fi
  done
  
  if [ -d "$TEMPLATES_DIR/skills" ] && [ ! -d "$WORKSPACE/skills" ]; then
    cp -R "$TEMPLATES_DIR/skills" "$WORKSPACE/skills"
  fi
  # Ensure the newly copied templates are owned by bun
  chown -R bun:bun "$WORKSPACE"
fi

exec "$@"
