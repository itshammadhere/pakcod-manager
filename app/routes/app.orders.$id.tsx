import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { Page, Card, BlockStack, Text, Badge, Button, Banner, Spinner, Box, InlineStack, InlineGrid, Select } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrder } from "../models/order.server";
import prisma from "../db.server";
import { getRegisteredCouriers, bookShipment } from "../services/couriers";
import { scorePhone, getOrdersByPhone } from "../services/risk-scoring.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const order = await getOrder(params.id!);
  if (!order || order.shop !== session.shop) {
    throw new Response("Order not found", { status: 404 });
  }

  const courierConfigs = await prisma.courierConfig.findMany({ where: { shop: session.shop } });
  const weshipConfig = courierConfigs.find((c) => c.courierName === "weship");

  let riskScore = null;
  let duplicateOrders: any[] = [];

  if (order.customerPhone) {
    riskScore = await scorePhone(order.customerPhone, session.shop);
    duplicateOrders = await getOrdersByPhone(order.customerPhone, session.shop, order.id);
  }

  return {
    order,
    couriers: getRegisteredCouriers(),
    hasWeShip: !!weshipConfig?.apiKey || !!process.env.WESHIP_API_KEY,
    weshipKey: weshipConfig?.apiKey || process.env.WESHIP_API_KEY || "",
    riskScore,
    duplicateOrders,
  };
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

  if (intent === "bookCourier") {
    const courierName = formData.get("courierName")?.toString();
    const { updateOrderStatus } = await import("../models/order.server");
    const order = await getOrder(params.id!);

    if (!order || !courierName) return null;

    const result = await bookShipment(courierName, {
      orderNumber: order.orderNumber,
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      customerAddress: order.customerAddress || "",
      customerCity: order.customerCity || "",
      codAmount: order.codAmount,
      pieces: 1,
      courier: courierName,
    }, { apiKey: process.env.WESHIP_API_KEY || "" });

    if (result.success && result.trackingNumber) {
      await prisma.shipment.create({
        data: {
          codOrderId: params.id!,
          courierName,
          trackingNumber: result.trackingNumber,
          status: "booked",
          bookedAt: new Date(),
        },
      });
      await updateOrderStatus(params.id!, {
        status: "shipped",
        changedBy: "system",
        notes: `Booked via ${courierName}, tracking: ${result.trackingNumber}`,
      });
    }

    return { bookingResult: result };
  }

  return null;
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

