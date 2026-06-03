import { authenticate } from "../shopify.server";
import { getDashboardStats } from "../models/order.server";

export async function loader({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);
  const stats = await getDashboardStats(session.shop);
  return Response.json(stats);
}
