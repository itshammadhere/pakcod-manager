import prisma from "../db.server";

export interface CreateRuleData {
  shop: string;
  ruleType: string;
  operator: string;
  value: string;
  action: string;
}

export async function createRule(data: CreateRuleData) {
  return prisma.codRule.create({ data });
}

export async function updateRule(
  id: string,
  data: { ruleType?: string; operator?: string; value?: string; action?: string; isActive?: boolean }
) {
  return prisma.codRule.update({ where: { id }, data });
}

export async function deleteRule(id: string) {
  return prisma.codRule.delete({ where: { id } });
}

export async function getRules(shop: string) {
  return prisma.codRule.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

export async function checkRules(
  shop: string,
  orderData: {
    totalPrice: number;
    customerPhone?: string;
    customerCity?: string;
  }
): Promise<{ blocked: boolean; reason?: string }> {
  const rules = await prisma.codRule.findMany({
    where: { shop, isActive: true },
  });

  for (const rule of rules) {
    const value = rule.value;
    const operator = rule.operator;

    switch (rule.ruleType) {
      case "max_value":
        if (operator === "gt" && orderData.totalPrice > parseFloat(value)) {
          return { blocked: true, reason: `Order exceeds maximum COD value of PKR ${value}` };
        }
        break;

      case "min_value":
        if (operator === "lt" && orderData.totalPrice < parseFloat(value)) {
          return { blocked: true, reason: `Order below minimum COD value of PKR ${value}` };
        }
        break;

      case "city":
        if (
          orderData.customerCity?.toLowerCase() === value.toLowerCase()
        ) {
          return { blocked: true, reason: `COD not available for ${value}` };
        }
        break;

      case "phone_prefix":
        if (orderData.customerPhone?.startsWith(value)) {
          return { blocked: true, reason: `Phone prefix ${value} is blocked` };
        }
        break;
    }
  }

  return { blocked: false };
}
