# Chat Agent

A container-friendly AI agent built with Mastra and Bun, designed for deployment on Cloudflare Containers. It provides multi-provider LLM support, long-term memory, a WhatsApp channel, and Mastra-based tooling.

## Overview

- Mastra orchestrates agents, tools, and memory.
- Supports multiple providers (Anthropic, Google/Gemini, OpenRouter, etc.).
- Persistent memory via LibSQL and MCP-compatible stores.
- WhatsApp channel with pairing and session persistence.

## Features

- Mastra orchestration, tools, and memory management
- Multi-provider model support and provider-router script
- Long-term, thread-based memory (LibSQL)
- Hono-based REST API for generation, streaming, and thread management
- WhatsApp channel using `@whiskeysockets/baileys`
- Observability with Pino and Mastra observability components

## Prerequisites

- Bun >= 1.2.2 (recommended)
- Node >= 20 (some developer tools require Node)
- Provider API key(s): Anthropic / Google / OpenRouter / OpenAI, etc.

See `package.json` for exact dependencies and `engines`.

## Quickstart

1. Install dependencies

```bash
bun install
```

2. Configure environment

Create a `.env` file (example):

```env
AGENT_MODEL=anthropic/claude-3-5-sonnet-latest
AGENT_WORKSPACE=/path/to/your/workspace
ANTHROPIC_API_KEY=your-key
# Optional
GOOGLE_GENERATIVE_AI_API_KEY=your-key
OPENROUTER_API_KEY=your-key
PORT=4111
WHATSAPP_WHITELIST_JIDS=1234567890@s.whatsapp.net,0987654321@s.whatsapp.net
```

3. Prepare workspace

The agent expects an `AGENT_WORKSPACE` containing at minimum `SOUL.md` to define core behavior. Templates in `/templates` are copied into a fresh workspace by the Docker entrypoint.

4. Run locally

```bash
# Development (uses Mastra dev/watch if available)
bun run dev

# Start HTTP server (production/dev entry)
bun run start

# Format / lint
bun run format
bun run lint

# Build (Mastra build)
bun run build

# Run tests
bun run test
```

Note: `bun run <script>` and `npm run <script>` both work for scripts defined in `package.json`.

## Verify Mastra and Providers

Mastra evolves quickly. Before changing code that uses Mastra APIs or models, verify the embedded docs or run the provider registry script:

```bash
node scripts/provider-registry.mjs --list
node scripts/provider-registry.mjs --provider openai
```

If `@mastra/*` packages are installed, prefer embedded/docs in `node_modules/@mastra/*/dist/docs` as the authoritative reference (see `.agents/skills/mastra/SKILL.md`).

## WhatsApp Channel

- Uses `@whiskeysockets/baileys` for pairing and messaging.
- Pairing/auth data is stored under `AGENT_WORKSPACE/auth/whatsapp` by default.
- Each WhatsApp user maps to a separate memory thread (by JID).

## Workspace Templates

When the container entrypoint runs, it copies missing template files from `/app/templates` into `AGENT_WORKSPACE`. Files commonly loaded into the system prompt include:

- `SOUL.md` (required)
- `STYLE.md` (optional)
- `AGENTS.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `BOOT.md`, `BOOTSTRAP.md`, `HEARTBEAT.md` (optional)

`BOOTSTRAP.md` is intended for one-time onboarding and can be removed after onboarding completes.

## Project Structure (high level)

- `src/mastra/index.ts` — application entry
- `src/mastra/agents/` — agent orchestration and main agent logic
- `src/mastra/channels/` — channel adapters (WhatsApp, etc.)
- `src/mastra/identity/` — system prompt assembly from workspace files
- `src/mastra/tools/` — custom Mastra tools
- `src/mastra/memory/` — memory/MCP integrations
- `src/mastra/mcp/` — MCP client utilities

Refer to the `templates/` and `workspace/` folders for example workspace content used in development and Docker.

## Scripts

Key `package.json` scripts:

- `dev` — `mastra dev` (development server/hot-reload)
- `build` — `mastra build` (build artifacts)
- `start` — `bun src/index.ts` (start the server)
- `format` — `biome format --write .`
- `lint` — `biome lint .`
- `test` — `bun test`

Run with `bun run <script>` or `npm run <script>`.

## Deployment

This project targets Cloudflare Containers and ships a `Dockerfile` and `docker-compose.yml` for local container testing. See `wrangler.jsonc` for Cloudflare-specific config.

## Development Notes

- Follow the Mastra SKILL guidance: always verify APIs against embedded docs in `node_modules/@mastra/*` or remote docs before coding.
- Use `scripts/provider-registry.mjs` to confirm provider/model strings before invoking models.

## Contributing

If you add features or update Mastra usage, please:

1. Verify APIs against embedded docs for the installed Mastra packages.
2. Add/update workspace templates under `templates/` if they affect prompts.
3. Run `bun run format` and `bun run lint`.

## License

See repository `LICENSE` (if present) or add a license file.
