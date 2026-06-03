import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, Link } from "react-router";
import { useState } from "react";
import { Page, Card, DataTable, Text, Badge, TextField, Select, Button, BlockStack, InlineStack, Box } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrders } from "../models/order.server";

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Pending Confirmation", value: "pending_confirmation" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "In Transit", value: "in_transit" },
  { label: "Out for Delivery", value: "out_for_delivery" },
  { label: "Delivered", value: "delivered" },
  { label: "Returned", value: "returned" },
  { label: "Cancelled", value: "cancelled" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  return getOrders(session.shop, {
    status: url.searchParams.get("status") || undefined,
    search: url.searchParams.get("search") || undefined,
    dateFrom: url.searchParams.get("dateFrom") || undefined,
    dateTo: url.searchParams.get("dateTo") || undefined,
    page: parseInt(url.searchParams.get("page") || "1"),
    limit: 20,
  });
};

export default function OrdersPage() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  function applyFilters() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    submit(params.toString(), { method: "GET" });
  }

  return (
    <Page title="COD Orders">
      <TitleBar title="COD Orders" />
      <BlockStack gap="500">
        <Card>
          <InlineStack gap="400" wrap={false}>
            <Box width="100%">
              <TextField
                label="Search"
                autoComplete="off"
                placeholder="Search by name, phone, order #"
                value={search}
                onChange={(v) => setSearch(v)}
              />
            </Box>
            <Box width="100%">
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
              />
            </Box>
            <Box paddingBlockStart="200">
              <Button onClick={applyFilters}>Filter</Button>
            </Box>
          </InlineStack>
        </Card>

        <Card>
          <DataTable
            columnContentTypes={["text", "text", "text", "text", "numeric", "text", "text", "text", "text"]}
            headings={["Order #", "Customer", "Phone", "City", "Amount", "Status", "Courier", "Date", ""]}
            rows={data.orders.length > 0 ? data.orders.map((order) => [
              `#${order.orderNumber}`,
              order.customerName || "—",
              order.customerPhone || "—",
              order.customerCity || "—",
              `PKR ${order.codAmount.toLocaleString()}`,
              <Badge tone={getStatusTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge>,
              order.shipments[0]?.courierName || "—",
              new Date(order.createdAt).toLocaleDateString(),
              <Link to={`/app/orders/${order.id}`}>View</Link>,
            ]) : [[
              <Text as="p" tone="subdued">No orders found matching your filters.</Text>,
            ]]}
          />
        </Card>

        {data.totalPages > 1 && (
          <InlineStack gap="400" align="center">
            {data.page > 1 && (
              <Link
                to={`/app/orders?page=${data.page - 1}&status=${statusFilter}&search=${search}`}
              >
                Previous
              </Link>
            )}
            <Text as="p" tone="subdued">Page {data.page} of {data.totalPages}</Text>
            {data.page < data.totalPages && (
              <Link
                to={`/app/orders?page=${data.page + 1}&status=${statusFilter}&search=${search}`}
              >
                Next
              </Link>
            )}
          </InlineStack>
        )}
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
