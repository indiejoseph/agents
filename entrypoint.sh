#!/bin/sh
set -eu

WORKSPACE="${AGENT_WORKSPACE:-/workspace}"
TEMPLATES_DIR="/app/templates"

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
