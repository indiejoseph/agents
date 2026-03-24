import type { createTool } from "@mastra/core/tools";
import { scheduleTools } from "./cron";
import { viewImageTools } from "./view-image";
import { whatsappTools } from "./whatsapp";

export function getEnabledTools(): Record<
	string,
	ReturnType<typeof createTool>
> {
	const enabledTools: Record<string, ReturnType<typeof createTool>> = {
		...whatsappTools,
		...viewImageTools,
		...scheduleTools,
	};

	return enabledTools;
}
