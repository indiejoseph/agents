import fs from "node:fs";
import path from "node:path";
import type { Boom } from "@hapi/boom";
import {
	type ConnectionState,
	DisconnectReason,
	downloadMediaMessage,
	extractMessageContent,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	makeWASocket,
	useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { EventSource } from "eventsource";
import pino from "pino";

export type WhatsAppSocket = ReturnType<typeof makeWASocket>;

export class WhatsAppChannel {
	private static instance: WhatsAppChannel;
	private socket: WhatsAppSocket | null = null;
	private qrCode: string | null = null;
	private authDir: string;
	private apiBase: string;
	private rootBase: string;
	private es: EventSource | null = null;
	private isConnecting = false;
	private qrCount = 0;
	private readonly MAX_QR_ATTEMPTS = 5;
	private readonly MAX_MEDIA_SIZE = 25 * 1024 * 1024;
	private readonly attachmentsDir: string;
	private readonly allowedJids: string[];

	private constructor() {
		const workspace = process.env.AGENT_WORKSPACE || "./workspace";
		const port = process.env.PORT || "4111";
		const agentUrl = process.env.AGENT_URL || `http://localhost:${port}`;
		const normalizedAgentUrl = agentUrl.replace(/\/+$/, "");
		this.rootBase = normalizedAgentUrl;
		this.apiBase = `${normalizedAgentUrl}/api/agents/main`;
		this.authDir = path.join(workspace, "auth/whatsapp");
		this.attachmentsDir = path.join(workspace, "whatsapp-attachments");
		if (!fs.existsSync(this.authDir)) {
			fs.mkdirSync(this.authDir, { recursive: true });
		}
		if (!fs.existsSync(this.attachmentsDir)) {
			fs.mkdirSync(this.attachmentsDir, { recursive: true });
		}
		this.allowedJids = (process.env.WHATSAPP_WHITELIST_JIDS || "")
			.split(",")
			.map((jid) => jid.trim())
			.filter((jid) => jid.length > 0);
	}

	public static getInstance(): WhatsAppChannel {
		if (!WhatsAppChannel.instance) {
			WhatsAppChannel.instance = new WhatsAppChannel();
		}
		return WhatsAppChannel.instance;
	}

	private hasCreds(): boolean {
		const credsPath = path.join(this.authDir, "creds.json");
		return fs.existsSync(credsPath);
	}

	public async init() {
		if (this.hasCreds()) {
			console.log("[whatsapp] Found saved credentials, connecting...");
			await this.connect();
		} else {
			console.log(
				"[whatsapp] No credentials found, waiting for pairing request.",
			);
		}
	}

	public requestPairing(): boolean {
		if (!this.socket && !this.isConnecting) {
			console.log("[whatsapp] Pairing requested, initiating connection...");
			this.qrCount = 0;
			this.connect();
			return true;
		}
		return false;
	}

	public getQrCode(): string | null {
		return this.qrCode;
	}

	public isConnected(): boolean {
		return !!this.socket && !this.qrCode;
	}

	public getProfile() {
		if (!this.socket || !this.socket.user) {
			return null;
		}
		return {
			id: this.socket.user.id,
			name: this.socket.user.name,
		};
	}

	public async logout() {
		if (this.socket) {
			await this.socket.logout();
			this.socket.end(undefined);
		}
		this.resetState();
		if (fs.existsSync(this.authDir)) {
			fs.rmSync(this.authDir, { recursive: true, force: true });
			fs.mkdirSync(this.authDir, { recursive: true });
		}
		return { success: true };
	}

	private async connect() {
		if (this.isConnecting) return;
		this.isConnecting = true;

		try {
			const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
			const { version, isLatest } = await fetchLatestBaileysVersion();

			console.log(
				`[whatsapp] Using WhatsApp v${version.join(".")}, isLatest: ${isLatest}`,
			);

			const logger = pino({ level: "silent" }) as any;

			this.socket = makeWASocket({
				auth: {
					creds: state.creds,
					keys: makeCacheableSignalKeyStore(state.keys, logger),
				},
				version,
				logger,
				printQRInTerminal: false,
				browser: ["Mastra Agent", "Chrome", "1.0.0"],
			});

			this.socket.ev.on("creds.update", saveCreds);

			this.socket.ev.on(
				"connection.update",
				(update: Partial<ConnectionState>) => {
					const { connection, lastDisconnect, qr } = update;

					if (qr) {
						this.qrCode = qr;
						this.qrCount++;
						console.log(
							`[whatsapp] QR code generated (${this.qrCount}/${this.MAX_QR_ATTEMPTS})`,
						);

						if (this.qrCount >= this.MAX_QR_ATTEMPTS) {
							console.log(
								"[whatsapp] Pairing timed out (too many QR codes generated). Stopping...",
							);
							this.socket?.end(new Error("Pairing timeout"));
							this.resetState();
						}
					}

					if (connection === "close") {
						const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
						const isLogout = reason === DisconnectReason.loggedOut;
						const isTimeout =
							lastDisconnect?.error?.message === "Pairing timeout";

						this.qrCode = null;
						this.isConnecting = false;

						if (isLogout) {
							console.log(
								"[whatsapp] Connection closed (logged out). Cleaning up auth data.",
							);
							fs.rmSync(this.authDir, { recursive: true, force: true });
							this.socket = null;
						} else if (isTimeout) {
							this.socket = null;
						} else {
							console.log(
								"[whatsapp] Connection closed, reconnecting...",
								lastDisconnect?.error?.message || "",
							);
							setTimeout(() => this.connect(), 5000);
						}
					} else if (connection === "open") {
						this.qrCode = null;
						this.isConnecting = false;
						this.qrCount = 0;
						console.log("[whatsapp] WhatsApp connection opened successfully");
						this.setupNotificationListener();
					}
				},
			);

			this.socket.ev.on("messages.upsert", async ({ messages }) => {
				for (const msg of messages) {
					if (!msg.message || msg.key.fromMe) continue;
					await this.handleMessage(msg);
				}
			});
		} catch (error) {
			console.error("[whatsapp] Failed to initiate connection:", error);
			this.isConnecting = false;
		}
	}

	private resetState() {
		this.socket = null;
		this.qrCode = null;
		this.isConnecting = false;
		this.qrCount = 0;
		if (this.es) {
			this.es.close();
			this.es = null;
		}
	}

	private setupNotificationListener() {
		if (this.es) return;

		const url = `${this.rootBase}/notify/stream`;
		console.log(`[whatsapp] Subscribing to notifications via SSE: ${url}`);

		this.es = new EventSource(url);

		this.es.onmessage = (event) => {
			try {
				const notification = JSON.parse(event.data);
				const targetJid =
					notification.recipient || process.env.WHATSAPP_NOTIFICATION_JID;
				if (targetJid && this.socket && !this.qrCode) {
					console.log(
						`[whatsapp] Forwarding notification to ${targetJid}: ${notification.text.substring(0, 50)}...`,
					);
					this.socket
						.sendMessage(targetJid, { text: notification.text })
						.catch((err) =>
							console.error("[whatsapp] Failed to send notification:", err),
						);
				}
			} catch (err) {
				// Ignore
			}
		};

		this.es.onerror = (err) => {
			console.error(
				"[whatsapp] Notification stream error, retrying in 5s...",
				err,
			);
			this.es?.close();
			this.es = null;
			setTimeout(() => this.setupNotificationListener(), 5000);
		};
	}

	private async handleMessage(msg: any) {
		const remoteJid = msg.key.remoteJid;
		if (!remoteJid) return;
		if (!this.isAllowed(remoteJid)) {
			console.log(
				`[whatsapp] Ignoring message from non-allowlisted JID: ${remoteJid}`,
			);
			return;
		}

		const resourceId = `whatsapp-${remoteJid}`;
		const threadId = await this.resolveThreadId(resourceId);
		const { text, attachmentPath, attachmentError } =
			await this.extractIncomingContent(msg, threadId);

		if (!text && !attachmentPath) return;

		const display = text ? text.substring(0, 120) : "[media]";
		console.log(`[whatsapp] Message from ${remoteJid}: ${display}`);

		try {
			const messageContent = this.composeMessageContent(text, attachmentPath);

			const response = await fetch(`${this.apiBase}/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages: [{ role: "user", content: messageContent }],
					memory: threadId
						? { thread: threadId, resource: resourceId }
						: { resource: resourceId },
				}),
			});

			if (!response.ok) {
				const bodyText = await response.text();
				const errorId = `${response.status}-${Date.now()}`;
				console.error("[whatsapp] Agent API error", {
					errorId,
					status: response.status,
					body: bodyText,
				});
				await this.sendSafe(remoteJid, {
					text:
						"Sorry — I hit an internal error while processing your message. " +
						`Please try again. (error ${errorId})`,
				});
				return;
			}

			const result = (await response.json()) as {
				text: string;
				thread?: { id?: string } | string;
				threadId?: string;
			};
			const responseText = attachmentError
				? `${result.text}\n\n(Note: failed to download media: ${attachmentError})`
				: result.text;
			await this.sendSafe(remoteJid, { text: responseText });
		} catch (error) {
			const errorId = `exception-${Date.now()}`;
			console.error("[whatsapp] Error handling message:", { errorId, error });
			await this.sendSafe(remoteJid, {
				text:
					"Sorry — I ran into an unexpected error while responding. " +
					`Please try again. (error ${errorId})`,
			});
		}
	}

	private async sendSafe(remoteJid: string, payload: { text: string }) {
		if (!this.socket) return;
		try {
			await this.socket.sendMessage(remoteJid, payload);
		} catch (error) {
			console.error("[whatsapp] Failed to send message:", error);
		}
	}

	// Public wrapper to send a text message. Returns an object with success and optional error.
	public async sendMessage(
		remoteJid: string,
		text: string,
	): Promise<{ success: boolean; error?: string }> {
		if (!this.socket) return { success: false, error: "not_connected" };
		try {
			await this.socket.sendMessage(remoteJid, { text });
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[whatsapp] Failed to send message:", message);
			return { success: false, error: message };
		}
	}

	private composeMessageContent(text: string, attachmentPath?: string): string {
		const trimmed = text.trim();
		if (attachmentPath) {
			return trimmed ? `@${attachmentPath}\n${trimmed}` : `@${attachmentPath}`;
		}
		return trimmed;
	}

	private async extractIncomingContent(
		msg: any,
		threadId?: string,
	): Promise<{
		text: string;
		attachmentPath?: string;
		attachmentError?: string;
	}> {
		const content = extractMessageContent(msg.message);
		if (!content) {
			return { text: "" };
		}

		const text =
			content.conversation ||
			content.extendedTextMessage?.text ||
			content.imageMessage?.caption ||
			content.videoMessage?.caption ||
			content.documentMessage?.caption ||
			"";

		const media =
			content.imageMessage ||
			content.videoMessage ||
			content.audioMessage ||
			content.documentMessage ||
			content.stickerMessage;

		if (!media) {
			return { text };
		}

		try {
			const buffer = (await downloadMediaMessage(
				msg,
				"buffer",
				{},
				{
					logger: pino({ level: "silent" }) as any,
					reuploadRequest: (m) => new Promise((resolve) => resolve(m)),
				},
			)) as Buffer;

			if (buffer.length > this.MAX_MEDIA_SIZE) {
				return {
					text,
					attachmentError: `Media exceeds size limit (${this.MAX_MEDIA_SIZE} bytes)`,
				};
			}

			const ext = this.getMediaExtension(content);
			const filename =
				(media as any).fileName ||
				`whatsapp_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
			const safeThreadId = threadId || "unknown-thread";
			const dir = path.join(this.attachmentsDir, safeThreadId);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			const attachmentPath = path.join(dir, filename);
			fs.writeFileSync(attachmentPath, buffer);
			return { text, attachmentPath };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { text, attachmentError: message };
		}
	}

	private getMediaExtension(content: any): string {
		if (content.imageMessage) return "jpg";
		if (content.videoMessage) return "mp4";
		if (content.audioMessage) return "ogg";
		if (content.documentMessage) return "bin";
		if (content.stickerMessage) return "webp";
		return "bin";
	}

	private isAllowed(remoteJid: string): boolean {
		if (this.allowedJids.length === 0) return true;
		const bare = remoteJid.replace(/@.*$/, "");
		return this.allowedJids.some((allowed) => {
			const normalized = allowed.replace(/@.*$/, "");
			return allowed === remoteJid || normalized === bare;
		});
	}

	private async resolveThreadId(
		resourceId: string,
	): Promise<string | undefined> {
		const base = `${this.rootBase}/api/memory/threads`;
		const orderBy = encodeURIComponent(
			JSON.stringify({ field: "createdAt", direction: "DESC" }),
		);
		const listUrl = `${base}?agentId=main&resourceId=${encodeURIComponent(
			resourceId,
		)}&perPage=1&orderBy=${orderBy}`;

		try {
			const listResp = await fetch(listUrl);
			if (listResp.ok) {
				const listJson = (await listResp.json()) as {
					threads?: Array<{ id: string }>;
				};
				const existing = listJson.threads?.[0]?.id;
				if (existing) return existing;
			}
		} catch (error) {
			console.error("[whatsapp] Failed to list threads:", error);
		}

		try {
			const createResp = await fetch(`${base}?agentId=main`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ resourceId }),
			});
			if (!createResp.ok) {
				return undefined;
			}
			const created = (await createResp.json()) as { id?: string };
			return created.id;
		} catch (error) {
			console.error("[whatsapp] Failed to create thread:", error);
			return undefined;
		}
	}
}
