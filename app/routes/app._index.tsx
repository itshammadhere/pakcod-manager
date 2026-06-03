import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { Page, Card, BlockStack, Text, InlineGrid, Box, InlineStack, Badge, Button, Banner } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalOrders, todayOrders, pendingOrders, recentOrders, stats] = await Promise.all([
    prisma.codOrder.count({ where: { shop } }),
    prisma.codOrder.count({ where: { shop, createdAt: { gte: today } } }),
    prisma.codOrder.count({ where: { shop, status: { in: ["pending", "pending_confirmation"] } } }),
    prisma.codOrder.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { shipments: { take: 1 } },
    }),
    prisma.codOrder.groupBy({
      by: ["status"],
      where: { shop },
      _count: true,
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of stats) statusMap[s.status] = s._count;
  const delivered30 = await prisma.codOrder.count({ where: { shop, status: "delivered", createdAt: { gte: thirtyDaysAgo } } });
  const total30 = await prisma.codOrder.count({ where: { shop, createdAt: { gte: thirtyDaysAgo } } });

  return { totalOrders, todayOrders, pendingOrders, recentOrders, statusMap, deliveryRate30: total30 > 0 ? Math.round((delivered30 / total30) * 100) : 0 };
};

function statusBadge(status: string) {
  const tones: Record<string, "success" | "critical" | "info" | "attention" | undefined> = {
    delivered: "success", returned: "critical", cancelled: "critical",
    pending: "attention", pending_confirmation: "attention",
    confirmed: "info", processing: "info", shipped: "info",
    in_transit: "info", out_for_delivery: "info",
  };
  return <Badge tone={tones[status]}>{status.replaceAll("_", " ")}</Badge>;
}

export default function DashboardPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page title="Dashboard">
      <TitleBar title="Dashboard" />
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <Text variant="headingXs" as="p" tone="subdued">Total Orders</Text>
            <Text variant="heading2xl" as="p" fontWeight="bold">{data.totalOrders}</Text>
          </Box>
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <Text variant="headingXs" as="p" tone="subdued">Today</Text>
            <Text variant="heading2xl" as="p" fontWeight="bold">{data.todayOrders}</Text>
          </Box>
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <Text variant="headingXs" as="p" tone="subdued">Pending</Text>
            <Text variant="heading2xl" as="p" fontWeight="bold">{data.pendingOrders}</Text>
          </Box>
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <Text variant="headingXs" as="p" tone="subdued">Delivery Rate (30d)</Text>
            <Text variant="heading2xl" as="p" fontWeight="bold" tone="success">{data.deliveryRate30}%</Text>
          </Box>
        </InlineGrid>

        {data.pendingOrders > 0 && (
          <Banner tone="warning" action={{ content: "View Orders", onAction: () => navigate("/app/orders") }}>
            {data.pendingOrders} order{data.pendingOrders > 1 ? "s" : ""} pending confirmation
          </Banner>
        )}

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <Text variant="headingMd" as="h3">Recent Orders</Text>
            <Box paddingBlockStart="300">
              <BlockStack gap="200">
                {data.recentOrders.length > 0 ? data.recentOrders.map((order) => (
                  <div key={order.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/app/orders/${order.id}`)}>
                    <Box padding="300" borderRadius="200" background="bg-surface-secondary">
                    <InlineStack gap="200" align="space-between" wrap>
                      <InlineStack gap="200">
                        <Text fontWeight="bold" as="span">#{order.orderNumber}</Text>
                        <Text as="span" tone="subdued">{order.customerName || "—"}</Text>
                      </InlineStack>
                      <InlineStack gap="200">
                        {statusBadge(order.status)}
                        <Text as="span" tone="subdued" variant="bodySm">Rs. {order.codAmount.toLocaleString()}</Text>
                      </InlineStack>
                    </InlineStack>
                  </Box>
                  </div>
                )) : (
                  <Text as="p" tone="subdued" alignment="center">No orders yet. Orders will appear here automatically when customers place COD orders.</Text>
                )}
              </BlockStack>
            </Box>
            {data.recentOrders.length > 0 && (
              <Box paddingBlockStart="300">
                <Button onClick={() => navigate("/app/orders")}>View All Orders</Button>
              </Box>
            )}
          </Card>

          <Card>
            <Text variant="headingMd" as="h3">Quick Actions</Text>
            <Box paddingBlockStart="300">
              <BlockStack gap="300">
                <Button onClick={() => navigate("/app/settings")}>Configure WhatsApp</Button>
                <Button onClick={() => navigate("/app/rules")}>Manage COD Rules</Button>
                <Button onClick={() => navigate("/app/blacklist")}>Phone Blacklist</Button>
                <Button onClick={() => navigate("/app/analytics")}>View Analytics</Button>
              </BlockStack>
            </Box>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
