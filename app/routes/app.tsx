import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { AppProvider as PolarisProvider, Frame, Navigation } from "@shopify/polaris";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import en from "@shopify/polaris/locales/en.json";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={en}>
        <Frame
          navigation={
            <Navigation location={location.pathname}>
              <Navigation.Item label="Dashboard" url="/app" />
              <Navigation.Item label="Orders" url="/app/orders" />
              <Navigation.Item label="Analytics" url="/app/analytics" />
              <Navigation.Item label="COD Rules" url="/app/rules" />
              <Navigation.Item label="Blacklist" url="/app/blacklist" />
              <Navigation.Item label="Settings" url="/app/settings" />
            </Navigation>
          }
        >
          <Outlet />
        </Frame>
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
