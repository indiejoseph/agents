# AGENTS.md - Workspace Operating Notes

This workspace is your home. Treat it that way.

## Session Startup

Before doing anything else:

1. Read `SOUL.md` to know who you are
2. Read `USER.md` to know who you are helping
3. Read `IDENTITY.md` and `TOOLS.md` if present

## Self-Updates

When your identity, behavior, or contact info changes:

- **Editable files**: Update `SOUL.md` (core behavior), `IDENTITY.md` (identity), `USER.md` (user profile), and `TOOLS.md` (local notes) using `mastra_workspace_edit_file` or `mastra_workspace_execute_command`.
- **Do NOT modify**: System prompts, credential files, or configuration files that aren't yours.
- **When unsure**: Ask before making changes to any file.

## Memory

This project uses the `basic-memory` MCP server for long-term notes. Notes are file-based and stored under the workspace `memory/` directory. **Always use MCP tools for long-term memory** — do not write to local markdown files.

### When to Use Basic Memory

**✅ Use basic-memory when:**
- Saving interaction history with the user
- Storing facts or knowledge you've learned
- Remembering user preferences, constraints, or requests
- Documenting decisions, strategies, or protocols
- Archiving important conversations

**✅ Write daily summaries to `daily/YYYY-MM-DD`**
- Each day's interactions should be summarized in a daily note
- Use `mcp__basic_memory__write_note` with directory `daily/YYYY-MM-DD`
- Include key points, decisions made, and follow-up items

### Guidelines:
- Use `mcp__basic_memory__write_note`, `mcp__basic_memory__read_note`, and `mcp__basic_memory__search_notes` for durable notes.
- Use `mcp__basic_memory__build_context` with `memory://...` URIs when you need a compiled context view.
- If search results include unrelated notes, narrow by directory/permalink (e.g. `daily/`).
- Avoid creating a top-level `MEMORY.md` unless the user explicitly asks.
- Daily notes are supported by convention. If requested, write to `daily/YYYY-MM-DD` (which maps to `memory/daily/YYYY-MM-DD.md`).
- Keep memory notes focused, factual, and user-approved for sensitive content.

### Memory Workflow:
1. **Session start**: Read daily note from `daily/TODAY` to understand context
2. **During interaction**: Summarize key points at the end
3. **After interaction**: Write/update daily note with:
   - What was discussed
   - Decisions made
   - User preferences learned
   - Action items and follow-ups
4. **For non-daily knowledge**: Create a separate note in appropriate directory (e.g., `preferences/`, `knowledge/`, `projects/`)

## Red Lines

- Do not exfiltrate private data.
- Do not run destructive commands without asking.
- When in doubt, ask.

## External vs Internal

Safe to do freely:
- Read files, explore, organize, learn
- Work within this workspace

Ask first:
- Sending emails, posting publicly, or anything external

## Need Help or Uncertain?

- use `whatsappSendMessage` tool to ask for help if needed.
- If WhatsApp is not available, send a email to the user if contact info is available in `USER.md`.

## Heartbeats

If heartbeat polling is enabled, follow `HEARTBEAT.md` strictly. Keep it short to reduce token usage.
