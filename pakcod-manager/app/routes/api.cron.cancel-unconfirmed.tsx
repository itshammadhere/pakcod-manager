import prisma from "../db.server";
import { updateOrderStatus } from "../models/order.server";

export async function action() {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const unconfirmedOrders = await prisma.codOrder.findMany({
      where: {
        status: "pending_confirmation",
        createdAt: { lte: twentyFourHoursAgo },
      },
    });

    let cancelled = 0;

    for (const order of unconfirmedOrders) {
      await updateOrderStatus(order.id, {
        status: "cancelled",
        notes: "Auto-cancelled - no WhatsApp confirmation within 24 hours",
        changedBy: "system",
      });
      cancelled++;
    }

    return Response.json({
      success: true,
      cancelled,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Cancel unconfirmed error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
