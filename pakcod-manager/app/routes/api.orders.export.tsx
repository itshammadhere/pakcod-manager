import { authenticate } from "../shopify.server";
import { getOrdersForExport } from "../models/order.server";
import { exportOrdersToSheet, createSheet } from "../services/gsheets.server";

export async function action({ request }: { request: Request }) {
  try {
    const { session } = await authenticate.admin(request);
    const body = await request.json();

    const orders = await getOrdersForExport(session.shop, {
      status: body.status,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });

    const creds = {
      accessToken: body.accessToken,
    };

    let spreadsheetId = body.spreadsheetId;
    const sheetName = body.sheetName || "COD Orders";

    if (!spreadsheetId) {
      spreadsheetId = await createSheet(
        `PakCOD Export - ${new Date().toISOString().split("T")[0]}`,
        creds
      );
    }

    await exportOrdersToSheet(orders, spreadsheetId, sheetName, creds);

    return Response.json({
      success: true,
      exported: orders.length,
      spreadsheetId,
    });
  } catch (error: any) {
    console.error("Export error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
