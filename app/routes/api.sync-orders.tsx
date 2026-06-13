// FIXED: Switched from GraphQL Admin API to REST API for order syncing.
// The GraphQL API requires Protected Customer Data approval, which blocks
// access to the Order object for non-approved apps. The REST API works
// without this restriction for development stores.
import { authenticate } from "../shopify.server";
import { createOrder, getOrderByShopifyId } from "../models/order.server";
import { scorePhone } from "../services/risk-scoring.server";
import prisma from "../db.server";
import { apiVersion } from "../shopify.server";

const BATCH_SIZE = 10;

export async function action({ request }: { request: Request }) {
  try {
    const { session, admin } = await authenticate.admin(request);

    const shopDomain = session.shop;
    const accessToken = session.accessToken;

    if (!accessToken) {
      return Response.json({ success: false, error: "No access token available. Reinstall the app." }, { status: 401 });
    }

    const restUrl = `https://${shopDomain}/admin/api/${apiVersion}/orders.json?status=any&limit=250&order=created_at+desc`;

    const restResponse = await fetch(restUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!restResponse.ok) {
      const errorBody = await restResponse.text();
      return Response.json({
        success: false,
        error: `REST API error (${restResponse.status}): ${errorBody.substring(0, 500)}`,
      }, { status: 500 });
    }

    const body = await restResponse.json();
    const orders = body?.orders || [];

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

    for (const orderData of orders) {
      const shopifyOrderId = String(orderData.id);
      const phone = orderData.phone || orderData.shipping_address?.phone || orderData.billing_address?.phone || "";
      const normalizedPhone = phone.replace(/[^0-9]/g, "");

      const existing = await getOrderByShopifyId(shopifyOrderId);
      if (existing) {
        alreadyExists++;
        continue;
      }

      const shipping = orderData.shipping_address || {};
      const customerName = `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() || "Customer";
      const orderNumber = orderData.order_number || 0;

      let tags = "";
      if (Array.isArray(orderData.tags)) {
        tags = orderData.tags.join(",");
      } else if (typeof orderData.tags === "string") {
        tags = orderData.tags;
      }

      batchQueue.push({
        shopifyOrderId,
        orderNumber,
        customerName,
        customerPhone: normalizedPhone,
        customerEmail: orderData.email || "",
        customerCity: shipping.city || "",
        customerAddress: [shipping.address1, shipping.address2].filter(Boolean).join(", "),
        totalPrice: parseFloat(orderData.total_price || "0"),
        tags,
      });
    }

    for (let i = 0; i < batchQueue.length; i += BATCH_SIZE) {
      const batch = batchQueue.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const order = await createOrder({
            shop: session.shop,
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
            const risk = await scorePhone(item.customerPhone, session.shop);
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