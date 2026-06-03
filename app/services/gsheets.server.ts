import { google } from "googleapis";

let _auth: any = null;
let _credsEmail: string | null = null;
let _credsKey: string | null = null;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) return null;

  if (_auth && _credsEmail === email && _credsKey === key) return _auth;

  _credsEmail = email;
  _credsKey = key;
  _auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return _auth;
}

export async function exportOrdersToSheet(
  orders: any[],
  spreadsheetId: string,
  sheetName: string
) {
  const auth = getAuth();
  if (!auth) throw new Error("Google service account not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY env vars.");

  const sheets = google.sheets({ version: "v4", auth });

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

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:N${rows.length + 1}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [headers, ...rows],
    },
  });
}

export async function ensureSheet(spreadsheetId: string, sheetName: string) {
  const auth = getAuth();
  if (!auth) return;

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const existing = await sheets.spreadsheets.get({ spreadsheetId });
    const hasSheet = existing.data.sheets?.some((s) => s.properties?.title === sheetName);

    if (!hasSheet) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
    }
  } catch {
    throw new Error("Could not access sheet. Make sure the sheet exists and is shared with your service account email.");
  }
}
