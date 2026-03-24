# Chat Agent

A sophisticated, containerized AI agent powered by [Mastra](https://mastra.ai) and [Bun](https://bun.sh), designed for deployment on Cloudflare Containers. It supports multiple LLM providers, long-term memory, and a suite of powerful tools.

## Features

- **Mastra Orchestration**: Uses Mastra for agent logic, memory management, and tool integration.
- **Multi-Provider Support**: Seamlessly switch between Anthropic, Google (Gemini), OpenRouter, and Minimax.
- **Long-term Memory**: Persistent thread-based memory using LibSQL.
- **Workspace-driven Identity**: System prompts are assembled from `SOUL.md`, `STYLE.md`, and other workspace markdown files.
- **Powerful Tools**:
  - **WhatsApp**: Pairing, status, and logout tools for the WhatsApp channel.
  - **MCP**: Support for Model Context Protocol servers.
  - **Provider-native Web Search**: Enabled when supported by the chosen model/provider.
- **REST API**: Hono-based API for streaming and non-streaming generations, thread management, and usage tracking.
- **WhatsApp Channel**: Support for interacting with the agent via WhatsApp, including pairing logic and session persistence.
- **Observability**: Built-in logging and tracing via Pino and Mastra Observability.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (>= 1.2.2)
- An API key for your chosen provider (Anthropic, Google, or OpenRouter)

### Setup

1.  **Install dependencies**:
    ```bash
    bun install
    ```

2.  **Configure Environment**:
    Create a `.env` file or export the following variables:
    ```bash
    AGENT_MODEL="anthropic/claude-3-5-sonnet-latest" # or google/gemini-1.5-pro, etc.
    AGENT_WORKSPACE="/path/to/your/workspace"
    ANTHROPIC_API_KEY="your-key"
    # Optional:
    GOOGLE_GENERATIVE_AI_API_KEY="your-key"
    OPENROUTER_API_KEY="your-key"
    PORT="4111"
    ```

3.  **Prepare Workspace**:
    The agent requires at least a `SOUL.md` file in your `AGENT_WORKSPACE` to define its core behavior.

### Running the Agent

- **Start HTTP Server**:
  ```bash
  bun src/mastra/index.ts
  ```
- **Docker Compose**:
  ```bash
  # Start the background agent
  docker compose up -d
  ```
- **Development Mode** (with hot reload):
  ```bash
  bun dev
  ```

## WhatsApp Channel

The agent can connect to WhatsApp using `@whiskeysockets/baileys`. 

- **Pairing**: Use the WhatsApp pairing tool via the agent API or prompt the agent in your client.
- **Persistence**: Authentication data is stored in `AGENT_WORKSPACE/auth/whatsapp`.
- **User Threads**: Each WhatsApp user gets their own memory thread based on their JID.

## gog (Google Workspace) Integration

This project ships with `gog` (from `gogcli`) in the container. Before the agent can use Google Workspace services, complete the `gog` OAuth setup per the official instructions.

Minimum setup:
- Create OAuth2 credentials in Google Cloud Console for the APIs you need (Gmail, Drive, Calendar, etc.).
- Store the client credentials once: `gog auth credentials /path/to/credentials.json`.
- Authorize an account: `gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets`.
- Verify auth: `gog auth list` (or `gog auth list --check`).

After setup, ask the agent to use the `gog/SKILL.md` skill for command examples and workflows.

## Workspace Templates

When running in Docker, the entrypoint will copy the template files from `/app/templates` into `AGENT_WORKSPACE` if they are missing. These files are then loaded into the system prompt (except `STYLE.md`, which is optional).

Loaded files:
- `SOUL.md` (required)
- `STYLE.md` (optional)
- `AGENTS.md` (optional)
- `IDENTITY.md` (optional)
- `USER.md` (optional)
- `TOOLS.md` (optional)
- `BOOT.md` (optional)
- `BOOTSTRAP.md` (optional)
- `HEARTBEAT.md` (optional)

Notes:
- This project uses the `basic-memory` MCP server for long-term notes. Notes are file-based under `memory/` and should be created/read via MCP tools.
- Avoid creating a top-level `MEMORY.md` unless you explicitly want it.
- Daily notes are supported by convention: use `daily/YYYY-MM-DD` (stored as `memory/daily/YYYY-MM-DD.md`).
- `BOOTSTRAP.md` is intended for one-time onboarding and should be deleted when onboarding is complete.

## Project Structure

- `src/mastra/index.ts`: Application entry point.
- `src/mastra/channels/`: Channel implementations (WhatsApp is active).
- `src/mastra/identity/`: Logic for loading and assembling the system prompt from the workspace.
- `src/mastra/tools/`: Custom tools for the agent.
- `src/mastra/memory/`: Memory and storage configuration.
- `src/mastra/usage/`: Token usage calculation and cost tracking.

## Deployment

The project is configured for **Cloudflare Containers**. See `wrangler.jsonc` and `Dockerfile` for configuration details.

- **Image**: Based on `oven/bun:1.3-debian`.

## Status

- **API**: Fully functional (Generate, Stream, Memory, Usage, WhatsApp QR).
- **WhatsApp**: Fully functional (Pairing, Message Handling, Persistence).
- **MCP**: Client implemented, configurable via `.mcp.json` in workspace.
