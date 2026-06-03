import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, registerWebhooks } from "../shopify.server";
import en from "@shopify/polaris/locales/en.json";

const webhooksRegistered = new Set<string>();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!webhooksRegistered.has(session.shop)) {
    try {
      await registerWebhooks({ session });
      webhooksRegistered.add(session.shop);
      console.log(`[webhooks] Registered for ${session.shop}`);
    } catch (err) {
      console.error(`[webhooks] Registration error for ${session.shop}:`, err);
    }
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={en}>
        <NavMenu>
          <a rel="navigate" href="/app">Dashboard</a>
          <a rel="navigate" href="/app/orders">Orders</a>
          <a rel="navigate" href="/app/analytics">Analytics</a>
          <a rel="navigate" href="/app/rules">COD Rules</a>
          <a rel="navigate" href="/app/blacklist">Blacklist</a>
          <a rel="navigate" href="/app/settings">Settings</a>
        </NavMenu>
        <Outlet />
      </PolarisProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
