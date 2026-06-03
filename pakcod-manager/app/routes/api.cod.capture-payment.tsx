import { authenticate } from "../shopify.server";
import { getOrderByShopifyId, updateOrderStatus } from "../models/order.server";

export async function action({ request }: { request: Request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const body = await request.json();
    const { shopifyOrderId } = body;

    if (!shopifyOrderId) {
      return Response.json({ success: false, error: "shopifyOrderId required" }, { status: 400 });
    }

    const order = await getOrderByShopifyId(shopifyOrderId);
    if (!order) {
      return Response.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const gid = `gid://shopify/Order/${shopifyOrderId}`;

    await admin.graphql(
      `#graphql
      mutation {
        orderMarkAsPaid(input: {
          id: "${gid}"
        }) {
          order {
            id
            displayFinancialStatus
          }
          userErrors {
            field
            message
          }
        }
      }`
    );

    await updateOrderStatus(order.id, {
      status: "delivered",
      notes: "COD payment auto-captured on delivery",
      changedBy: "system",
    });

    return Response.json({
      success: true,
      orderId: order.id,
      shopifyOrderId,
    });
  } catch (error: any) {
    console.error("COD payment capture error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
