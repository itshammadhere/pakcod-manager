import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { Page, Card, DataTable, BlockStack, Text, InlineGrid, Box } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = url.searchParams.get("days") || "30";
  const response = await fetch(`${process.env.SHOPIFY_APP_URL}/api/analytics?days=${days}`, {
    headers: { Cookie: request.headers.get("Cookie") || "" },
  });
  return response.json();
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
