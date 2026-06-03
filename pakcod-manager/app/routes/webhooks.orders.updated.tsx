import { authenticate } from "../shopify.server";
import { getOrderByShopifyId, updateOrderStatus } from "../models/order.server";

export async function action({ request }: { request: Request }) {
  try {
    const { topic, shop, session } = await authenticate.webhook(request);
    if (!session) return new Response("Session not found", { status: 401 });

    const rawBody = await request.text();
    const orderData = JSON.parse(rawBody);

    const order = await getOrderByShopifyId(String(orderData.id));
    if (!order) return new Response("Order not found in app", { status: 200 });

    const fulfillmentStatus = orderData.fulfillment_status;
    const financialStatus = orderData.financial_status;

    if (fulfillmentStatus === "fulfilled" && order.status === "confirmed") {
      await updateOrderStatus(order.id, {
        status: "shipped",
        notes: "Order fulfilled in Shopify",
        changedBy: "shopify",
      });
    }

    if (financialStatus === "voided" || financialStatus === "refunded") {
      await updateOrderStatus(order.id, {
        status: "cancelled",
        notes: `Order ${financialStatus} in Shopify`,
        changedBy: "shopify",
      });
    }

    if (orderData.cancelled_at) {
      await updateOrderStatus(order.id, {
        status: "cancelled",
        notes: "Order cancelled in Shopify",
        changedBy: "shopify",
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Order updated webhook error:", error);
    return new Response(error.message, { status: 500 });
  }
}
