import { authenticate } from "../shopify.server";
import { getOrdersForExport } from "../models/order.server";

export async function loader({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const dateFrom = url.searchParams.get("dateFrom") || undefined;
  const dateTo = url.searchParams.get("dateTo") || undefined;

  const orders = await getOrdersForExport(session.shop, { status, dateFrom, dateTo });

  const headers = [
    "Order #", "Shopify Order ID", "Customer Name", "Customer Phone",
    "Customer City", "Customer Address", "Customer Notes",
    "Total Price", "COD Amount", "Status",
    "Courier", "Tracking #", "Weight", "Shipping Cost",
    "Order Date", "Confirmed Date", "Delivered Date", "Returned Date",
    "Return Reason", "Risk Score",
  ];

  const rows = orders.map((order) => [
    order.orderNumber,
    order.shopifyOrderId,
    order.customerName || "",
    order.customerPhone || "",
    order.customerCity || "",
    (order.customerAddress || "").replace(/,/g, ";"),
    (order.customerNotes || "").replace(/,/g, ";"),
    order.totalPrice,
    order.codAmount,
    order.status,
    order.shipments?.[0]?.courierName || "",
    order.shipments?.[0]?.trackingNumber || "",
    order.shipments?.[0]?.weight || "",
    order.shipments?.[0]?.shippingCost || "",
    new Date(order.createdAt).toISOString().split("T")[0],
    order.confirmedAt ? new Date(order.confirmedAt).toISOString().split("T")[0] : "",
    order.deliveredAt ? new Date(order.deliveredAt).toISOString().split("T")[0] : "",
    order.returnedAt ? new Date(order.returnedAt).toISOString().split("T")[0] : "",
    (order.returnReason || "").replace(/,/g, ";"),
    order.riskScore || "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const filename = `pakcod-orders-${new Date().toISOString().split("T")[0]}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
