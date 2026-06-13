// FIXED: (Fix 4) displayFulfillmentStatus compared with .toUpperCase() to handle API casing.
// FIXED: (Fix 5) All returns wrapped in Response.json() instead of plain objects.
// FIXED: (Fix 6) Orders processed in batches of 10 using Promise.allSettled to prevent timeout.
import { authenticate } from "../shopify.server";
import { createOrder, getOrderByShopifyId } from "../models/order.server";
import { scorePhone } from "../services/risk-scoring.server";
import prisma from "../db.server";

const BATCH_SIZE = 10;

export async function action({ request }: { request: Request }) {
  try {
    const { session, admin } = await authenticate.admin(request);

    const query = `{
      orders(first: 50, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            totalPriceSet { shopMoney { amount currencyCode } }
            shippingAddress {
              firstName
              lastName
              phone
              address1
              address2
              city
              province
              zip
              country
            }
            lineItems(first: 1) {
              edges {
                node {
                  title
                }
              }
            }
            customer {
              firstName
              lastName
              email
              phone
            }
          }
        }
      }
    }`;

    const response = await admin.graphql(query);
    const result = await response.json();
    const edges = result?.data?.orders?.edges || [];

    let imported = 0;
    let skipped = 0;
    let alreadyExists = 0;
    const errors: { orderId: string; message: string }[] = [];
    const importedOrders: string[] = [];

    // Build batch queue
    const batchQueue: {
      node: any;
      shopifyOrderId: string;
      normalizedPhone: string;
      fullName: string;
      orderNumber: number;
    }[] = [];

    for (const edge of edges) {
      const node = edge.node;
      const shopifyOrderId = node.id.replace("gid://shopify/Order/", "");
      const phone = node.shippingAddress?.phone || node.customer?.phone || "";
      const normalizedPhone = phone.replace(/[^0-9]/g, "");

      const existing = await getOrderByShopifyId(shopifyOrderId);
      if (existing) {
        alreadyExists++;
        continue;
      }

      const shippingAddress = node.shippingAddress;
      const fullName = `${shippingAddress?.firstName || ""} ${shippingAddress?.lastName || ""}`.trim()
        || `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim();
      const orderNumber = parseInt(node.name.replace("#", "")) || 0;

      batchQueue.push({ node, shopifyOrderId, normalizedPhone, fullName, orderNumber });
    }

    // Process in batches
    for (let i = 0; i < batchQueue.length; i += BATCH_SIZE) {
      const batch = batchQueue.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async ({ node, shopifyOrderId, normalizedPhone, fullName, orderNumber }) => {
          const shippingAddress = node.shippingAddress;

          const order = await createOrder({
            shop: session.shop,
            shopifyOrderId,
            orderNumber,
            customerName: fullName || "Customer",
            customerPhone: normalizedPhone,
            customerEmail: node.customer?.email || "",
            customerCity: shippingAddress?.city || "",
            customerAddress: [shippingAddress?.address1, shippingAddress?.address2].filter(Boolean).join(", "),
            totalPrice: parseFloat(node.totalPriceSet?.shopMoney?.amount || "0"),
            codAmount: parseFloat(node.totalPriceSet?.shopMoney?.amount || "0"),
            tags: (node.tags || []).join(","),
          });

          if (normalizedPhone) {
            const risk = await scorePhone(normalizedPhone, session.shop);
            await prisma.codOrder.update({
              where: { id: order.id },
              data: { riskScore: risk.level },
            });
          }

          const fulfillmentStatus = (node.displayFulfillmentStatus || "").toUpperCase();
          if (fulfillmentStatus === "FULFILLED" || fulfillmentStatus === "PARTIAL") {
            const { updateOrderStatus } = await import("../models/order.server");
            if (fulfillmentStatus === "FULFILLED") {
              await updateOrderStatus(order.id, {
                status: "delivered",
                notes: "Synced from Shopify - already fulfilled",
                changedBy: "sync",
              });
            }
          }

          return { orderNumber };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          imported++;
          importedOrders.push(`#${result.value.orderNumber}`);
        } else {
          skipped++;
          errors.push({ orderId: "unknown", message: result.reason?.message || "Unknown error" });
        }
      }
    }

    return Response.json({
      success: true,
      imported,
      skipped,
      alreadyExists,
      total: edges.length,
      errors,
      importedOrders,
    });
  } catch (error: any) {
    console.error("Sync orders error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function loader() {
  return Response.json({ message: "Use POST to sync orders" });
}
