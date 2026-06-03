import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { Page, Card, BlockStack, Text, InlineGrid, Box, Select, InlineStack } from "@shopify/polaris";
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
  let maxDaily = 0;
  for (const order of orders) {
    const day = order.createdAt.toISOString().split("T")[0];
    if (!dailyMap[day]) dailyMap[day] = { total: 0, delivered: 0, returned: 0, codAmount: 0 };
    dailyMap[day].total++;
    dailyMap[day].codAmount += order.codAmount;
    if (order.status === "delivered") dailyMap[day].delivered++;
    if (order.status === "returned") dailyMap[day].returned++;
    if (dailyMap[day].total > maxDaily) maxDaily = dailyMap[day].total;
  }

  const daily = Object.entries(dailyMap).map(([date, data]) => ({ date, ...data }));

  const byCity = await prisma.codOrder.groupBy({
    by: ["customerCity"],
    where: { shop: session.shop, customerCity: { not: null } },
    _count: true,
    _sum: { codAmount: true },
    orderBy: { _count: { customerCity: "desc" } },
    take: 10,
  });

  const total = orders.length;
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const returned = orders.filter((o) => o.status === "returned").length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const pending = orders.filter((o) => o.status === "pending" || o.status === "pending_confirmation").length;
  const confirmed = orders.filter((o) => o.status === "confirmed" || o.status === "processing").length;

  return {
    daily,
    maxDaily,
    byCity: byCity.map((c) => ({ city: c.customerCity, orders: c._count, codAmount: c._sum.codAmount || 0 })),
    totals: { total, delivered, returned, cancelled, pending, confirmed },
    days,
  };
};

function Chart({ data, max }: { data: { date: string; total: number; delivered: number }[]; max: number }) {
  const w = 700;
  const h = 200;
  const pad = 30;
  const chartW = w - pad * 2;
  const chartH = h - pad * 2;
  const slice = data.length > 30 ? Math.ceil(data.length / 30) : 1;
  const visible = data.filter((_, i) => i % slice === 0 || i === data.length - 1);
  const barW = Math.max(4, Math.min(12, chartW / visible.length - 2));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxHeight: 200 }}>
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <g key={pct}>
          <line x1={pad} y1={pad + chartH * (1 - pct)} x2={w - pad} y2={pad + chartH * (1 - pct)} stroke="#e0e0e0" strokeWidth={1} />
          <text x={pad - 4} y={pad + chartH * (1 - pct) + 4} textAnchor="end" fontSize={10} fill="#666">{Math.round(max * pct)}</text>
        </g>
      ))}
      {visible.map((d, i) => {
        const x = pad + (i / Math.max(visible.length - 1, 1)) * chartW - barW / 2;
        const bh = (d.total / Math.max(max, 1)) * chartH;
        return (
          <g key={d.date}>
            <rect x={x} y={pad + chartH - bh} width={barW} height={bh} fill="#5c6ac4" rx={2} />
            {i % Math.max(1, Math.floor(visible.length / 10)) === 0 && (
              <text x={x + barW / 2} y={h - 4} textAnchor="end" fontSize={8} fill="#666" transform={`rotate(-45 ${x + barW / 2} ${h - 4})`}>{d.date.slice(5)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function StatCard({ label, value, tone, sub }: { label: string; value: string | number; tone?: string; sub?: string }) {
  return (
    <Box padding="400" borderRadius="200" background="bg-surface-secondary">
      <Text variant="headingXs" as="p" tone="subdued">{label}</Text>
      <Text variant="heading2xl" as="p" fontWeight="bold" tone={tone as any}>{value}</Text>
      {sub && <Text variant="bodyXs" as="p" tone="subdued">{sub}</Text>}
    </Box>
  );
}

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const days = searchParams.get("days") || "30";
  const total = data.totals;
  const deliveryRate = total.total > 0 ? Math.round((total.delivered / total.total) * 100) : 0;
  const rtoRate = total.total > 0 ? Math.round((total.returned / total.total) * 100) : 0;

  return (
    <Page title="Analytics">
      <TitleBar title="Analytics" />
      <BlockStack gap="500">
        <div style={{ maxWidth: 200 }}>
          <Select
            label="Time period"
            value={days}
            onChange={(v) => setSearchParams({ days: v })}
            options={[
              { label: "Last 7 days", value: "7" },
              { label: "Last 30 days", value: "30" },
              { label: "Last 90 days", value: "90" },
            ]}
          />
        </div>

        <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
          <StatCard label="Total Orders" value={total.total} sub={`Last ${data.days} days`} />
          <StatCard label="Delivered" value={total.delivered} tone="success" sub={`${deliveryRate}% delivery rate`} />
          <StatCard label="Returned" value={total.returned} tone="critical" sub={`${rtoRate}% RTO rate`} />
          <StatCard label="Pending" value={total.pending} tone="attention" sub={`${total.confirmed} confirmed`} />
        </InlineGrid>

        <Card>
          <Text variant="headingMd" as="h3">Daily Orders</Text>
          <Box paddingBlockStart="300">
            {data.daily.length > 0 ? (
              <Chart data={data.daily} max={data.maxDaily} />
            ) : (
              <Text as="p" tone="subdued" alignment="center">No orders in this period</Text>
            )}
          </Box>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <Text variant="headingMd" as="h3">Orders by City</Text>
            <Box paddingBlockStart="300">
              <BlockStack gap="200">
                {data.byCity.length > 0 ? data.byCity.map((c) => {
                  const pct = total.total > 0 ? Math.round((c.orders / total.total) * 100) : 0;
                  return (
                    <InlineStack key={c.city} gap="200" align="space-between">
                      <InlineStack gap="200">
                        <Text as="span">{c.city}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text as="span" fontWeight="bold">{c.orders}</Text>
                        <Text as="span" tone="subdued" variant="bodySm">({pct}%)</Text>
                        <Text as="span" tone="subdued">Rs. {(c.codAmount as number).toLocaleString()}</Text>
                      </InlineStack>
                    </InlineStack>
                  );
                }) : (
                  <Text as="p" tone="subdued">No city data</Text>
                )}
              </BlockStack>
            </Box>
          </Card>

          <Card>
            <Text variant="headingMd" as="h3">Status Breakdown</Text>
            <Box paddingBlockStart="300">
              <BlockStack gap="300">
                {[
                  { label: "Delivered", value: total.delivered, color: "#22c55e", pct: deliveryRate },
                  { label: "Returned", value: total.returned, color: "#ef4444", pct: rtoRate },
                  { label: "Cancelled", value: total.cancelled, color: "#f59e0b", pct: total.total > 0 ? Math.round((total.cancelled / total.total) * 100) : 0 },
                  { label: "Pending", value: total.pending, color: "#6366f1", pct: total.total > 0 ? Math.round((total.pending / total.total) * 100) : 0 },
                  { label: "Confirmed/Processing", value: total.confirmed, color: "#3b82f6", pct: total.total > 0 ? Math.round((total.confirmed / total.total) * 100) : 0 },
                ].filter((s) => s.value > 0).map((s) => (
                  <Box key={s.label}>
                    <InlineStack gap="200" align="space-between">
                      <InlineStack gap="200">
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, marginTop: 4 }} />
                        <Text as="span">{s.label}</Text>
                      </InlineStack>
                      <Text as="span" fontWeight="bold">{s.value} ({s.pct}%)</Text>
                    </InlineStack>
                    <div style={{ height: 6, background: "#f1f1f1", borderRadius: 3, marginTop: 4 }}>
                      <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 3 }} />
                    </div>
                  </Box>
                ))}
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
