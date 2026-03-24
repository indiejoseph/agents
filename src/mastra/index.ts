import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import {
	DefaultExporter,
	Observability,
	SensitiveDataFilter,
} from "@mastra/observability";
import { mainAgent } from "./agents";
import { WhatsAppChannel } from "./channels/whatsapp";
import { scheduleManager } from "./lib/schedule-manager";
import { createStorage } from "./memory";
import { createNotifyRoutes } from "./routes/notify";
import { createWhatsAppRoutes } from "./routes/whatsapp";
import { startHeartbeat } from "./scheduling/heartbeat";

const PORT = parseInt(process.env.PORT || "4111", 10);
const storage = createStorage();

// Load any persisted cron tasks and register them with node-cron
await scheduleManager.loadFromCronFile(mainAgent);

startHeartbeat(mainAgent);

export const mastra = new Mastra({
	agents: { main: mainAgent },
	storage,
	server: {
		port: PORT,
		apiRoutes: [...createWhatsAppRoutes(), ...createNotifyRoutes()],
	},
	logger: new PinoLogger({
		name: "Mastra",
		level: "info",
	}),
	observability: new Observability({
		configs: {
			default: {
				serviceName: "mastra",
				exporters: [new DefaultExporter()],
				spanOutputProcessors: [new SensitiveDataFilter()],
			},
		},
	}),
});

WhatsAppChannel.getInstance().init();
