import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { Page, Card, DataTable, BlockStack, Text, Badge, Button, Banner, Spinner, Box, InlineStack, InlineGrid } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrder } from "../models/order.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const order = await getOrder(params.id!);
  if (!order || order.shop !== session.shop) {
    throw new Response("Order not found", { status: 404 });
  }
  return order;
};

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "updateStatus") {
    const status = formData.get("status")?.toString();
    if (status) {
      const { updateOrderStatus } = await import("../models/order.server");
      await updateOrderStatus(params.id!, {
        status,
        changedBy: (session as any).onlineAccessInfo?.email || "admin",
        notes: formData.get("notes")?.toString() || undefined,
      });
    }
  }

  return null;
}

export default function OrderDetailPage() {
  const order = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [loading, setLoading] = useState<string | null>(null);

  function updateStatus(status: string) {
    setLoading(status);
    const formData = new FormData();
    formData.set("intent", "updateStatus");
    formData.set("status", status);
    submit(formData, { method: "post" });
  }

  const shipment = order.shipments[0];
  const logs = order.statusLogs || [];
  const notifications = order.notifications || [];

  return (
    <Page
      title={`Order #${order.orderNumber}`}
      backAction={{ content: "Orders", url: "/app/orders" }}
    >
      <TitleBar title={`Order #${order.orderNumber}`} />
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <Text variant="headingMd" as="h3">Customer Details</Text>
            <Box paddingBlockStart="300">
              <BlockStack gap="200">
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Name:</Text><Text as="span">{order.customerName || "—"}</Text></InlineStack>
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Phone:</Text><Text as="span">{order.customerPhone || "—"}</Text></InlineStack>
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Email:</Text><Text as="span">{order.customerEmail || "—"}</Text></InlineStack>
                <InlineStack gap="200"><Text fontWeight="bold" as="span">City:</Text><Text as="span">{order.customerCity || "—"}</Text></InlineStack>
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Address:</Text><Text as="span">{order.customerAddress || "—"}</Text></InlineStack>
              </BlockStack>
            </Box>
          </Card>

          <Card>
            <Text variant="headingMd" as="h3">Order Info</Text>
            <Box paddingBlockStart="300">
              <BlockStack gap="200">
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Shopify ID:</Text><Text as="span">{order.shopifyOrderId}</Text></InlineStack>
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Total:</Text><Text as="span">PKR {order.totalPrice.toLocaleString()}</Text></InlineStack>
                <InlineStack gap="200"><Text fontWeight="bold" as="span">COD Amount:</Text><Text as="span">PKR {order.codAmount.toLocaleString()}</Text></InlineStack>
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Status:</Text><Badge tone={getStatusTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge></InlineStack>
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Created:</Text><Text as="span">{new Date(order.createdAt).toLocaleString()}</Text></InlineStack>
                {order.deliveredAt && (
                  <InlineStack gap="200"><Text fontWeight="bold" as="span">Delivered:</Text><Text as="span">{new Date(order.deliveredAt).toLocaleString()}</Text></InlineStack>
                )}
                {order.returnReason && (
                  <InlineStack gap="200"><Text fontWeight="bold" as="span">Return Reason:</Text><Text as="span">{order.returnReason}</Text></InlineStack>
                )}
              </BlockStack>
            </Box>
          </Card>
        </InlineGrid>

        <Card>
          <Text variant="headingMd" as="h3">Actions</Text>
          <Box paddingBlockStart="300">
            <InlineStack gap="300" wrap>
              {order.status === "pending_confirmation" && (
                <Button onClick={() => updateStatus("confirmed")} disabled={loading !== null}>Confirm Order</Button>
              )}
              {(order.status === "confirmed" || order.status === "pending") && (
                <>
                  <Button onClick={() => updateStatus("confirmed")} disabled={loading !== null}>Mark Confirmed</Button>
                  <Button onClick={() => updateStatus("processing")} disabled={loading !== null}>Mark Processing</Button>
                </>
              )}
              {order.status === "processing" && (
                <Button onClick={() => updateStatus("shipped")} disabled={loading !== null}>Mark Shipped</Button>
              )}
              {["shipped", "in_transit", "out_for_delivery"].includes(order.status) && (
                <Button onClick={() => updateStatus("delivered")} disabled={loading !== null}>Mark Delivered</Button>
              )}
              {!["delivered", "returned", "cancelled"].includes(order.status) && (
                <>
                  <Button tone="critical" onClick={() => updateStatus("cancelled")} disabled={loading !== null}>Cancel Order</Button>
                  <Button tone="critical" onClick={() => updateStatus("returned")} disabled={loading !== null}>Mark Returned</Button>
                </>
              )}
              {loading && <Spinner size="small" />}
            </InlineStack>
          </Box>
        </Card>

        {shipment && (
          <Card>
            <Text variant="headingMd" as="h3">Shipment</Text>
            <Box paddingBlockStart="300">
              <BlockStack gap="200">
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Courier:</Text><Text as="span">{shipment.courierName}</Text></InlineStack>
                {shipment.trackingNumber && (
                  <InlineStack gap="200"><Text fontWeight="bold" as="span">Tracking:</Text><Text as="span">{shipment.trackingNumber}</Text></InlineStack>
                )}
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Shipment Status:</Text><Badge tone={getStatusTone(shipment.status)}>{shipment.status}</Badge></InlineStack>
              </BlockStack>
            </Box>
          </Card>
        )}

        <Card>
          <Text variant="headingMd" as="h3">Status Timeline</Text>
          <Box paddingBlockStart="300">
            <DataTable
              columnContentTypes={["text", "text", "text", "text"]}
              headings={["Date", "From", "To", "Changed By", "Notes"]}
              rows={logs.length > 0 ? logs.map((log) => [
                new Date(log.createdAt).toLocaleString(),
                log.fromStatus || "—",
                <Badge tone={getStatusTone(log.toStatus)}>{log.toStatus}</Badge>,
                log.changedBy,
                log.notes || "—",
              ]) : [[
                <Text as="p" tone="subdued">No status changes recorded.</Text>,
              ]]}
            />
          </Box>
        </Card>

        <Card>
          <Text variant="headingMd" as="h3">Notifications</Text>
          <Box paddingBlockStart="300">
            <BlockStack gap="200">
              {notifications.length > 0 ? notifications.map((n) => (
                <Box key={n.id} padding="300" borderRadius="200" background="bg-surface-secondary">
                  <InlineStack gap="200" wrap>
                    <Text fontWeight="bold" as="span">{n.channel}:</Text>
                    <Badge tone={n.status === "sent" || n.status === "delivered" ? "success" : n.status === "failed" ? "critical" : "attention"}>{n.status}</Badge>
                    {n.sentAt && <Text as="span" tone="subdued">{new Date(n.sentAt).toLocaleString()}</Text>}
                    {n.error && <Text as="span" tone="critical">{n.error}</Text>}
                  </InlineStack>
                </Box>
              )) : (
                <Text as="p" tone="subdued">No notifications sent.</Text>
              )}
            </BlockStack>
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
