import prisma from "../db.server";

export async function getStore(shop: string) {
  let store = await prisma.store.findUnique({ where: { shop } });

  if (!store) {
    store = await prisma.store.create({
      data: { shop },
    });
  }

  return store;
}

export async function updateStore(
  shop: string,
  data: {
    whatsappPhone?: string;
    whatsappToken?: string;
    defaultCourier?: string;
    timezone?: string;
  }
) {
  return prisma.store.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
}

export async function getWhatsAppConfig(shop: string) {
  const store = await getStore(shop);
  if (!store.whatsappToken || !store.whatsappPhone) {
    return null;
  }
  return {
    phoneNumberId: store.whatsappPhone,
    token: store.whatsappToken,
  };
}
