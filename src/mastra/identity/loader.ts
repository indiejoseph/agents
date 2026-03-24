import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CORE_INSTRUCTIONS = `You are a helpful AI assistant. Always be helpful, concise, and accurate in your responses.`;

export interface IdentityFiles {
	soul: string;
	style?: string;
	agents?: string;
	heartbeat?: string;
	identity?: string;
	user?: string;
	tools?: string;
}

export interface SystemPromptParts {
	core: string;
	soul: string;
	style?: string;
	agents?: string;
	identity?: string;
	user?: string;
	tools?: string;
}

function getWorkspacePath(): string {
	const workspace = process.env.AGENT_WORKSPACE;
	if (!workspace) {
		throw new Error("AGENT_WORKSPACE environment variable is required");
	}
	return workspace;
}

function readMarkdownFile(filename: string): Promise<string | undefined> {
	const workspace = getWorkspacePath();
	const filepath = join(workspace, filename);
	return readFile(filepath, "utf-8").catch(() => undefined);
}

export async function loadIdentityFiles(): Promise<IdentityFiles> {
	const [soul, style, agents, heartbeat, identity, user, tools] =
		await Promise.all([
			readMarkdownFile("SOUL.md"),
			readMarkdownFile("STYLE.md"),
			readMarkdownFile("AGENTS.md"),
			readMarkdownFile("HEARTBEAT.md"),
			readMarkdownFile("IDENTITY.md"),
			readMarkdownFile("USER.md"),
			readMarkdownFile("TOOLS.md"),
		]);

	if (soul === undefined) {
		throw new Error("SOUL.md is required in workspace");
	}

	return { soul, style, agents, heartbeat, identity, user, tools };
}

function truncateToLines(content: string, maxLines: number): string {
	const lines = content.split("\n");
	if (lines.length <= maxLines) {
		return content;
	}
	return lines.slice(0, maxLines).join("\n");
}

export async function assembleSystemPrompt(): Promise<string> {
	const identity = await loadIdentityFiles();

	const parts: SystemPromptParts = {
		core: CORE_INSTRUCTIONS,
		soul: identity.soul,
		style: identity.style,
		agents: identity.agents,
		identity: identity.identity,
		user: identity.user,
		tools: identity.tools,
	};

	const promptParts: string[] = [parts.core, "", parts.soul];

	if (parts.style) {
		promptParts.push("", parts.style);
	}

	if (parts.agents) {
		promptParts.push("", "## Other Agents", parts.agents);
	}

	if (parts.identity) {
		promptParts.push("", "## Identity", parts.identity);
	}

	if (parts.user) {
		promptParts.push("", "## User Profile", parts.user);
	}

	if (parts.tools) {
		promptParts.push("", "## Tools", parts.tools);
	}

	return promptParts.join("\n");
}

export async function getIdentitySummary(): Promise<{
	hasSoul: boolean;
	hasStyle: boolean;
	hasAgents: boolean;
	hasHeartbeat: boolean;
	hasIdentity: boolean;
	hasUser: boolean;
	hasTools: boolean;
}> {
	const identity = await loadIdentityFiles();

	return {
		hasSoul: true,
		hasStyle: !!identity.style,
		hasAgents: !!identity.agents,
		hasHeartbeat: !!identity.heartbeat,
		hasIdentity: !!identity.identity,
		hasUser: !!identity.user,
		hasTools: !!identity.tools,
	};
}
