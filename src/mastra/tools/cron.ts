import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { scheduleManager } from "../lib/schedule-manager";

export const createScheduleTool = createTool({
	id: "create-schedule",
	description: `Create a scheduled workflow to automatically analyze logs from an endpoint at specified intervals using Mastra's native scheduling system.
  
The schedule will run continuously until the user cancels it.

Use this when user says:
- "Monitor logs every X minutes/hours/days"
- "Set up automatic log analysis"
- "Schedule log monitoring"
- "Check logs periodically"

Examples:
- "Monitor https://api.example.com/logs every 30 minutes"
- "Check logs every hour"
- "Analyze logs daily at 9am"`,

	inputSchema: z.object({
		name: z.string().describe("The name of the schedule. REQUIRED."),
		cron: z
			.string()
			.describe(
				"Cron expression for the schedule (e.g., '*/30 * * * *' for every 30 minutes). If not provided, 'interval' will be used to generate a cron expression.",
			),
		message: z
			.string()
			.describe(
				"Task-specific instructions or context to include in the notification when the schedule runs.",
			),
		timezone: z
			.string()
			.optional()
			.describe(
				"Timezone for the cron schedule (e.g., 'America/New_York'). Defaults to server timezone if not specified.",
			),
	}),

	execute: async ({ name, message, cron, timezone }, { mastra }) => {
		try {
			const agent = mastra?.getAgent("main");

			if (!agent) {
				throw new Error("Log analyser agent not found in Mastra instance");
			}

			const result = await scheduleManager.createSchedule(
				name,
				cron,
				message,
				agent,
				{ timezone },
			);

			return {
				success: true,
				...result,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to create schedule",
			};
		}
	},
});

export const cancelScheduleTool = createTool({
	id: "cancel-schedule",
	description: `Cancel a scheduled workflow by its ID or endpoint.

Use this when user says:
- "Cancel schedule [ID]"
- "Stop monitoring [endpoint]"
- "Cancel the log monitoring"
- "Stop all schedules"
- "Remove the scheduled task"`,

	inputSchema: z.object({
		scheduleId: z
			.string()
			.optional()
			.describe(
				"Specific schedule ID to cancel. Get this from list-schedules.",
			),
		endpoint: z
			.string()
			.optional()
			.describe("Cancel all schedules for this endpoint"),
		cancelAll: z
			.boolean()
			.optional()
			.describe("Set to true to cancel ALL schedules"),
	}),

	execute: async ({ cancelAll, scheduleId, endpoint: _endpoint }) => {
		try {
			// Cancel all schedules
			if (cancelAll) {
				return await scheduleManager.cancelAllSchedules();
			}

			// Cancel by schedule ID
			if (scheduleId) {
				return await scheduleManager.cancelSchedule(scheduleId);
			}

			return {
				success: false,
				message:
					"Please provide either scheduleId, endpoint, or set cancelAll to true",
			};
		} catch (error) {
			return {
				success: false,
				message:
					error instanceof Error ? error.message : "Failed to cancel schedule",
			};
		}
	},
});

export const listSchedulesTool = createTool({
	id: "list-schedules",
	description: `List all active scheduled workflows with their details.

Use this when user asks:
- "What schedules are running?"
- "Show me active monitoring tasks"
- "List all scheduled workflows"
- "What endpoints are being monitored?"`,

	inputSchema: z.object({}),

	execute: async () => {
		const schedules = scheduleManager.listSchedules();

		if (schedules.length === 0) {
			return {
				success: true,
				message: "No active schedules",
				schedules: [],
			};
		}

		return {
			success: true,
			message: `Found ${schedules.length} active schedule(s)`,
			schedules,
		};
	},
});

export const scheduleTools = {
	createSchedule: createScheduleTool,
	cancelSchedule: cancelScheduleTool,
	listSchedules: listSchedulesTool,
} as Record<string, ReturnType<typeof createTool>>;
