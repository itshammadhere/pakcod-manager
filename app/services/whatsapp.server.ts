const META_API_VERSION = "v22.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface WhatsAppConfig {
  phoneNumberId: string;
  token: string;
}

interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function getConfig(whatsappToken: string, whatsappPhone: string): WhatsAppConfig {
  return {
    phoneNumberId: whatsappPhone,
    token: whatsappToken,
  };
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  try {
    const response = await fetch(
      `${META_GRAPH_URL}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/[^0-9]/g, ""),
          type: "text",
          text: { body },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error?.message || "Unknown error" };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendOrderConfirmation(
  to: string,
  orderNumber: number,
  amount: number,
  customerName: string,
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  const body = `Assalam-o-Alaikum ${customerName}! 👋\n\nYour order #${orderNumber} for PKR ${amount.toLocaleString()} has been placed.\n\n📦 Please reply:\n✅ *YES* to confirm your order\n❌ *NO* to cancel\n\nNo reply within 24 hours will auto-cancel the order.\n\nThank you for shopping with us! 🎉`;

  return sendWhatsAppMessage(to, body, config);
}

export async function sendOrderConfirmed(
  to: string,
  orderNumber: number,
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  const body = `✅ Your order #${orderNumber} is CONFIRMED!\n\nWe'll notify you once it's shipped. Thank you! 🎉`;
  return sendWhatsAppMessage(to, body, config);
}

export async function sendOrderCancelled(
  to: string,
  orderNumber: number,
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  const body = `❌ Your order #${orderNumber} has been cancelled as requested.\n\nIf this was a mistake, please place a new order.`;
  return sendWhatsAppMessage(to, body, config);
}

export async function sendOrderShipped(
  to: string,
  orderNumber: number,
  courierName: string,
  trackingNumber: string,
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  const body = `📦 Your order #${orderNumber} has been SHIPPED!\n\nCourier: ${courierName}\nTracking: ${trackingNumber}\n\nWe'll update you on the delivery status.`;
  return sendWhatsAppMessage(to, body, config);
}

export async function sendOutForDelivery(
  to: string,
  orderNumber: number,
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  const body = `🚚 Your order #${orderNumber} is OUT FOR DELIVERY!\n\nPlease keep your phone nearby. Our rider will call you before arriving.`;
  return sendWhatsAppMessage(to, body, config);
}

export async function sendStaffAlert(
  staffPhone: string,
  orderNumber: number,
  amount: number,
  customerName: string,
  customerCity: string,
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  const body = `🔔 *New COD Order*\n\nOrder: #${orderNumber}\nAmount: PKR ${amount.toLocaleString()}\nCustomer: ${customerName}\nCity: ${customerCity}\n\nPlease process this order.`;
  return sendWhatsAppMessage(staffPhone, body, config);
}

export async function processIncomingWhatsApp(body: any) {
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message) return null;

  const from = message.from;
  const text = message.text?.body?.trim().toLowerCase();

  if (!text) return null;

  const isConfirmed = text === "yes" || text === "1" || text === "yeah" || text === "confirm";
  const isCancelled = text === "no" || text === "2" || text === "cancel" || text === "nah";

  return {
    from,
    isConfirmed,
    isCancelled,
    rawText: text,
    messageId: message.id,
    timestamp: message.timestamp,
  };
}
