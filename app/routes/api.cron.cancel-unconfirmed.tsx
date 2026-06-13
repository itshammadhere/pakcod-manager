// FIXED: Added CRON_SECRET authentication check. Only requests with
// Authorization: Bearer <CRON_SECRET> header can trigger this endpoint.
import prisma from "../db.server";
import { updateOrderStatus } from "../models/order.server";

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
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const unconfirmedOrders = await prisma.codOrder.findMany({
      where: {
        status: "pending_confirmation",
        createdAt: { lte: twentyFourHoursAgo },
      },
    });

    let cancelled = 0;
    let riskyCancelled = 0;

    for (const order of unconfirmedOrders) {
      await updateOrderStatus(order.id, {
        status: "cancelled",
        notes: "Auto-cancelled - no WhatsApp confirmation within 24 hours",
        changedBy: "system",
      });
      cancelled++;
    }

    const riskyPending = await prisma.codOrder.findMany({
      where: {
        status: { in: ["pending", "pending_confirmation", "confirmed"] },
        riskScore: "risky",
        createdAt: { lte: twentyFourHoursAgo },
      },
    });

    for (const order of riskyPending) {
      await updateOrderStatus(order.id, {
        status: "cancelled",
        notes: "Auto-cancelled - high-risk order (phone flagged as risky)",
        changedBy: "system",
      });
      riskyCancelled++;
    }

    return Response.json({
      success: true,
      cancelled,
      riskyCancelled,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Cancel unconfirmed error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
