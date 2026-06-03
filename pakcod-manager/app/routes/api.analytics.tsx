import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30");

  const since = new Date();
  since.setDate(since.getDate() - days);

  const orders = await prisma.codOrder.findMany({
    where: {
      shop: session.shop,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
  });

  const dailyMap: Record<string, { total: number; delivered: number; returned: number; codAmount: number }> = {};

  for (const order of orders) {
    const day = order.createdAt.toISOString().split("T")[0];
    if (!dailyMap[day]) {
      dailyMap[day] = { total: 0, delivered: 0, returned: 0, codAmount: 0 };
    }
    dailyMap[day].total++;
    dailyMap[day].codAmount += order.codAmount;
    if (order.status === "delivered") dailyMap[day].delivered++;
    if (order.status === "returned") dailyMap[day].returned++;
  }

  const byCity = await prisma.codOrder.groupBy({
    by: ["customerCity"],
    where: { shop: session.shop, customerCity: { not: null } },
    _count: true,
    _sum: { codAmount: true },
    orderBy: { _count: { customerCity: "desc" } },
    take: 10,
  });

  return Response.json({
    daily: Object.entries(dailyMap).map(([date, data]) => ({ date, ...data })),
    byCity: byCity.map((c) => ({
      city: c.customerCity,
      orders: c._count,
      codAmount: c._sum.codAmount || 0,
    })),
    totals: {
      total: orders.length,
      delivered: orders.filter((o) => o.status === "delivered").length,
      returned: orders.filter((o) => o.status === "returned").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      pending: orders.filter((o) => o.status === "pending" || o.status === "pending_confirmation").length,
    },
  });
}
