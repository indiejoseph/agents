import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider-v2";
import { minimax } from "vercel-minimax-ai-provider";

// Resolve model + provider-native web search tools.
// - anthropic/*  → webSearch_20250305 tool (executed by Anthropic, max 5 uses)
// - google/*     → googleSearch tool       (executed by Google)
// - openrouter/* → :online suffix on model ID (executed by OpenRouter, no extra tool)
// - other        → no native web search (webFetch tool is still available)
export function resolveModel(modelId: string): {
	model: ReturnType<typeof anthropic>;
	nativeTools: Record<string, unknown>;
} {
	if (modelId.startsWith("openrouter:")) {
		const openrouter = createOpenRouter({
			apiKey: process.env.OPENROUTER_API_KEY,
		});
		const id = modelId.replace("openrouter:", "");
		return { model: openrouter(`${id}:online`), nativeTools: {} };
	}
	if (modelId.startsWith("ollama:")) {
		const ollama = createOllama({
			baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
		});
		return {
			model: ollama(modelId.replace("ollama:", "")),
			nativeTools: {},
		};
	}
	if (modelId.startsWith("google/") || modelId.startsWith("gemini")) {
		return {
			model: google(modelId.replace("google/", "")),
			nativeTools: { googleSearch: google.tools.googleSearch({}) },
		};
	}
	if (modelId.startsWith("minimax/")) {
		const modelName = modelId.replace("minimax/", "");
		return { model: minimax(modelName), nativeTools: {} };
	}
	return {
		model: anthropic(modelId),
		nativeTools: {
			webSearch: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
		},
	};
}