export default function OrderDetailPage() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [loading, setLoading] = useState<string | null>(null);
  const [courier, setCourier] = useState("");
  const [bookingMsg, setBookingMsg] = useState<{ success: boolean; text: string } | null>(null);

  const order = data.order;
  const shipment = order.shipments[0];
  const logs = order.statusLogs || [];
  const notifications = order.notifications || [];
  const riskScore = data.riskScore;
  const dupes = data.duplicateOrders || [];

  const riskTone = riskScore?.level === "trusted" ? "success" : riskScore?.level === "risky" ? "critical" : "warning";
  const riskLabel = riskScore?.level ? riskScore.level.charAt(0).toUpperCase() + riskScore.level.slice(1) : "Unknown";

  function updateStatus(status: string) {
    setLoading(status);
    const formData = new FormData();
    formData.set("intent", "updateStatus");
    formData.set("status", status);
    submit(formData, { method: "post" });
    setTimeout(() => setLoading(null), 2000);
  }

  function bookCourier() {
    if (!courier) return;
    setLoading("booking");
    setBookingMsg(null);
    const formData = new FormData();
    formData.set("intent", "bookCourier");
    formData.set("courierName", courier);
    submit(formData, { method: "post" });
    setTimeout(() => setLoading(null), 5000);
  }

  const canBookCourier = data.hasWeShip && order.status !== "delivered" && order.status !== "returned" && order.status !== "cancelled" && !shipment;

  return (
    <Page
      title={`Order #${order.orderNumber}`}
      backAction={{ content: "Orders", url: "/app/orders" }}
    >
      <TitleBar title={`Order #${order.orderNumber}`} />
      <BlockStack gap="500">
        {bookingMsg && (
          <Banner tone={bookingMsg.success ? "success" : "critical"} onDismiss={() => setBookingMsg(null)}>
            {bookingMsg.text}
          </Banner>
        )}

        {riskScore && (
          <Banner tone={riskTone} title={`${riskLabel} Customer`}>
            <p>{riskScore.reason}</p>
            <p>Phone history: {riskScore.history.total} orders, {riskScore.history.delivered} delivered, {riskScore.history.returned} returned</p>
          </Banner>
        )}

        {dupes.length > 0 && (
          <Banner tone="warning" title={`${dupes.length} other order${dupes.length > 1 ? "s" : ""} from this phone`}>
            <BlockStack gap="200">
              {dupes.slice(0, 5).map((d: any) => (
                <InlineStack key={d.id} gap="200">
                  <a href={`/app/orders/${d.id}`}>#{d.orderNumber}</a>
                  <Badge tone={d.status === "delivered" ? "success" : d.status === "returned" || d.status === "cancelled" ? "critical" : "attention"}>{d.status}</Badge>
                  <Text as="span" variant="bodySm" tone="subdued">{new Date(d.createdAt).toLocaleDateString()}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Banner>
        )}

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

        {canBookCourier && (
          <Card>
            <Text variant="headingMd" as="h3">Book Courier Shipment</Text>
            <Box paddingBlockStart="300">
              <InlineStack gap="300" wrap>
                <Box minWidth="200px">
                  <Select
                    label="Select courier"
                    value={courier}
                    onChange={setCourier}
                    options={data.couriers.map((c) => ({ label: c.label, value: c.name }))}
                  />
                </Box>
                <Box paddingBlockStart="300">
                  <Button onClick={bookCourier} disabled={!courier || loading !== null} loading={loading === "booking"}>
                    Book Shipment
                  </Button>
                </Box>
              </InlineStack>
            </Box>
          </Card>
        )}

        {shipment && (
          <Card>
            <Text variant="headingMd" as="h3">Shipment</Text>
            <Box paddingBlockStart="300">
              <BlockStack gap="200">
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Courier:</Text><Text as="span">{shipment.courierName}</Text></InlineStack>
                {shipment.trackingNumber && (
                  <InlineStack gap="200"><Text fontWeight="bold" as="span">Tracking:</Text><Text as="span">{shipment.trackingNumber}</Text></InlineStack>
                )}
                <InlineStack gap="200"><Text fontWeight="bold" as="span">Status:</Text><Badge tone={getStatusTone(shipment.status)}>{shipment.status}</Badge></InlineStack>
                {shipment.bookedAt && (
                  <InlineStack gap="200"><Text fontWeight="bold" as="span">Booked At:</Text><Text as="span">{new Date(shipment.bookedAt).toLocaleString()}</Text></InlineStack>
                )}
              </BlockStack>
            </Box>
          </Card>
        )}

        <Card>
          <Text variant="headingMd" as="h3">Status Timeline</Text>
          <Box paddingBlockStart="300">
            <BlockStack gap="200">
              {logs.length > 0 ? logs.map((log) => (
                <InlineStack key={log.id} gap="200" wrap>
                  <Text variant="bodySm" tone="subdued" as="span">{new Date(log.createdAt).toLocaleString()}</Text>
                  {log.fromStatus && <Badge tone={getStatusTone(log.fromStatus)}>{log.fromStatus}</Badge>}
                  <Text as="span">→</Text>
                  <Badge tone={getStatusTone(log.toStatus)}>{log.toStatus}</Badge>
                  <Text variant="bodySm" tone="subdued" as="span">by {log.changedBy}</Text>
                  {log.notes && <Text variant="bodySm" as="span">— {log.notes}</Text>}
                </InlineStack>
              )) : (
                <Text as="p" tone="subdued">No status changes recorded.</Text>
              )}
            </BlockStack>
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

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
