import prisma from "../db.server";

export interface CreateOrderData {
  shop: string;
  shopifyOrderId: string;
  orderNumber: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCity?: string;
  customerAddress?: string;
  customerNotes?: string;
  totalPrice: number;
  codAmount: number;
  tags?: string;
}

export interface UpdateOrderStatusData {
  status: string;
  notes?: string;
  changedBy?: string;
}

const ORDER_STATUSES = [
  "pending",
  "pending_confirmation",
  "confirmed",
  "processing",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export async function createOrder(data: CreateOrderData) {
  const order = await prisma.codOrder.create({
    data: {
      shop: data.shop,
      shopifyOrderId: data.shopifyOrderId,
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      customerCity: data.customerCity,
      customerAddress: data.customerAddress,
      customerNotes: data.customerNotes,
      totalPrice: data.totalPrice,
      codAmount: data.codAmount,
      status: "pending",
      tags: data.tags,
    },
  });

  await logStatusChange(order.id, null, "pending", "system", "Order created from Shopify");
  return order;
}

export async function getOrder(id: string) {
  return prisma.codOrder.findUnique({
    where: { id },
    include: {
      shipments: { orderBy: { createdAt: "desc" } },
      statusLogs: { orderBy: { createdAt: "desc" } },
      notifications: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getOrderByShopifyId(shopifyOrderId: string) {
  return prisma.codOrder.findUnique({
    where: { shopifyOrderId },
    include: { shipments: true },
  });
}

export async function getOrders(shop: string, filters?: {
  status?: string;
  search?: string;
  courier?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = { shop };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.search) {
    where.OR = [
      { orderNumber: { equals: parseInt(filters.search) || 0 } },
      { customerName: { contains: filters.search, mode: "insensitive" } },
      { customerPhone: { contains: filters.search } },
      { shopifyOrderId: { contains: filters.search } },
    ];
  }

  if (filters?.dateFrom) {
    where.createdAt = { ...where.createdAt, gte: new Date(filters.dateFrom) };
  }
  if (filters?.dateTo) {
    where.createdAt = { ...where.createdAt, lte: new Date(filters.dateTo) };
  }

  const [orders, total] = await Promise.all([
    prisma.codOrder.findMany({
      where,
      include: {
        shipments: true,
        _count: { select: { notifications: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.codOrder.count({ where }),
  ]);

  return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function updateOrderStatus(
  id: string,
  data: UpdateOrderStatusData
) {
  const order = await prisma.codOrder.findUnique({ where: { id } });
  if (!order) throw new Error("Order not found");

  const updateData: any = { status: data.status };

  switch (data.status) {
    case "confirmed":
      updateData.confirmedAt = new Date();
      break;
    case "delivered":
      updateData.deliveredAt = new Date();
      break;
    case "returned":
      updateData.returnedAt = new Date();
      if (data.notes) updateData.returnReason = data.notes;
      break;
    case "cancelled":
      updateData.cancelledAt = new Date();
      break;
  }

  const updated = await prisma.codOrder.update({
    where: { id },
    data: updateData,
  });

  await logStatusChange(
    id,
    order.status,
    data.status,
    data.changedBy || "system",
    data.notes
  );

  return updated;
}

async function logStatusChange(
  codOrderId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  notes?: string
) {
  return prisma.statusLog.create({
    data: {
      codOrderId,
      fromStatus,
      toStatus,
      changedBy,
      notes,
    },
  });
}

export async function getDashboardStats(shop: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalOrders, todayOrders, statusCounts, recentOrders] =
    await Promise.all([
      prisma.codOrder.count({ where: { shop } }),
      prisma.codOrder.count({
        where: { shop, createdAt: { gte: today } },
      }),
      prisma.codOrder.groupBy({
        by: ["status"],
        where: { shop },
        _count: true,
      }),
      prisma.codOrder.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { shipments: true },
      }),
    ]);

  const delivered = statusCounts.find((s) => s.status === "delivered");
  const returned = statusCounts.find((s) => s.status === "returned");
  const total = totalOrders || 1;
  const deliveredCount = delivered?._count || 0;
  const returnedCount = returned?._count || 0;

  return {
    totalOrders,
    todayOrders,
    deliveredCount,
    returnedCount,
    pendingCount: statusCounts.find((s) => s.status === "pending")?._count || 0,
    confirmedCount:
      statusCounts.find((s) => s.status === "confirmed")?._count || 0,
    rtoRate: Math.round((returnedCount / total) * 100),
    deliveryRate: Math.round((deliveredCount / total) * 100),
    recentOrders,
  };
}

export async function getOrdersForExport(
  shop: string,
  filters?: { status?: string; dateFrom?: string; dateTo?: string }
) {
  const where: any = { shop };

  if (filters?.status) where.status = filters.status;
  if (filters?.dateFrom) where.createdAt = { gte: new Date(filters.dateFrom) };
  if (filters?.dateTo) where.createdAt = { lte: new Date(filters.dateTo) };

  return prisma.codOrder.findMany({
    where,
    include: { shipments: true },
    orderBy: { createdAt: "desc" },
  });
}
