import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useSearchParams } from "react-router";
import { useState } from "react";
import { Page, Card, DataTable, Text, Badge, TextField, Select, Button, BlockStack, InlineStack, Box, InlineGrid } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrders } from "../models/order.server";
import prisma from "../db.server";

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

  const [cities, ordersData] = await Promise.all([
    prisma.codOrder.findMany({
      where: { shop: session.shop, customerCity: { not: null } },
      select: { customerCity: true },
      distinct: ["customerCity"],
      orderBy: { customerCity: "asc" },
    }),
    getOrders(session.shop, {
      status: url.searchParams.get("status") || undefined,
      search: url.searchParams.get("search") || undefined,
      courier: url.searchParams.get("courier") || undefined,
      city: url.searchParams.get("city") || undefined,
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      page: parseInt(url.searchParams.get("page") || "1"),
      limit: 25,
    }),
  ]);

  return {
    ...ordersData,
    cities: cities.map((c) => c.customerCity).filter(Boolean),
    currentFilters: {
      status: url.searchParams.get("status") || "",
      search: url.searchParams.get("search") || "",
      city: url.searchParams.get("city") || "",
      dateFrom: url.searchParams.get("dateFrom") || "",
      dateTo: url.searchParams.get("dateTo") || "",
    },
  };
};

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

export default function OrdersPage() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(data.currentFilters.search);
  const [statusFilter, setStatusFilter] = useState(data.currentFilters.status);
  const [cityFilter, setCityFilter] = useState(data.currentFilters.city);
  const [dateFrom, setDateFrom] = useState(data.currentFilters.dateFrom);
  const [dateTo, setDateTo] = useState(data.currentFilters.dateTo);

  function applyFilters() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (cityFilter) params.set("city", cityFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    submit(params.toString(), { method: "GET" });
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setCityFilter("");
    setDateFrom("");
    setDateTo("");
    submit("", { method: "GET" });
  }

  const hasFilters = search || statusFilter || cityFilter || dateFrom || dateTo;

  return (
    <Page title="COD Orders">
      <TitleBar title="COD Orders" />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
              <TextField
                label="Search"
                autoComplete="off"
                placeholder="Name, phone, order #"
                value={search}
                onChange={(v) => setSearch(v)}
              />
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
              />
              <Select
                label="City"
                options={[{ label: "All Cities", value: "" }, ...data.cities.map((c) => ({ label: c, value: c }))]}
                value={cityFilter}
                onChange={(v) => setCityFilter(v)}
              />
            </InlineGrid>
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
              <TextField
                label="Date From"
                type="date"
                autoComplete="off"
                value={dateFrom}
                onChange={(v) => setDateFrom(v)}
              />
              <TextField
                label="Date To"
                type="date"
                autoComplete="off"
                value={dateTo}
                onChange={(v) => setDateTo(v)}
              />
              <Box paddingBlockStart="200">
                <InlineStack gap="200">
                  <Button onClick={applyFilters}>Apply Filters</Button>
                  {hasFilters && <Button onClick={clearFilters} variant="plain">Clear</Button>}
                </InlineStack>
              </Box>
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack gap="200" align="space-between">
              <Text variant="headingMd" as="h3">
                {data.total} order{data.total !== 1 ? "s" : ""}
                {hasFilters ? " (filtered)" : ""}
              </Text>
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  url={`/api/orders/export?${searchParams.toString()}`}
                  external
                >
                  Download CSV
                </Button>
              </InlineStack>
            </InlineStack>
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
                <a href={`/app/orders/${order.id}`} style={{ color: "#2c6ecb" }}>View</a>,
              ]) : [[
                <Text as="p" tone="subdued">No orders found. COD orders from your store will appear here automatically.</Text>,
              ]]}
            />
          </BlockStack>
        </Card>

        {data.totalPages > 1 && (
          <InlineStack gap="400" align="center">
            {data.page > 1 && (
              <a href={`/app/orders?page=${data.page - 1}&${searchParams.toString()}`}>Previous</a>
            )}
            <Text as="p" tone="subdued">Page {data.page} of {data.totalPages}</Text>
            {data.page < data.totalPages && (
              <a href={`/app/orders?page=${data.page + 1}&${searchParams.toString()}`}>Next</a>
            )}
          </InlineStack>
        )}
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
