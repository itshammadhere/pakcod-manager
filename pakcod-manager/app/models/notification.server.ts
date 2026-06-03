import prisma from "../db.server";

export async function createNotification(data: {
  codOrderId: string;
  channel: string;
  template: string;
  recipient: string;
  message?: string;
}) {
  return prisma.notification.create({ data });
}

export async function updateNotificationStatus(
  id: string,
  status: string,
  extras?: { sentAt?: Date; deliveredAt?: Date; failedAt?: Date; error?: string }
) {
  return prisma.notification.update({ where: { id }, data: { status, ...extras } });
}

export async function getNotificationsForOrder(codOrderId: string) {
  return prisma.notification.findMany({
    where: { codOrderId },
    orderBy: { createdAt: "desc" },
  });
}
