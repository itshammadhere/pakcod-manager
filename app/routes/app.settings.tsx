import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { Page, Card, BlockStack, Text, TextField, Select, Button, Banner, Badge, Box, InlineStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useCallback } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getRegisteredCouriers } from "../services/couriers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  const courierConfigs = await prisma.courierConfig.findMany({
    where: { shop: session.shop },
  });
  const hasGoogleCreds = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
  return { store, courierConfigs, couriers: getRegisteredCouriers(), hasGoogleCreds };
};

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "updateWhatsApp") {
    await prisma.store.upsert({
      where: { shop: session.shop },
      create: {
        shop: session.shop,
        whatsappPhone: formData.get("whatsappPhone")?.toString(),
        whatsappToken: formData.get("whatsappToken")?.toString(),
      },
      update: {
        whatsappPhone: formData.get("whatsappPhone")?.toString(),
        whatsappToken: formData.get("whatsappToken")?.toString(),
      },
    });
  }

  if (intent === "updateCourier") {
    const courierName = formData.get("courierName")?.toString();
    const apiKey = formData.get("apiKey")?.toString();
    const apiPassword = formData.get("apiPassword")?.toString();

    if (courierName) {
      await prisma.courierConfig.upsert({
        where: { shop_courierName: { shop: session.shop, courierName } },
        create: { shop: session.shop, courierName, apiKey, apiPassword },
        update: { apiKey, apiPassword },
      });
    }
  }

  if (intent === "updateGoogleSheet") {
    await prisma.store.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, googleSheetId: formData.get("googleSheetId")?.toString() },
      update: { googleSheetId: formData.get("googleSheetId")?.toString() },
    });
  }

  return null;
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback((intent: string) => {
    return () => {
      const form = document.querySelector(`form[data-intent="${intent}"]`) as HTMLFormElement;
      if (form) {
        const fd = new FormData(form);
        fd.set("intent", intent);
        submit(fd, { method: "post" });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    };
  }, [submit]);

  return (
    <Page title="Settings">
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        {saved && <Banner tone="success">Settings saved successfully.</Banner>}

        <form method="post" data-intent="updateWhatsApp">
          <input type="hidden" name="intent" value="updateWhatsApp" />
          <Card>
            <Text variant="headingMd" as="h3">WhatsApp Configuration</Text>
            <Box paddingBlockStart="400">
              <BlockStack gap="300">
                <TextField
                  label="WhatsApp Phone Number ID"
                  autoComplete="off"
                  helpText="From Meta WhatsApp Business API settings"
                  name="whatsappPhone"
                  value={data.store?.whatsappPhone || ""}
                  onChange={() => {}}
                />
                <TextField
                  label="WhatsApp Access Token"
                  autoComplete="off"
                  helpText="Permanent access token from Meta"
                  name="whatsappToken"
                  value={data.store?.whatsappToken || ""}
                  onChange={() => {}}
                  type="password"
                />
                <Button onClick={handleSave("updateWhatsApp")}>Save WhatsApp Settings</Button>
              </BlockStack>
            </Box>
          </Card>
        </form>

        <Card>
          <Text variant="headingMd" as="h3">Available Couriers</Text>
          <Box paddingBlockStart="400">
            <BlockStack gap="300">
              {data.couriers.map((courier) => (
                <form key={courier.name} method="post" data-intent="updateCourier">
                  <input type="hidden" name="intent" value="updateCourier" />
                  <input type="hidden" name="courierName" value={courier.name} />
                  <Box padding="300" borderRadius="200" background="bg-surface-secondary">
                    <BlockStack gap="200">
                      <InlineStack gap="200" align="space-between">
                        <Text fontWeight="bold" as="span">{courier.label}</Text>
                        {courier.name === "weship" ? (
                          <Badge tone="success">Pre-configured</Badge>
                        ) : (
                          <Button onClick={handleSave("updateCourier")}>Save</Button>
                        )}
                      </InlineStack>
                      {courier.name === "weship" ? (
                        <Text as="p" tone="subdued" variant="bodySm">WeShip is pre-configured and available for all couriers automatically.</Text>
                      ) : (
                        <>
                          <TextField
                            label="API Key"
                            autoComplete="off"
                            name="apiKey"
                            value={data.courierConfigs.find((c) => c.courierName === courier.name)?.apiKey || ""}
                            onChange={() => {}}
                          />
                          <TextField
                            label="API Password"
                            autoComplete="off"
                            name="apiPassword"
                            value={data.courierConfigs.find((c) => c.courierName === courier.name)?.apiPassword || ""}
                            onChange={() => {}}
                          />
                        </>
                      )}
                    </BlockStack>
                  </Box>
                </form>
              ))}
            </BlockStack>
          </Box>
        </Card>

        <form method="post" data-intent="updateGoogleSheet">
          <input type="hidden" name="intent" value="updateGoogleSheet" />
          <Card>
            <InlineStack gap="200" align="space-between">
              <Text variant="headingMd" as="h3">Google Sheets Export</Text>
              {data.hasGoogleCreds ? <Badge tone="success">Connected</Badge> : <Badge tone="attention">Not Configured</Badge>}
            </InlineStack>
            <Box paddingBlockStart="400">
              <BlockStack gap="300">
                <TextField
                  label="Google Sheet ID"
                  autoComplete="off"
                  helpText="From your sheet URL: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit"
                  name="googleSheetId"
                  value={data.store?.googleSheetId || ""}
                  onChange={() => {}}
                />
                <InlineStack gap="200">
                  <Button onClick={handleSave("updateGoogleSheet")}>Save Sheet ID</Button>
                  <Button url="/api/orders/export" external variant="primary">Download CSV</Button>
                </InlineStack>
                <Box padding="300" borderRadius="200" background="bg-surface-secondary">
                  <Text variant="headingXs" as="h4" fontWeight="bold">Setup Instructions</Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">1. Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">Google Cloud Console</a> → Enable Google Sheets API</Text>
                    <Text as="p" variant="bodySm">2. Create a Service Account → Download JSON key</Text>
                    <Text as="p" variant="bodySm">3. Email your service account: <b>{process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "Set GOOGLE_SERVICE_ACCOUNT_EMAIL env var"}</b></Text>
                    <Text as="p" variant="bodySm">4. Share your Google Sheet with that email (Editor access)</Text>
                    <Text as="p" variant="bodySm">5. Paste the Sheet ID above and Save</Text>
                    <Text as="p" variant="bodySm">6. Go to Orders page → click "Export to Sheets"</Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Box>
          </Card>
        </form>

        <Card>
          <Text variant="headingMd" as="h3">Webhook URLs</Text>
          <Box paddingBlockStart="400">
            <BlockStack gap="200">
              <InlineStack gap="200"><Text fontWeight="bold" as="span">WhatsApp Webhook:</Text><Text as="span" variant="bodySm">{process.env.SHOPIFY_APP_URL}/webhooks/whatsapp</Text></InlineStack>
              <InlineStack gap="200"><Text fontWeight="bold" as="span">Orders Create:</Text><Text as="span" variant="bodySm">{process.env.SHOPIFY_APP_URL}/webhooks/orders/create</Text></InlineStack>
              <InlineStack gap="200"><Text fontWeight="bold" as="span">Orders Update:</Text><Text as="span" variant="bodySm">{process.env.SHOPIFY_APP_URL}/webhooks/orders/updated</Text></InlineStack>
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
