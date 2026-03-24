import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TextUIPart } from "@mastra/core/_types/@internal_ai-sdk-v5/dist";
import { Agent, type MastraDBMessage } from "@mastra/core/agent";
import type { ProcessInputStepArgs, Processor } from "@mastra/core/processors";
import type { RequestContext } from "@mastra/core/request-context";
import {
	LocalFilesystem,
	LocalSandbox,
	Workspace,
} from "@mastra/core/workspace";
import { assembleSystemPrompt } from "../identity/loader";
import { getMCPTools } from "../mcp/client";
import { createMemory, createStorage } from "../memory";
import { getEnabledTools } from "../tools";
import { resolveModel } from "./utils";

const PORT = process.env.PORT || "4111";
const WORKSPACE_PATH = process.env.AGENT_WORKSPACE as string;
const AGENT_MODEL = process.env.AGENT_MODEL as string;
const IMAGE_VIEWER_MODEL =
	process.env.IMAGE_VIEWER_MODEL || "google/gemini-2.5-flash-lite";

if (!AGENT_MODEL) {
	throw new Error("AGENT_MODEL environment variable is required");
}

const { model: agentModel, nativeTools } = resolveModel(AGENT_MODEL);
const fullInstructions = await assembleSystemPrompt();
const storage = createStorage();
const memory = createMemory(storage);
const enabledTools = getEnabledTools();
const mcpTools = (await getMCPTools()) || {};
const tools = { ...enabledTools, ...nativeTools, ...mcpTools };

if (!WORKSPACE_PATH) {
	throw new Error("AGENT_WORKSPACE environment variable is required");
}

function collectSkillPaths(): string[] {
	const candidates = [
		path.join(WORKSPACE_PATH, ".agents", "skills"), // Mastra marketplace installs here
		path.join(WORKSPACE_PATH, ".claude", "skills"), // Claude Code compatible
		path.join(os.homedir(), ".claude", "skills"), // user-global
		path.join(os.homedir(), "skills"), // user-global
	];
	const seen = new Set<string>();
	const paths: string[] = [];
	for (const p of candidates) {
		try {
			const real = fs.realpathSync(p);
			if (!seen.has(real) && fs.statSync(real).isDirectory()) {
				seen.add(real);
				paths.push(real);
			}
		} catch {
			/* doesn't exist yet — skip */
		}
	}
	return paths;
}

/** Pre-computed at startup; exported for sync-skills-bin route */
export const skillPaths = collectSkillPaths();

/**
 * Sync skill scripts into .bin/ directory.
 * - Strips .sh/.bash extensions so `search.sh` becomes `.bin/search`
 * - chmod +x on source scripts
 * - First-found wins for name collisions
 */
export function syncSkillsBin(): number {
	const binDir = path.join(WORKSPACE_PATH, ".bin");
	fs.mkdirSync(binDir, { recursive: true });
	// Remove old SKILL symlinks only (preserve non-skill symlinks like agent-browser)
	for (const f of fs.readdirSync(binDir)) {
		const p = path.join(binDir, f);
		try {
			if (!fs.lstatSync(p).isSymbolicLink()) continue;
			const target = fs.readlinkSync(p);
			if (skillPaths.some((sp) => target.startsWith(sp))) fs.unlinkSync(p);
		} catch {}
	}
	// Create fresh symlinks from all skill directories
	let linked = 0;
	for (const skillsDir of skillPaths) {
		if (!fs.existsSync(skillsDir)) continue;
		for (const skill of fs.readdirSync(skillsDir)) {
			const scriptsDir = path.join(skillsDir, skill, "scripts");
			if (!fs.existsSync(scriptsDir)) continue;
			for (const script of fs.readdirSync(scriptsDir)) {
				const src = path.join(scriptsDir, script);
				if (!fs.statSync(src).isFile()) continue;
				// Strip .sh/.bash extension for cleaner command names
				const destName = script.replace(/\.(sh|bash)$/, "");
				const dest = path.join(binDir, destName);
				// Skip if already linked (first-found wins for name collisions)
				if (fs.existsSync(dest)) continue;
				// Ensure source is executable
				try {
					fs.chmodSync(src, 0o755);
				} catch {}
				fs.symlinkSync(src, dest);
				linked++;
			}
		}
	}
	return linked;
}

