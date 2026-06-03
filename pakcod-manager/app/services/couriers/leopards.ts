import type { CourierAdapter, CourierBookingData, CourierBookingResult, CourierTrackingResult } from "./base";

const LEOPARDS_API = "https://new.leopardscod.com/api/v1";

export class LeopardsAdapter implements CourierAdapter {
  name = "leopards";

  async authToken(config: any): Promise<string | null> {
    try {
      const response = await fetch(`${LEOPARDS_API}/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: config.apiKey,
          api_password: config.apiPassword,
        }),
      });
      const data = await response.json();
      return data.token || null;
    } catch {
      return null;
    }
  }

  async book(data: CourierBookingData, config: any): Promise<CourierBookingResult> {
    try {
      const payload: any = {
        booked_packet_weight: data.weight || 500,
        booked_packet_no_piece: data.pieces || 1,
        booked_packet_collect_amount: data.codAmount,
        booked_packet_order_id: String(data.orderNumber),
        origin_city: config.originCity || "self",
        destination_city: data.customerCity,
        shipment_name_eng: config.shipperName || "self",
        shipment_email: config.shipperEmail || "self",
        shipment_phone: config.shipperPhone || "self",
        shipment_address: config.shipperAddress || "self",
        consignment_name_eng: data.customerName,
        consignment_phone: data.customerPhone,
        consignment_address: data.customerAddress,
      };

      const response = await fetch(`${LEOPARDS_API}/booking/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? {
            "API-Key": config.apiKey,
            "API-Password": config.apiPassword,
          } : {}),
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.cn_number || result.tracking_number) {
        return {
          success: true,
          trackingNumber: result.cn_number || result.tracking_number,
          label: result.label_url,
        };
      }

      return { success: false, error: result.message || "Leopards booking failed" };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async track(trackingNumber: string, config: any): Promise<CourierTrackingResult | null> {
    try {
      const response = await fetch(
        `${LEOPARDS_API}/tracking/${trackingNumber}`,
        {
          headers: {
            "API-Key": config.apiKey || "",
            "API-Password": config.apiPassword || "",
          },
        }
      );

      const result = await response.json();

      if (result.status) {
        return {
          trackingNumber,
          status: this.mapStatus(result.status),
          statusDate: result.date ? new Date(result.date) : undefined,
          rawStatus: result.status_text,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private mapStatus(status: string): string {
    const map: Record<string, string> = {
      "Booked": "pending",
      "Picked": "picked_up",
      "In-Transit": "in_transit",
      "Out for Delivery": "out_for_delivery",
      "Delivered": "delivered",
      "RTO": "returned",
      "Cancelled": "cancelled",
    };
    return map[status] || "unknown";
  }
}
