import prisma from "../db.server";

export async function action() {
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
              headers: { "Content-Type": "application/json" },
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
