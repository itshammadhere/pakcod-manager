import { processIncomingWhatsApp, sendOrderConfirmed, sendOrderCancelled } from "../services/whatsapp.server";
import { getOrderByShopifyId, updateOrderStatus } from "../models/order.server";
import { getStore, getWhatsAppConfig } from "../models/store.server";
import { createNotification, updateNotificationStatus } from "../models/notification.server";
import prisma from "../db.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Verification failed", { status: 403 });
}

export async function action({ request }: { request: Request }) {
  try {
    const body = await request.json();
    const result = await processIncomingWhatsApp(body);

    if (!result) {
      return new Response("OK", { status: 200 });
    }

    const { from, isConfirmed, isCancelled } = result;

    const order = await prisma.codOrder.findFirst({
      where: {
        customerPhone: { contains: from.slice(-10) },
        status: "pending_confirmation",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!order) {
      return new Response("No pending order found", { status: 200 });
    }

    const waConfig = await getWhatsAppConfig(order.shop);

    if (isConfirmed) {
      await updateOrderStatus(order.id, {
        status: "confirmed",
        notes: "Customer confirmed via WhatsApp",
        changedBy: "customer",
      });

      if (waConfig) {
        const result = await sendOrderConfirmed(
          from,
          order.orderNumber,
          waConfig
        );

        const notification = await createNotification({
          codOrderId: order.id,
          channel: "whatsapp",
          template: "order_confirmed",
          recipient: from,
          message: `Order #${order.orderNumber} confirmed`,
        });

        if (result.success) {
          await updateNotificationStatus(notification.id, "sent", { sentAt: new Date() });
        }
      }
    } else if (isCancelled) {
      await updateOrderStatus(order.id, {
        status: "cancelled",
        notes: "Customer cancelled via WhatsApp",
        changedBy: "customer",
      });

      const adminUrl = `https://admin.shopify.com/store/${order.shop.replace(".myshopify.com", "")}`;

      if (waConfig) {
        const result = await sendOrderCancelled(from, order.orderNumber, waConfig);

        const notification = await createNotification({
          codOrderId: order.id,
          channel: "whatsapp",
          template: "order_cancelled",
          recipient: from,
          message: `Order #${order.orderNumber} cancelled by customer`,
        });

        if (result.success) {
          await updateNotificationStatus(notification.id, "sent", { sentAt: new Date() });
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("WhatsApp webhook error:", error);
    return new Response(error.message, { status: 500 });
  }
}
