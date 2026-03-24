import { registerApiRoute } from "@mastra/core/server";
import {
	type Notification,
	notificationEmitter,
} from "../notifications/emitter";

export function createNotifyRoutes() {
	return [
		registerApiRoute("/notify", {
			method: "POST",
			handler: async (c) => {
				const body = await c.req.json();
				const { text, source, recipient } = body;
				if (!text || typeof text !== "string") {
					return c.json({ error: "text is required" }, 400);
				}
				notificationEmitter.notify(text, source ?? "plugin", recipient);
				return c.json({ ok: true });
			},
		}),
		registerApiRoute("/notify/stream", {
			method: "GET",
			handler: async (c) => {
				const encoder = new TextEncoder();

				const stream = new ReadableStream({
					start(controller) {
						const listener = (notification: Notification) => {
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(notification)}\n\n`),
							);
						};

						notificationEmitter.on("notification", listener);

						// Send a keep-alive comment every 5s to prevent Bun/proxy timeouts
						const keepAlive = setInterval(() => {
							try {
								controller.enqueue(encoder.encode(": keep-alive\n\n"));
							} catch {
								clearInterval(keepAlive);
							}
						}, 5_000);

						c.req.raw.signal.addEventListener("abort", () => {
							notificationEmitter.off("notification", listener);
							clearInterval(keepAlive);
							controller.close();
						});
					},
				});

				return new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
				});
			},
		}),
	];
}
