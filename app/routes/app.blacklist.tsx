import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { Page, Card, BlockStack, Text, Button, Banner, Box, InlineStack, TextField } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getBlacklist } from "../models/blacklist.server";
import { normalizePhone, formatPhone } from "../services/phone";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const blacklist = await getBlacklist(session.shop);
  return { blacklist };
};

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "add") {
    const phoneNumber = formData.get("phoneNumber")?.toString() || "";
    const normalized = normalizePhone(phoneNumber);
    if (!normalized) {
      return Response.json({ error: "Invalid Pakistani phone number" }, { status: 400 });
    }
    await prisma.phoneBlacklist.create({
      data: { shop: session.shop, phoneNumber: normalized },
    });
  }

  if (intent === "remove") {
    await prisma.phoneBlacklist.delete({
      where: { id: formData.get("id")?.toString() || "" },
    });
  }

  return null;
}

export default function BlacklistPage() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");

  function handleAdd() {
    if (!phoneNumber.trim()) return;
    const normalized = normalizePhone(phoneNumber.trim());
    if (!normalized) {
      setError("Invalid Pakistani phone number. Use format: 03XX-XXXXXXX");
      return;
    }
    setError("");
    const fd = new FormData();
    fd.set("intent", "add");
    fd.set("phoneNumber", phoneNumber.trim());
    submit(fd, { method: "post" });
    setPhoneNumber("");
  }

  function handleRemove(id: string) {
    const fd = new FormData();
    fd.set("intent", "remove");
    fd.set("id", id);
    submit(fd, { method: "post" });
  }

  return (
    <Page title="Phone Blacklist">
      <TitleBar title="Phone Blacklist" />
      <BlockStack gap="500">
        <Card>
          <Text variant="headingMd" as="h3">Block a Phone Number</Text>
          <Box paddingBlockStart="400">
            <BlockStack gap="200">
              {error && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}
              <InlineStack gap="300" wrap>
                <Box width="100%">
                  <TextField
                    label="Phone Number"
                    autoComplete="off"
                    placeholder="e.g. 03001234567"
                    value={phoneNumber}
                    onChange={(v) => { setPhoneNumber(v); setError(""); }}
                  />
                </Box>
                <Box paddingBlockStart="200">
                  <Button onClick={handleAdd}>Block Number</Button>
                </Box>
              </InlineStack>
              <Text variant="bodySm" as="span" tone="subdued">Enter a Pakistani phone number (e.g. 0300-1234567, +92 300 1234567)</Text>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Text variant="headingMd" as="h3">Blocked Numbers</Text>
          <Box paddingBlockStart="400">
            <BlockStack gap="300">
              {data.blacklist.length > 0 ? data.blacklist.map((entry) => (
                <Box key={entry.id} padding="300" borderRadius="200" background="bg-surface-secondary">
                  <InlineStack gap="200" align="space-between" wrap>
                    <Text fontWeight="bold" as="span">{formatPhone(entry.phoneNumber)}</Text>
                    <InlineStack gap="200">
                      {entry.reason && <Text as="span" tone="subdued">{entry.reason}</Text>}
                      <Button size="slim" tone="critical" onClick={() => handleRemove(entry.id)}>
                        Remove
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Box>
              )) : (
                <Text as="p" tone="subdued">No phone numbers are blocked.</Text>
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
