import prisma from "../db.server";
import { trackShipment } from "../services/couriers";

export async function action({ request }: { request: Request }) {
  try {
    const body = await request.json();
    const { courier, tracking, orderId } = body;

    if (!courier || !tracking) {
      return Response.json({ success: false, error: "courier and tracking required" }, { status: 400 });
    }

    const config = await prisma.courierConfig.findFirst({
      where: { courierName: courier, isActive: true },
    });

    if (!config) {
      return Response.json({ success: false, error: `No active config for ${courier}` }, { status: 404 });
    }

    const result = await trackShipment(courier, tracking, config);

    if (!result) {
      return Response.json({ success: false, error: "Tracking failed" }, { status: 500 });
    }

    if (orderId) {
      await prisma.statusLog.create({
        data: {
          codOrderId: orderId,
          fromStatus: null,
          toStatus: result.status,
          changedBy: "system",
          notes: `Courier update: ${result.rawStatus || result.status} (${courier}: ${tracking})`,
        },
      });
    }

    return Response.json({ success: true, tracking: result });
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
