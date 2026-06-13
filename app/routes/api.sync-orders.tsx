import { authenticate } from "../shopify.server";
import { createOrder, getOrderByShopifyId } from "../models/order.server";
import { scorePhone } from "../services/risk-scoring.server";
import prisma from "../db.server";

const BATCH_SIZE = 10;

export async function action({ request }: { request: Request }) {
  try {
    const { session } = await authenticate.admin(request);

    const accessToken = session.accessToken;
    const shop = session.shop;

    const url = `https://${shop}/admin/api/2026-04/orders.json?status=any&limit=50`;
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 403 || text.includes("access denied") || text.includes("protected")) {
        return Response.json({
          success: false,
          error: "Shopify denied access. Go to Partners Dashboard → Apps → PakCOD Manager → Protected Customer Data → fill the form and save.",
          protectedDataError: true,
          detail: text.substring(0, 500),
        }, { status: 403 });
      }
      return Response.json({ success: false, error: `Shopify API error ${response.status}: ${text.substring(0, 500)}` }, { status: 500 });
    }

    const data = await response.json();
    const orders = data.orders || [];

    let imported = 0;
    let alreadyExists = 0;
    const errors: { orderId: string; message: string }[] = [];
    const importedOrders: string[] = [];

    const batchQueue: {
      shopifyOrderId: string;
      orderNumber: number;
      customerName: string;
      customerPhone: string;
      customerEmail: string;
      customerCity: string;
      customerAddress: string;
      totalPrice: number;
      tags: string;
    }[] = [];

    for (const order of orders) {
      const shopifyOrderId = String(order.id);
      const existing = await getOrderByShopifyId(shopifyOrderId);
      if (existing) {
        alreadyExists++;
        continue;
      }

      const phone = order.shipping_address?.phone || order.customer?.phone || "";
      const normalizedPhone = phone.replace(/[^0-9]/g, "");
      const orderNumber = parseInt(String(order.order_number)) || 0;

      const shippingAddress = order.shipping_address;
      const fullName = `${shippingAddress?.first_name || ""} ${shippingAddress?.last_name || ""}`.trim()
        || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();

      const tags = Array.isArray(order.tags) ? order.tags.join(",") : (order.tags || "");

      batchQueue.push({
        shopifyOrderId,
        orderNumber,
        customerName: fullName || `Order #${orderNumber}`,
        customerPhone: normalizedPhone,
        customerEmail: order.customer?.email || "",
        customerCity: shippingAddress?.city || "",
        customerAddress: [shippingAddress?.address1, shippingAddress?.address2].filter(Boolean).join(", "),
        totalPrice: parseFloat(order.total_price || "0"),
        tags,
      });
    }

    for (let i = 0; i < batchQueue.length; i += BATCH_SIZE) {
      const batch = batchQueue.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const order = await createOrder({
            shop,
            shopifyOrderId: item.shopifyOrderId,
            orderNumber: item.orderNumber,
            customerName: item.customerName,
            customerPhone: item.customerPhone,
            customerEmail: item.customerEmail,
            customerCity: item.customerCity,
            customerAddress: item.customerAddress,
            totalPrice: item.totalPrice,
            codAmount: item.totalPrice,
            tags: item.tags,
          });

          if (item.customerPhone) {
            const risk = await scorePhone(item.customerPhone, shop);
            await prisma.codOrder.update({
              where: { id: order.id },
              data: { riskScore: risk.level },
            });
          }

          return { orderNumber: item.orderNumber };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          imported++;
          importedOrders.push(`#${result.value.orderNumber}`);
        } else {
          errors.push({ orderId: "unknown", message: result.reason?.message || "Unknown error" });
        }
      }
    }

    return Response.json({
      success: true,
      imported,
      alreadyExists,
      total: orders.length,
      errors,
      importedOrders,
    });
  } catch (error: any) {
    console.error("Sync orders error:", error);
    return Response.json({ success: false, error: error.message || String(error) }, { status: 500 });
  }
}

export async function loader() {
  return Response.json({ message: "Use POST to sync orders" });
}
