import prisma from "../db.server";

export async function addToBlacklist(
  shop: string,
  phoneNumber: string,
  reason?: string,
  addedBy?: string
) {
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  return prisma.phoneBlacklist.create({
    data: {
      shop,
      phoneNumber: normalized,
      reason,
      addedBy: addedBy || "manual",
    },
  });
}

export async function removeFromBlacklist(shop: string, phoneNumber: string) {
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  return prisma.phoneBlacklist.deleteMany({
    where: { shop, phoneNumber: normalized },
  });
}

export async function isBlacklisted(shop: string, phoneNumber: string) {
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  const entry = await prisma.phoneBlacklist.findUnique({
    where: { shop_phoneNumber: { shop, phoneNumber: normalized } },
  });
  return !!entry;
}

export async function getBlacklist(shop: string) {
  return prisma.phoneBlacklist.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}
