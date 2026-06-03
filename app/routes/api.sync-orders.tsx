import { authenticate } from "../shopify.server";
import { createOrder, getOrderByShopifyId } from "../models/order.server";
import { scorePhone } from "../services/risk-scoring.server";
import prisma from "../db.server";

export async function action({ request }: { request: Request }) {
  try {
    const { session, admin } = await authenticate.admin(request);

    const query = `{
      orders(first: 50, reverse: true) {
        edges {
          node {
            id
            orderNumber
            name
            createdAt
            financialStatus
            fulfillmentStatus
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
    const importedOrders: any[] = [];

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

      try {
        const order = await createOrder({
          shop: session.shop,
          shopifyOrderId,
          orderNumber: node.orderNumber,
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

        if (node.fulfillmentStatus === "fulfilled" || node.fulfillmentStatus === "partial") {
          const { updateOrderStatus } = await import("../models/order.server");
          if (node.fulfillmentStatus === "fulfilled") {
            await updateOrderStatus(order.id, {
              status: "delivered",
              notes: "Synced from Shopify - already fulfilled",
              changedBy: "sync",
            });
          }
        }

        imported++;
        importedOrders.push(`#${order.orderNumber}`);
      } catch (err: any) {
        console.error(`Sync error for order ${node.orderNumber}:`, err);
        skipped++;
      }
    }

    return {
      success: true,
      imported,
      skipped,
      alreadyExists,
      total: edges.length,
      importedOrders,
    };
  } catch (error: any) {
    console.error("Sync orders error:", error);
    return { success: false, error: error.message };
  }
}

export async function loader() {
  return { message: "Use POST to sync orders" };
}
