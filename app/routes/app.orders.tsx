import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useSearchParams } from "react-router";
import { useState } from "react";
import { Page, Card, DataTable, Text, Badge, TextField, Select, Button, Banner, BlockStack, InlineStack, Box, InlineGrid } from "@shopify/polaris";
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

  const [cities, store, ordersData] = await Promise.all([
    prisma.codOrder.findMany({
      where: { shop: session.shop, customerCity: { not: null } },
      select: { customerCity: true },
      distinct: ["customerCity"],
      orderBy: { customerCity: "asc" },
    }),
    prisma.store.findUnique({ where: { shop: session.shop }, select: { googleSheetId: true } }),
    getOrders(session.shop, {
      status: url.searchParams.get("status") || undefined,
      search: url.searchParams.get("search") || undefined,
      courier: url.searchParams.get("courier") || undefined,
      city: url.searchParams.get("city") || undefined,
      riskScore: url.searchParams.get("riskScore") || undefined,
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      page: parseInt(url.searchParams.get("page") || "1"),
      limit: 25,
    }),
  ]);

  return {
    ...ordersData,
    cities: cities.map((c) => c.customerCity).filter(Boolean),
    googleSheetId: store?.googleSheetId,
    hasGoogleCreds: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
    currentFilters: {
      status: url.searchParams.get("status") || "",
      search: url.searchParams.get("search") || "",
      city: url.searchParams.get("city") || "",
      riskScore: url.searchParams.get("riskScore") || "",
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
  const [riskFilter, setRiskFilter] = useState(data.currentFilters.riskScore);
  const [dateFrom, setDateFrom] = useState(data.currentFilters.dateFrom);
  const [dateTo, setDateTo] = useState(data.currentFilters.dateTo);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ success: boolean; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ success: boolean; text: string } | null>(null);

  function applyFilters() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (cityFilter) params.set("city", cityFilter);
    if (riskFilter) params.set("riskScore", riskFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    submit(params.toString(), { method: "GET" });
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setCityFilter("");
    setRiskFilter("");
    setDateFrom("");
    setDateTo("");
    submit("", { method: "GET" });
  }

  async function exportToSheets() {
    if (!data.googleSheetId) {
      setExportMsg({ success: false, text: "No Google Sheet configured. Go to Settings to set it up." });
      return;
    }
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch("/api/orders/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: data.googleSheetId,
          status: statusFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setExportMsg({ success: true, text: `${result.exported} orders exported to Google Sheets!` });
      } else {
        setExportMsg({ success: false, text: result.error });
      }
    } catch {
      setExportMsg({ success: false, text: "Export failed. Check your Google Sheets configuration." });
    }
    setExporting(false);
  }

  async function syncFromShopify() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync-orders", { method: "POST" });
      const result = await res.json();
      if (result.success) {
        const debug = result.debug ? ` [API:${result.debug.apiStatus} shop:${result.debug.shop} keys:${result.debug.rawKeys?.join(",")}]` : "";
        setSyncMsg({
          success: true,
          text: `Synced ${result.imported} new orders from Shopify (${result.alreadyExists} already existed). Total from API: ${result.total}.${debug} ${result.importedOrders?.length > 0 ? "Imported: " + result.importedOrders.join(", ") : ""}`,
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const debug = result.debug ? ` [Raw: ${result.debug.rawPreview}]` : "";
        setSyncMsg({ success: false, text: (result.error || "Sync failed") + debug });
      }
    } catch {
      setSyncMsg({ success: false, text: "Sync failed. Check your connection." });
    }
    setSyncing(false);
  }

  const hasFilters = search || statusFilter || cityFilter || riskFilter || dateFrom || dateTo;

  return (
    <Page title="COD Orders">
      <TitleBar title="COD Orders" />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <TextField
                label="Search"
                autoComplete="off"
                placeholder="Name, phone, order #"
                value={search}
                onChange={(v) => setSearch(v)}
              />
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v)}
                />
                <Select
                  label="City"
                  options={[{ label: "All Cities", value: "" }, ...data.cities.filter((c): c is string => c !== null).map((c) => ({ label: c, value: c }))]}
                  value={cityFilter}
                  onChange={(v) => setCityFilter(v)}
                />
                <Select
                  label="Risk Score"
                  options={[
                    { label: "All Risk Levels", value: "" },
                    { label: "Trusted", value: "trusted" },
                    { label: "Neutral", value: "neutral" },
                    { label: "Risky", value: "risky" },
                  ]}
                  value={riskFilter}
                  onChange={(v) => setRiskFilter(v)}
                />
              </InlineGrid>
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
            {exportMsg && (
              <Banner tone={exportMsg.success ? "success" : "critical"} onDismiss={() => setExportMsg(null)}>
                {exportMsg.text}
              </Banner>
            )}
            {syncMsg && (
              <Banner tone={syncMsg.success ? "success" : "critical"} onDismiss={() => setSyncMsg(null)}>
                {syncMsg.text}
              </Banner>
            )}
            <InlineStack gap="200" align="space-between">
              <Text variant="headingMd" as="h3">
                {data.total} order{data.total !== 1 ? "s" : ""}
                {hasFilters ? " (filtered)" : ""}
              </Text>
              <InlineStack gap="200">
                {data.total === 0 && (
                  <Button onClick={syncFromShopify} loading={syncing} variant="primary">
                    {syncing ? "Syncing..." : "Sync Orders from Shopify"}
                  </Button>
                )}
                {data.total > 0 && (
                  <Button onClick={syncFromShopify} loading={syncing}>
                    {syncing ? "Syncing..." : "Sync"}
                  </Button>
                )}
                {data.hasGoogleCreds && data.googleSheetId && (
                  <Button onClick={exportToSheets} loading={exporting}>Export to Sheets</Button>
                )}
                <Button
                  variant="primary"
                  url={`/api/orders/export?${searchParams.toString()}`}
                  external
                >
                  Download CSV
                </Button>
              </InlineStack>
            </InlineStack>
            {!data.googleSheetId && data.hasGoogleCreds && (
              <Banner tone="info">
                <p>Configure your Google Sheet ID in <a href="/app/settings">Settings</a> to enable one-click export to Google Sheets.</p>
              </Banner>
            )}
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "numeric", "text", "text", "text", "text", "text"]}
              headings={["Order #", "Customer", "Phone", "City", "Amount", "Status", "Risk", "Courier", "Date", ""]}
              rows={data.orders.length > 0 ? data.orders.map((order) => [
                `#${order.orderNumber}`,
                order.customerName || "—",
                order.customerPhone || "—",
                order.customerCity || "—",
                `PKR ${order.codAmount.toLocaleString()}`,
                <Badge tone={getStatusTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge>,
                order.riskScore ? <Badge tone={order.riskScore === "trusted" ? "success" : order.riskScore === "risky" ? "critical" : "attention"}>{order.riskScore}</Badge> : <Text as="span" tone="subdued">—</Text>,
                order.shipments[0]?.courierName || "—",
                new Date(order.createdAt).toLocaleDateString(),
                <a href={`/app/orders/${order.id}`} style={{ color: "#2c6ecb" }}>View</a>,
              ]) : [[
                <Box paddingBlock="400">
                  <BlockStack gap="300" align="center">
                    <Text as="p" tone="subdued">No orders found.</Text>
                    <Text as="p" tone="subdued">Click "Sync Orders from Shopify" above to import your existing orders.</Text>
                    <Text as="p" tone="subdued" variant="bodySm">New COD orders will also appear automatically after webhook setup.</Text>
                  </BlockStack>
                </Box>
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
