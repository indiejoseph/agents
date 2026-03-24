import path from "node:path";
import { createTool } from "@mastra/core/tools";
import qrcode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";
import { z } from "zod";
import { WhatsAppChannel } from "../channels/whatsapp";

export const whatsappPairTool = createTool({
	id: "whatsapp_pair",
	description:
		"Initiate WhatsApp pairing process. Returns instructions or a QR code if needed.",
	inputSchema: z.object({
		outputFormat: z
			.enum(["terminal", "png"])
			.optional()
			.default("terminal")
			.describe(
				"Whether to output the QR code to the terminal or as a PNG file.",
			),
	}),
	execute: async ({ outputFormat }) => {
		const channel = WhatsAppChannel.getInstance();

		if (channel.isConnected()) {
			const profile = channel.getProfile();
			return {
				message: `WhatsApp is already connected as ${profile?.name || "unknown"} (${profile?.id || "unknown"}).`,
				isConnected: true,
			};
		}

		channel.requestPairing();

		// Wait a bit for QR to be generated
		await new Promise((resolve) => setTimeout(resolve, 3000));

		const qr = channel.getQrCode();
		if (qr) {
			if (outputFormat === "terminal") {
				console.log("\n--- WhatsApp Pairing QR Code ---");
				qrcodeTerminal.generate(qr, { small: true });
				console.log("--------------------------------\n");

				return {
					message:
						"WhatsApp pairing initiated. I have printed the QR code to the server terminal. Please scan it to connect.",
					qr,
					isConnected: false,
				};
			} else {
				const fileName = `whatsapp-qr-${Date.now()}.png`;
				const filePath = path.join("/tmp", fileName);
				await qrcode.toFile(filePath, qr);

				return {
					message:
						"WhatsApp pairing initiated. I have saved the QR code as a PNG image.",
					qr,
					isConnected: false,
					imagePath: filePath,
					instructions: "You can now send this image to the user.",
				};
			}
		}

		return {
			message:
				"WhatsApp pairing process started. Please check the server logs in a few seconds for the QR code.",
			isConnected: false,
		};
	},
});

export const whatsappStatusTool = createTool({
	id: "whatsapp_status",
	description:
		"Check the current WhatsApp connection status and profile information.",
	inputSchema: z.object({}),
	execute: async () => {
		const channel = WhatsAppChannel.getInstance();
		const isConnected = channel.isConnected();
		const profile = channel.getProfile();
		const qr = channel.getQrCode();

		return {
			isConnected,
			isPaired: isConnected && !qr,
			profile: profile || null,
			hasActiveQr: !!qr,
		};
	},
});

export const whatsappLogoutTool = createTool({
	id: "whatsapp_logout",
	description: "Log out from WhatsApp and clear authentication data.",
	inputSchema: z.object({}),
	execute: async () => {
		const channel = WhatsAppChannel.getInstance();
		const result = await channel.logout();
		return {
			message:
				"Successfully logged out from WhatsApp and cleared session data.",
			...result,
		};
	},
});

// Simple programmatic helper to send a WhatsApp message via the WhatsAppChannel singleton.
export const whatsappSendMessageTool = createTool({
	id: "whatsapp_send_message",
	description:
		"Send a WhatsApp message to a specified JID (phone number in international format).",
	inputSchema: z.object({
		jid: z
			.string()
			.describe("The JID of the recipient (e.g., '123456789@s.whatsapp.net')"),
		message: z.string().describe("The message to send"),
	}),
	execute: async ({ jid, message }) => {
		const channel = WhatsAppChannel.getInstance();
		// Use the new public sendMessage wrapper on the channel
		const result = await channel.sendMessage(jid, message);
		return result;
	},
});

export const whatsappTools = {
	whatsappPair: whatsappPairTool,
	whatsappStatus: whatsappStatusTool,
	whatsappLogout: whatsappLogoutTool,
	whatsappSendMessage: whatsappSendMessageTool,
};
