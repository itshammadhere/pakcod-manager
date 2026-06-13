// FIXED: Added CRON_SECRET authentication check. Only requests with
// Authorization: Bearer <CRON_SECRET> header can trigger this endpoint.
import prisma from "../db.server";

function verifyCronSecret(request: Request): boolean {
  const auth = request.headers.get("Authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export async function action({ request }: { request: Request }) {
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await prisma.codOrder.findMany({
      where: {
        status: { in: ["shipped", "in_transit", "out_for_delivery"] },
      },
      include: { shipments: true },
    });

    let updated = 0;

    for (const order of orders) {
      for (const shipment of order.shipments) {
        if (!shipment.trackingNumber) continue;

        try {
          const response = await fetch(
            `${process.env.SHOPIFY_APP_URL}/api/couriers/track`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.CRON_SECRET}`,
              },
              body: JSON.stringify({
                courier: shipment.courierName,
                tracking: shipment.trackingNumber,
                orderId: order.id,
              }),
            }
          );

          if (response.ok) {
            updated++;
          }
        } catch (err) {
          console.error(`Error tracking ${shipment.trackingNumber}:`, err);
        }
      }
    }

    return Response.json({
      success: true,
      checked: orders.length,
      updated,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Sync tracking error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
