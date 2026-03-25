import type { TextUIPart } from "@mastra/core/_types/@internal_ai-sdk-v5/dist";
import { Agent } from "@mastra/core/agent";
import type { ProcessInputStepArgs, Processor } from "@mastra/core/processors";
import { assembleSystemPrompt } from "../identity/loader";
import { getMCPTools } from "../mcp/client";
import { createMemory, createStorage } from "../memory";
import { getEnabledTools } from "../tools";
import { resolveModel } from "./utils";
import { getDynamicWorkspace } from "./workspace";

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
	workspace: getDynamicWorkspace,
});
