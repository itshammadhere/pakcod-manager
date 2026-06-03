const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

interface GoogleCreds {
  accessToken: string;
}

export async function exportOrdersToSheet(
  orders: any[],
  spreadsheetId: string,
  sheetName: string,
  creds: GoogleCreds
) {
  const headers = [
    "Order #", "Shopify Order ID", "Customer Name", "Customer Phone",
    "Customer City", "Customer Address", "Total Price", "COD Amount",
    "Status", "Courier", "Tracking #", "Order Date", "Delivered Date",
    "Return Reason",
  ];

  const rows = orders.map((order) => [
    order.orderNumber,
    order.shopifyOrderId,
    order.customerName || "",
    order.customerPhone || "",
    order.customerCity || "",
    order.customerAddress || "",
    order.totalPrice,
    order.codAmount,
    order.status,
    order.shipments?.[0]?.courierName || "",
    order.shipments?.[0]?.trackingNumber || "",
    new Date(order.createdAt).toISOString().split("T")[0],
    order.deliveredAt ? new Date(order.deliveredAt).toISOString().split("T")[0] : "",
    order.returnReason || "",
  ]);

  const response = await fetch(
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${sheetName}!A1:Z`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        range: `${sheetName}!A1`,
        majorDimension: "ROWS",
        values: [headers, ...rows],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Sheets API error: ${error}`);
  }

  return response.json();
}

export async function createSheet(
  title: string,
  creds: GoogleCreds
): Promise<string> {
  const response = await fetch(GOOGLE_SHEETS_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create sheet: ${error}`);
  }

  const data = await response.json();
  return data.spreadsheetId;
}

export async function getSheetNames(
  spreadsheetId: string,
  creds: GoogleCreds
): Promise<string[]> {
  const response = await fetch(
    `${GOOGLE_SHEETS_API}/${spreadsheetId}`,
    {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
      },
    }
  );

  if (!response.ok) return [];

  const data = await response.json();
  return data.sheets?.map((s: any) => s.properties.title) || [];
}
