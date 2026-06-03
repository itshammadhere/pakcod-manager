import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { bookShipment } from "../services/couriers";
import { getOrder } from "../models/order.server";

export async function action({ request }: { request: Request }) {
  try {
    const { session } = await authenticate.admin(request);
    const body = await request.json();
    const { orderId, courierName, weight } = body;

    if (!orderId || !courierName) {
      return Response.json({ success: false, error: "orderId and courierName required" }, { status: 400 });
    }

    const order = await getOrder(orderId);
    if (!order || order.shop !== session.shop) {
      return Response.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const config = await prisma.courierConfig.findFirst({
      where: { shop: session.shop, courierName, isActive: true },
    });

    const result = await bookShipment(courierName, {
      orderNumber: order.orderNumber,
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      customerAddress: order.customerAddress || "",
      customerCity: order.customerCity || "",
      codAmount: order.codAmount,
      weight: weight || undefined,
    }, config || {});

    if (result.success && result.trackingNumber) {
      await prisma.shipment.create({
        data: {
          codOrderId: order.id,
          courierName,
          trackingNumber: result.trackingNumber,
          status: "booked",
          weight: weight || null,
          bookedAt: new Date(),
        },
      });

      await prisma.codOrder.update({
        where: { id: order.id },
        data: { status: "shipped" },
      });

      await prisma.statusLog.create({
        data: {
          codOrderId: order.id,
          fromStatus: order.status,
          toStatus: "shipped",
          changedBy: (session as any).onlineAccessInfo?.email || "admin",
          notes: `Booked via ${courierName}, tracking: ${result.trackingNumber}`,
        },
      });
    }

    return Response.json({ success: result.success, trackingNumber: result.trackingNumber, error: result.error });
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
