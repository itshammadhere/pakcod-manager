import type { CourierAdapter, CourierBookingData, CourierBookingResult, CourierTrackingResult } from "./base";

const WESHIP_API = "https://api.weship.pk/v1";

export class WeShipAdapter implements CourierAdapter {
  name = "weship";

  async book(data: CourierBookingData, config: any): Promise<CourierBookingResult> {
    try {
      const response = await fetch(`${WESHIP_API}/shipments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          order_number: String(data.orderNumber),
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
          customer_address: data.customerAddress,
          customer_city: data.customerCity,
          cod_amount: data.codAmount,
          weight_kg: data.weight ? data.weight / 1000 : 1,
          pieces: data.pieces || 1,
          courier: data.courier || config.defaultCourier || "any",
          instructions: data.specialInstructions || "",
        }),
      });

      const result = await response.json();

      if (result.success && result.tracking_number) {
        return {
          success: true,
          trackingNumber: result.tracking_number,
          label: result.label_url,
        };
      }

      return { success: false, error: result.message || "WeShip booking failed" };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async track(trackingNumber: string, config: any): Promise<CourierTrackingResult | null> {
    try {
      const response = await fetch(
        `${WESHIP_API}/track/${trackingNumber}`,
        {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        }
      );

      const result = await response.json();

      if (result.success) {
        return {
          trackingNumber,
          status: this.mapStatus(result.status),
          statusDate: result.updated_at ? new Date(result.updated_at) : undefined,
          rawStatus: result.status_text,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      pending: "pending",
      picked_up: "picked_up",
      in_transit: "in_transit",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
      returned: "returned",
      cancelled: "cancelled",
    };
    return statusMap[status] || "unknown";
  }
}
