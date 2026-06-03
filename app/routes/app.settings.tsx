import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { Page, Card, BlockStack, Text, TextField, Select, Button, Banner, Box, InlineStack } from "@shopify/polaris";
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
  return { store, courierConfigs, couriers: getRegisteredCouriers() };
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
                        <Button onClick={handleSave("updateCourier")}>Save</Button>
                      </InlineStack>
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
                    </BlockStack>
                  </Box>
                </form>
              ))}
            </BlockStack>
          </Box>
        </Card>

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
