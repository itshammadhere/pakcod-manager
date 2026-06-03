import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { createOrder } from "../models/order.server";
import { getStore, getWhatsAppConfig } from "../models/store.server";
import { checkRules } from "../models/rules.server";
import { sendOrderConfirmation, sendStaffAlert } from "../services/whatsapp.server";
import { createNotification, updateNotificationStatus } from "../models/notification.server";
import { scorePhone } from "../services/risk-scoring.server";

export async function action({ request }: { request: Request }) {
  try {
    const { topic, shop, session, admin } = await authenticate.webhook(request);
    if (!session) {
      return new Response("Session not found", { status: 401 });
    }

    const rawBody = await request.text();
    const orderData = JSON.parse(rawBody);

    const gateway = orderData?.gateway || "";
    const isCod = gateway === "cod" || gateway === "cash_on_delivery";
    const isManualOrTest = gateway === "manual" || gateway === "bogus" || gateway === "free";
    const isPendingPayment = orderData?.financial_status === "pending" || orderData?.financial_status === "authorized";

    if (!isCod && !isManualOrTest && !isPendingPayment) {
      console.log(`[webhook] Skipping order ${orderData?.order_number} - gateway: ${gateway}, financial_status: ${orderData?.financial_status}`);
      return new Response("Not a COD/manual order", { status: 200 });
    }

    const customerPhone =
      orderData?.phone ||
      orderData?.shipping_address?.phone ||
      orderData?.billing_address?.phone ||
      "";

    const normalizedPhone = customerPhone.replace(/[^0-9]/g, "");

    const isBlacklisted = await checkBlacklist(shop, normalizedPhone);
    if (isBlacklisted) {
      await admin.graphql(
        `#graphql
        mutation {
          orderUpdate(input: {
            id: "gid://shopify/Order/${orderData.id}",
            tags: ["blacklisted"],
            note: "Phone number is blacklisted - COD blocked"
          }) { order { id } }
        }`
      );
      return new Response("Order blocked - blacklisted phone", { status: 200 });
    }

    const order = await createOrder({
      shop,
      shopifyOrderId: String(orderData.id),
      orderNumber: orderData.order_number,
      customerName: `${orderData?.shipping_address?.first_name || ""} ${orderData?.shipping_address?.last_name || ""}`.trim(),
      customerPhone: normalizedPhone,
      customerEmail: orderData?.email,
      customerCity: orderData?.shipping_address?.city,
      customerAddress: `${orderData?.shipping_address?.address1 || ""} ${orderData?.shipping_address?.address2 || ""}`.trim(),
      customerNotes: orderData?.note || "",
      totalPrice: parseFloat(orderData.total_price || "0"),
      codAmount: parseFloat(orderData.total_price || "0"),
    });

    const riskResult = await scorePhone(normalizedPhone, shop);
    await prisma.codOrder.update({
      where: { id: order.id },
      data: { riskScore: riskResult.level },
    });

    let tags = orderData.tags || [];
    if (typeof tags === "string") tags = tags.split(",").map((t: string) => t.trim());

    const rulesCheck = await checkRules(shop, {
      totalPrice: order.totalPrice,
      customerPhone: normalizedPhone,
      customerCity: orderData?.shipping_address?.city,
    });

    if (rulesCheck.blocked) {
      await updateOrderStatus(order.id, {
        status: "cancelled",
        notes: rulesCheck.reason,
        changedBy: "system",
      });

      await admin.graphql(
        `#graphql
        mutation {
          orderUpdate(input: {
            id: "gid://shopify/Order/${orderData.id}",
            tags: ${JSON.stringify([...tags, "cod_blocked"])},
            note: "${rulesCheck.reason}"
          }) { order { id } }
        }`
      );

      return new Response("Order blocked by rules", { status: 200 });
    }

    await admin.graphql(
      `#graphql
      mutation {
        orderUpdate(input: {
          id: "gid://shopify/Order/${orderData.id}",
          tags: ${JSON.stringify([...tags, "cod_imported", "pending_confirmation"])}
        }) { order { id } }
      }`
    );

    const waConfig = await getWhatsAppConfig(shop);
    if (waConfig && normalizedPhone) {
      const result = await sendOrderConfirmation(
        normalizedPhone,
        order.orderNumber,
        order.codAmount,
        order.customerName || "Customer",
        waConfig
      );

      const notification = await createNotification({
        codOrderId: order.id,
        channel: "whatsapp",
        template: "order_confirmation",
        recipient: normalizedPhone,
        message: `Confirmation request for order #${order.orderNumber}`,
      });

      if (result.success) {
        await updateNotificationStatus(notification.id, "sent", { sentAt: new Date() });
      } else {
        await updateNotificationStatus(notification.id, "failed", {
          failedAt: new Date(),
          error: result.error,
        });
      }

      const store = await getStore(shop);

      if (store?.whatsappPhone) {
        await sendStaffAlert(
          store.whatsappPhone,
          order.orderNumber,
          order.codAmount,
          order.customerName || "Customer",
          order.customerCity || "Unknown",
          waConfig
        );
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(error.message, { status: 500 });
  }
}

async function checkBlacklist(shop: string, phone: string) {
  const { isBlacklisted } = await import("../models/blacklist.server");
  return isBlacklisted(shop, phone);
}

async function updateOrderStatus(id: string, data: any) {
  const { updateOrderStatus } = await import("../models/order.server");
  return updateOrderStatus(id, data);
}
