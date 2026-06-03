import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { Page, Card, DataTable, BlockStack, InlineGrid, Text, Badge, Box } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getDashboardStats } from "../models/order.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getDashboardStats(session.shop);
};

export default function Dashboard() {
  const stats = useLoaderData<typeof loader>();

  return (
    <Page title="PakCOD Dashboard">
      <TitleBar title="PakCOD Dashboard" />
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <BlockStack gap="100">
              <Text variant="headingXl" as="h2">{stats.todayOrders}</Text>
              <Text variant="headingSm" as="p" tone="subdued">Today's Orders</Text>
            </BlockStack>
          </Box>
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <BlockStack gap="100">
              <Text variant="headingXl" as="h2">{stats.pendingCount}</Text>
              <Text variant="headingSm" as="p" tone="subdued">Pending Confirmation</Text>
            </BlockStack>
          </Box>
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <BlockStack gap="100">
              <Text variant="headingXl" as="h2">{stats.deliveryRate}%</Text>
              <Text variant="headingSm" as="p" tone="subdued">Delivery Rate</Text>
            </BlockStack>
          </Box>
          <Box padding="400" borderRadius="200" background="bg-surface-secondary">
            <BlockStack gap="100">
              <Text variant="headingXl" as="h2">{stats.rtoRate}%</Text>
              <Text variant="headingSm" as="p" tone="subdued">RTO Rate</Text>
            </BlockStack>
          </Box>
        </InlineGrid>

        <Card>
          <Text variant="headingMd" as="h3">Recent Orders</Text>
          <Box paddingBlockStart="400">
            <DataTable
              columnContentTypes={["text", "text", "numeric", "text", "text", "text"]}
              headings={["Order #", "Customer", "Amount", "Status", "Date", ""]}
              rows={stats.recentOrders.map((order) => [
                `#${order.orderNumber}`,
                order.customerName || "—",
                `PKR ${order.codAmount.toLocaleString()}`,
                <Badge tone={getStatusTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge>,
                new Date(order.createdAt).toLocaleDateString(),
                <Link to={`/app/orders/${order.id}`}>View</Link>,
              ])}
            />
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}

function getStatusTone(status: string): "success" | "critical" | "info" | "attention" | undefined {
  switch (status) {
    case "delivered": return "success";
    case "returned":
    case "cancelled": return "critical";
    case "confirmed": return "info";
    case "pending":
    case "pending_confirmation": return "attention";
    default: return undefined;
  }
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
