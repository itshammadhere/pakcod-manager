import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { Page, TextField, Button, Card, BlockStack, Box, Text } from "@shopify/polaris";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import styles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [
  { rel: "stylesheet", href: styles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <Page title="Log in">
        <Card>
          <Form method="post">
            <BlockStack gap="400">
              <TextField
                name="shop"
                label="Shop domain"
                autoComplete="on"
                placeholder="example.myshopify.com"
                value={shop}
                onChange={(v) => setShop(v)}
                error={errors.shop}
                helpText="Enter your Shopify store domain"
              />
              <Button submit>Log in</Button>
            </BlockStack>
          </Form>
        </Card>
      </Page>
    </AppProvider>
  );
}
