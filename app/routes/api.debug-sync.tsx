import { authenticate } from "../shopify.server";

export async function action({ request }: { request: Request }) {
  try {
    const { session } = await authenticate.admin(request);
    const accessToken = session.accessToken;
    const shop = session.shop;

    const url = `https://${shop}/admin/api/2026-04/orders.json?status=any&limit=5`;
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    const status = response.status;
    const text = await response.text();

    return Response.json({
      shop,
      status,
      hasAccessToken: !!accessToken,
      tokenPrefix: accessToken?.substring(0, 10) + "...",
      responsePreview: text.substring(0, 2000),
    });
  } catch (error: any) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function loader() {
  return Response.json({ message: "Debug endpoint" });
}