// Sync skill scripts into .bin/ at startup
syncSkillsBin();

export function getDynamicWorkspace({
	requestContext: _requestContext,
}: {
	requestContext: RequestContext;
}) {
	console.log("[workspace] Loading workspace configuration...");
	console.log(`[workspace] WORKSPACE_PATH: ${WORKSPACE_PATH}`);
	console.log(`[workspace] skills_path: ${JSON.stringify(skillPaths)}`);

	const detection = LocalSandbox.detectIsolation();

	return new Workspace({
		id: "agent-workspace",
		name: "Agent Workspace",
		filesystem: new LocalFilesystem({
			basePath: WORKSPACE_PATH,
			allowedPaths: skillPaths,
		}),
		sandbox: new LocalSandbox({
			workingDirectory: WORKSPACE_PATH,
			env: {
				PATH: `${WORKSPACE_PATH}/.bin:${process.env.PATH}`,
				HOME: WORKSPACE_PATH,
				PORT: PORT,
				GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD || "",
				AGENT_GOOGLE_ACCOUNT: process.env.AGENT_GOOGLE_ACCOUNT || "",
				...(process.env.PLAYWRIGHT_BROWSERS_PATH && {
					PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
				}),
			},
			isolation: detection.available ? detection.backend : "none",
			nativeSandbox: {
				allowNetwork: true,
				allowSystemBinaries: true,
				readWritePaths: [WORKSPACE_PATH, ...skillPaths],
			},
		}),
		...(skillPaths.length > 0 ? { skills: skillPaths } : {}),
		bm25: true,
	});
}

const gemini25FlashLiteSupportedMimeTypes = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/heic",
	"image/heif",
	"application/pdf",
	"text/plain",
	"video/x-flv",
	"video/quicktime",
	"video/mpeg",
	"video/mpegs",
	"video/mpg",
	"video/mp4",
	"video/webm",
	"video/wmv",
	"video/3gpp",
	"audio/x-aac",
	"audio/flac",
	"audio/mp3",
	"audio/m4a",
	"audio/mpeg",
	"audio/mpga",
	"audio/mp4",
	"audio/ogg",
	"audio/pcm",
	"audio/wav",
	"audio/webm",
];

class FileInputProcessor implements Processor {
	id = "file-input";

	async processInputStep({ messages }: ProcessInputStepArgs) {
		const lastMessage = messages[messages.length - 1];
		const hasFile = lastMessage?.content.parts.some(
			(part) => part.type === "file",
		);

		if (lastMessage && hasFile) {
			const mimeType =
				lastMessage?.content.parts.find((part) => part.type === "file")
					?.mimeType || null;

			if (mimeType && gemini25FlashLiteSupportedMimeTypes.includes(mimeType)) {
				return {
					model: resolveModel(IMAGE_VIEWER_MODEL).model as any,
				};
			}
		}

		// Replace file parts with a placeholder text: "[image]" / "[file]" in the message content, except for the last message which is the one being processed
		const filteredMessages = messages.slice(0, -1).map((message) => {
			const newParts = message.content.parts.map((part) => {
				if (part.type === "file") {
					if (part.mimeType?.startsWith("image/")) {
						return {
							...part,
							type: "text",
							text: "[image]",
						} as TextUIPart;
					}
					return {
						...part,
						type: "text",
						text: "[file]",
					} as TextUIPart;
				}
				return part;
			});
			return {
				...message,
				content: {
					...message.content,
					parts: newParts,
				},
			};
		});

		return {
			messages: [...filteredMessages, ...messages.slice(-1)],
		};
	}
}

export const mainAgent = new Agent({
	id: "main",
	name: "Main Agent",
	instructions: fullInstructions,
	model: agentModel,
	inputProcessors: [new FileInputProcessor()],
	memory,
	tools,
	// agents: {
	//   imageViewer: imageViewerAgent,
	// },
	workspace: getDynamicWorkspace,
});
