import prisma from "../db.server";
import { normalizePhone } from "./phone.server";

export type RiskLevel = "trusted" | "neutral" | "risky";

interface RiskResult {
  level: RiskLevel;
  reason: string;
  history: {
    total: number;
    delivered: number;
    returned: number;
    cancelled: number;
    pending: number;
  };
}

export async function scorePhone(
  phone: string | null | undefined,
  shop: string
): Promise<RiskResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return {
      level: "neutral",
      reason: "No valid phone number provided",
      history: { total: 0, delivered: 0, returned: 0, cancelled: 0, pending: 0 },
    };
  }

  const isBlacklisted = await prisma.phoneBlacklist.findUnique({
    where: { shop_phoneNumber: { shop, phoneNumber: normalized } },
  });

  if (isBlacklisted) {
    const history = await getPhoneHistory(normalized, shop);
    return { level: "risky", reason: `Phone is blacklisted: ${isBlacklisted.reason || "No reason"}`, history };
  }

  const history = await getPhoneHistory(normalized, shop);

  if (history.total === 0) {
    return { level: "neutral", reason: "New phone number, no order history", history };
  }

  const deliveryRate = history.total > 0 ? history.delivered / history.total : 0;

  if (history.returned >= 3) {
    return { level: "risky", reason: `${history.returned} returned orders from this phone`, history };
  }

  if (deliveryRate < 0.4 && history.total >= 2) {
    return { level: "risky", reason: `Low delivery rate (${Math.round(deliveryRate * 100)}%)`, history };
  }

  if (history.pending >= 3 && history.delivered === 0) {
    return { level: "risky", reason: `${history.pending} pending orders, none delivered`, history };
  }

  if (deliveryRate >= 0.8 && history.total >= 3) {
    return { level: "trusted", reason: `${history.delivered}/${history.total} orders delivered`, history };
  }

  return { level: "neutral", reason: `${history.delivered}/${history.total} orders delivered`, history };
}

export async function getPhoneHistory(phone: string, shop: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { total: 0, delivered: 0, returned: 0, cancelled: 0, pending: 0 };

  const orders = await prisma.codOrder.findMany({
    where: { shop, customerPhone: { contains: normalized.slice(-10) } },
    select: { status: true },
  });

  return {
    total: orders.length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    returned: orders.filter((o) => o.status === "returned").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
    pending: orders.filter((o) => ["pending", "pending_confirmation"].includes(o.status)).length,
  };
}

export async function getOrdersByPhone(phone: string, shop: string, excludeId?: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];

  return prisma.codOrder.findMany({
    where: {
      shop,
      customerPhone: { contains: normalized.slice(-10) },
      id: excludeId ? { not: excludeId } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function assignRiskScore(orderId: string, shop: string) {
  const order = await prisma.codOrder.findUnique({ where: { id: orderId } });
  if (!order || !order.customerPhone) return null;

  const result = await scorePhone(order.customerPhone, shop);
  await prisma.codOrder.update({
    where: { id: orderId },
    data: { riskScore: result.level },
  });

  return result;
}
