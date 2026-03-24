import { EventEmitter } from "node:events";

export interface Notification {
	text: string;
	timestamp: string;
	source: string;
	recipient?: string;
}

class NotificationEmitter extends EventEmitter {
	override emit(event: "notification", notification: Notification): boolean;
	override emit(event: string, ...args: unknown[]): boolean {
		return super.emit(event, ...args);
	}

	override on(
		event: "notification",
		listener: (notification: Notification) => void,
	): this;
	override on(
		event: string,
		listener:
			| ((...args: unknown[]) => void)
			| ((notification: Notification) => void),
	): this {
		return super.on(event, listener);
	}

	notify(text: string, source = "heartbeat", recipient?: string): void {
		const notification: Notification = {
			text,
			timestamp: new Date().toISOString(),
			source,
			recipient,
		};

		if (this.listenerCount("notification") === 0) {
			console.log(
				`[notification] No channel connected, notification dropped: ${text.substring(0, 80)}...`,
			);
			return;
		}

		this.emit("notification", notification);
	}
}

export const notificationEmitter = new NotificationEmitter();
