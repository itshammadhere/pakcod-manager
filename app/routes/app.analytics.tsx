import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { Page, Card, DataTable, BlockStack, Text, InlineGrid, Box } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");

  const since = new Date();
  since.setDate(since.getDate() - days);

  const orders = await prisma.codOrder.findMany({
    where: { shop: session.shop, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
  });

  const dailyMap: Record<string, { total: number; delivered: number; returned: number; codAmount: number }> = {};
  for (const order of orders) {
    const day = order.createdAt.toISOString().split("T")[0];
    if (!dailyMap[day]) dailyMap[day] = { total: 0, delivered: 0, returned: 0, codAmount: 0 };
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

  return {
    daily: Object.entries(dailyMap).map(([date, data]) => ({ date, ...data })),
    byCity: byCity.map((c) => ({ city: c.customerCity, orders: c._count, codAmount: c._sum.codAmount || 0 })),
    totals: {
      total: orders.length,
      delivered: orders.filter((o) => o.status === "delivered").length,
      returned: orders.filter((o) => o.status === "returned").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      pending: orders.filter((o) => o.status === "pending" || o.status === "pending_confirmation").length,
    },
  };
};

export default function AnalyticsPage() {
  const data = useLoaderData<any>();

  const totals = data.totals || { total: 0, delivered: 0, returned: 0, pending: 0, cancelled: 0 };
  const deliveryRate = totals.total > 0 ? Math.round((totals.delivered / totals.total) * 100) : 0;
  const rtoRate = totals.total > 0 ? Math.round((totals.returned / totals.total) * 100) : 0;

  const cityRows = (data.byCity || []).map((c: any) => [
    c.city,
    c.orders,
    `Rs. ${c.codAmount.toLocaleString()}`,
  ]);

  const dailyRows = (data.daily || []).slice(-14).map((d: any) => [
    d.date,
    d.total,
    d.delivered,
    d.returned,
    `Rs. ${d.codAmount.toLocaleString()}`,
  ]);

  return (
    <Page title="Analytics">
      <TitleBar title="Analytics" />
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <Text variant="headingXl" as="h2">{totals.total}</Text>
            <Text variant="headingSm" as="p" tone="subdued">Total Orders (30d)</Text>
          </Box>
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <Text variant="headingXl" as="h2">{deliveryRate}%</Text>
            <Text variant="headingSm" as="p" tone="subdued">Delivery Rate</Text>
          </Box>
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <Text variant="headingXl" as="h2">{rtoRate}%</Text>
            <Text variant="headingSm" as="p" tone="subdued">RTO Rate</Text>
          </Box>
        </InlineGrid>
        <Card>
          <Text variant="headingMd" as="h3">Orders by City</Text>
          <Box paddingBlockStart="400">
            <DataTable
              columnContentTypes={["text", "numeric", "numeric"]}
              headings={["City", "Orders", "COD Value"]}
              rows={cityRows}
            />
          </Box>
        </Card>
        <Card>
          <Text variant="headingMd" as="h3">Daily Orders (Last 14 Days)</Text>
          <Box paddingBlockStart="400">
            <DataTable
              columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric"]}
              headings={["Date", "Total", "Delivered", "Returned", "COD Amount"]}
              rows={dailyRows}
            />
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
