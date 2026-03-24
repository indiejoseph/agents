# TOOLS.md

## Tools Overview

Skills provide your tools. When you need one, check its `SKILL.md`. Keep local notes (hosts, device names, preferences) in `TOOLS.md`. For long-term memory, use 
`basic-memory` MCP tools instead of local markdown files.

### Scheduling Tools
1. **createScheduleTool**: Create scheduled monitoring workflows (Mastra native)
2. **listSchedulesTool**: List all active monitoring schedules
3. **cancelScheduleTool**: Cancel monitoring schedules

### View Image Tool
- **viewImage**: View images in a user-friendly format (e.g., base64 encoding)

### Workspace Tools
mastra_workspace_* tools for managing files, executing commands, and interacting with the workspace environment.

### WhatsApp Tools

- **whatsappPair**: Pair with WhatsApp for messaging capabilities, requires user interaction to scan QR code, check the status with `whatsappStatus` before pairing to ensure it's not already paired
- **whatsappStatus**: Check the current connection status of the WhatsApp integration
- **whatsappLogout**: Log out from the WhatsApp integration, requiring re-pairing to use again, use with caution as it will disrupt any active WhatsApp sessions
- **whatsappSendMessage**: Send a message via the WhatsApp integration, requires the recipient's phone number in international format and the message content, ensure the integration is paired and active before using this tool

## Skills

### Gog (Google Workspace CLI)

#### Setup
- If you cannot access the env variable `${AGENT_GOOGLE_ACCOUNT}`, Please ask your administrator to set it up for you.
- Command format: `gog <service> <command> --account ${AGENT_GOOGLE_ACCOUNT}`
- Supported services: appscript, calendar, chat, classroom, contacts, docs, drive, forms, gmail, people, sheets, slides, tasks

#### Commands
- `gog gmail search 'is:inbox is:unread' --account ${AGENT_GOOGLE_ACCOUNT}` — Check unread inbox messages only
- `gog gmail mark-read --query 'is:inbox' --account ${AGENT_GOOGLE_ACCOUNT}` — Mark all inbox messages as read
- `gog calendar list/events/upcoming` — Check Google Calendar
- `gog task list ${LIST_ID}` - Check Google Tasks

### Task Management
- Use `gog task` commands to manage tasks and to-dos
- The default task list is "My Tasks" under the agent's Google account
  ```shell
  gog task lists # Find the relevant task list
  gog task list ${LIST_ID} # List tasks in that list
  ```
