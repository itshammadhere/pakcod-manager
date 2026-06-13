// Uses Shopify Admin GraphQL API with full order data.
// Requires the app to complete Protected Customer Data assessment
// in the Shopify Partners dashboard (see error handling below).
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
    const body = await response.text();

    let result: any;
    try {
      result = JSON.parse(body);
    } catch {
      return Response.json({ success: false, error: `GraphQL returned non-JSON: ${body.substring(0, 500)}` }, { status: 500 });
    }

    if (result.errors) {
      const errorMsg = result.errors.map((e: any) => e.message).join(", ");
      if (errorMsg.toLowerCase().includes("protected customer data") || errorMsg.toLowerCase().includes("not approved")) {
        return Response.json({
          success: false,
          error: "Shopify requires Protected Customer Data approval. Go to your Shopify Partners dashboard → Apps → PakCOD Manager → Configuration → Protected Customer Data → fill the form and save. It's instant for development stores.",
          protectedDataError: true,
          detail: errorMsg,
        }, { status: 403 });
      }
      return Response.json({
        success: false,
        error: `GraphQL error: ${errorMsg}`,
      }, { status: 500 });
    }

    const edges = result?.data?.orders?.edges || [];

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

    for (const edge of edges) {
      const node = edge.node;
      const shopifyOrderId = node.id.replace("gid://shopify/Order/", "");
      const phone = node.shippingAddress?.phone || node.customer?.phone || "";
      const normalizedPhone = phone.replace(/[^0-9]/g, "");
      const orderNumber = parseInt(node.name.replace("#", "")) || 0;

      const existing = await getOrderByShopifyId(shopifyOrderId);
      if (existing) {
        alreadyExists++;
        continue;
      }

      const shippingAddress = node.shippingAddress;
      const fullName = `${shippingAddress?.firstName || ""} ${shippingAddress?.lastName || ""}`.trim()
        || `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim();

      let tags = "";
      if (Array.isArray(node.tags)) {
        tags = node.tags.join(",");
      } else if (typeof node.tags === "string") {
        tags = node.tags;
      }

      batchQueue.push({
        shopifyOrderId,
        orderNumber,
        customerName: fullName || `Order #${orderNumber}`,
        customerPhone: normalizedPhone,
        customerEmail: node.customer?.email || "",
        customerCity: shippingAddress?.city || "",
        customerAddress: [shippingAddress?.address1, shippingAddress?.address2].filter(Boolean).join(", "),
        totalPrice: parseFloat(node.totalPriceSet?.shopMoney?.amount || "0"),
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
      total: edges.length,
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