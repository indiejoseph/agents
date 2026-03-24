import fs from "node:fs";
import path from "node:path";
import type { Agent } from "@mastra/core/agent";
import cron from "node-cron";

interface ScheduleConfig {
	name: string; // maps to cron.json `name`
	message?: string; // maps to cron.json `message`
	cron: string; // cron expression (maps to cron.json `cron`)
	timezone?: string; // maps to cron.json `timezone`
	createdAt: string;
}

class ScheduleManager {
	private schedules: Map<string, ScheduleConfig> = new Map();
	private scheduleCounter = 0;
	private jobs: Map<string, any> = new Map();

	private get cronFilePath(): string {
		const workspace = process.env.AGENT_WORKSPACE || process.cwd();
		return path.join(workspace, "cron.json");
	}

	private async persistCronFile(): Promise<void> {
		const data = Array.from(this.schedules.values()).map((s) => ({
			name: s.name,
			message: s.message,
			cron: s.cron,
			timezone: s.timezone,
			createdAt: s.createdAt,
		}));

		try {
			await fs.promises.mkdir(path.dirname(this.cronFilePath), {
				recursive: true,
			});
			await fs.promises.writeFile(
				this.cronFilePath,
				JSON.stringify(data, null, 2),
				"utf-8",
			);
		} catch (err) {
			// Persist failure should not crash scheduling; log to console for now
			// eslint-disable-next-line no-console
			console.error(
				"Failed to persist cron.json:",
				err instanceof Error ? err.message : err,
			);
		}
	}

	private registerJob(config: ScheduleConfig, agent: Agent) {
		try {
			const task = cron.schedule(
				config.cron,
				async () => {
					try {
						const context = {
							type: "scheduled",
							scheduleName: config.name,
							message: config.message,
							timezone: config.timezone,
							triggeredAt: new Date().toISOString(),
						};

						const prompt = `System Notification: Scheduled task "${config.name}" triggered. 
Context: ${config.message || "No specific instructions"}. 
Metadata: ${JSON.stringify(context)}`;
						await agent.generate(prompt);
					} catch (err) {
						// eslint-disable-next-line no-console
						console.error(
							`Error running scheduled task ${config.name}:`,
							err instanceof Error ? err.message : err,
						);
					}
				},
				{ timezone: config.timezone || "UTC" },
			);

			this.jobs.set(config.name, task);
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error(
				`Failed to register cron job for ${config.name}:`,
				err instanceof Error ? err.message : err,
			);
		}
	}

	/**
	 * Load schedules from cron.json (agent workspace) and register them
	 */
	async loadFromCronFile(agent: Agent): Promise<void> {
		try {
			const file = this.cronFilePath;
			if (!fs.existsSync(file)) return;

			const raw = await fs.promises.readFile(file, "utf-8");
			const parsed: Array<Partial<ScheduleConfig>> = JSON.parse(raw || "[]");
			if (!Array.isArray(parsed)) return;

			for (const entry of parsed) {
				// cron.json schema: { name, message, cron, timezone }
				if (!entry.name || !entry.cron) continue;
				const name = entry.name as string;
				if (this.schedules.has(name)) continue;

				const config: ScheduleConfig = {
					name,
					message: (entry.message as string) || undefined,
					cron: entry.cron as string,
					timezone: (entry.timezone as string) || undefined,
					createdAt: (entry.createdAt as string) || new Date().toISOString(),
				};

				this.schedules.set(config.name, config);
				this.registerJob(config, agent);
			}

			// Bump counter to avoid immediate name collisions
			this.scheduleCounter += parsed.length;
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error(
				"Failed to load cron.json:",
				err instanceof Error ? err.message : err,
			);
		}
	}

	/**
	 * Create a new scheduled workflow aligned to cron.json schema
	 */
	async createSchedule(
		name: string,
		message: string,
		cron: string,
		agent: Agent,
		options?: {
			timezone?: string;
		},
	): Promise<{ name: string; cron: string; message: string }> {
		try {
			// Determine cron expression: if the input looks like a cron, use it; otherwise parse
			const looksLikeCron = /^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)$/.test(cron.trim());

			if (!looksLikeCron) {
				// If it doesn't look like a cron expression, attempt to parse it as natural language
				return {
					name,
					cron: cron,
					message:
						"Provided schedule format is not a valid cron expression. Please provide a valid cron expression.",
				};
			}

			this.scheduleCounter++;
			const scheduleName =
				name && name.trim().length > 0
					? name.trim()
					: `schedule-${this.scheduleCounter}-${Date.now()}`;

			const config: ScheduleConfig = {
				name: scheduleName,
				message: message || undefined,
				cron,
				timezone: options?.timezone,
				createdAt: new Date().toISOString(),
			};

			this.schedules.set(scheduleName, config);

			// Persist cron.json for agent workspace (write in example schema)
			await this.persistCronFile();

			// Register job in-memory with node-cron so it runs immediately
			this.registerJob(config, agent);

			return {
				name: scheduleName,
				cron,
				message: `Schedule created and activated. Schedule name: ${scheduleName}. Cron expression: ${cron}`,
			};
		} catch (error) {
			throw new Error(
				`Failed to create schedule: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
	}

	/**
	 * Cancel a specific schedule
	 */
	cancelSchedule(name: string): { success: boolean; message: string } {
		const config = this.schedules.get(name);

		if (!config) {
			return {
				success: false,
				message: `Schedule ${name} not found. Use listSchedules to see active schedules.`,
			};
		}

		// Stop and remove cron job if registered
		const job = this.jobs.get(name);
		if (job) {
			try {
				job.stop && job.stop();
				job.destroy && job.destroy();
			} catch (_) {
				/* ignore */
			}
			this.jobs.delete(name);
		}

		this.schedules.delete(name);
		// Persist updated cron.json
		void this.persistCronFile();

		return {
			success: true,
			message: `Schedule ${name} removed successfully. It was cron '${config.cron}'.`,
		};
	}

	/**
	 * Cancel all schedules
	 */
	cancelAllSchedules(): {
		success: boolean;
		message: string;
		cancelledCount: number;
	} {
		const count = this.schedules.size;

		if (count === 0) {
			return {
				success: false,
				message: "No active schedules to cancel",
				cancelledCount: 0,
			};
		}
		// Stop all cron jobs
		for (const [name, job] of this.jobs.entries()) {
			try {
				job.stop?.();
				job.destroy?.();
			} catch (_) {
				/* ignore */
			}
			this.jobs.delete(name);
		}

		this.schedules.clear();
		void this.persistCronFile();

		return {
			success: true,
			message: `All ${count} schedule(s) removed successfully.`,
			cancelledCount: count,
		};
	}

	/**
	 * List all active schedules
	 */
	listSchedules(): Array<{
		name: string;
		message?: string;
		cron: string;
		timezone?: string;
		createdAt: string;
	}> {
		return Array.from(this.schedules.values()).map((s) => ({
			name: s.name,
			message: s.message,
			cron: s.cron,
			timezone: s.timezone,
			createdAt: s.createdAt,
		}));
	}

	/**
	 * Get schedule details
	 */
	getSchedule(name: string): ScheduleConfig | null {
		return this.schedules.get(name) || null;
	}
}

// Export singleton instance
export const scheduleManager = new ScheduleManager();
