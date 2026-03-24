import { registerApiRoute } from "@mastra/core/server";
import { WhatsAppChannel } from "../channels/whatsapp";

export function createWhatsAppRoutes() {
	return [
		registerApiRoute("/whatsapp/qr", {
			method: "GET",
			handler: async (c) => {
				WhatsAppChannel.getInstance().requestPairing();
				const qr = WhatsAppChannel.getInstance().getQrCode();
				if (!qr) {
					return c.json(
						{ error: "QR code not available or already paired" },
						404,
					);
				}
				return c.json({ qr });
			},
		}),
		registerApiRoute("/whatsapp/status", {
			method: "GET",
			handler: async (c) => {
				const isConnected = WhatsAppChannel.getInstance().isConnected();
				const hasQr = !!WhatsAppChannel.getInstance().getQrCode();
				return c.json({ isConnected, isPaired: isConnected && !hasQr, hasQr });
			},
		}),
	];
}
