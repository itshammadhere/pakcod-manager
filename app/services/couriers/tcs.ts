import type { CourierAdapter, CourierBookingData, CourierBookingResult, CourierTrackingResult } from "./base";

export class TCSAdapter implements CourierAdapter {
  name = "tcs";

  async book(data: CourierBookingData, config: any): Promise<CourierBookingResult> {
    try {
      const response = await fetch("https://devconnect.tcscourier.com/ecom/api/booking/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({
          consignment_order: String(data.orderNumber),
          consignment_name: data.customerName,
          consignment_phone: data.customerPhone,
          consignment_address: data.customerAddress,
          destination_city: data.customerCity,
          cod_amount: data.codAmount,
          weight: data.weight || 1000,
          pieces: data.pieces || 1,
        }),
      });

      const result = await response.json();

      if (result.message === "SUCCESS" && result.data?.cn_number) {
        return {
          success: true,
          trackingNumber: result.data.cn_number,
          label: result.data.label_url,
        };
      }

      return { success: false, error: result.message || "TCS booking failed" };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async track(trackingNumber: string, config: any): Promise<CourierTrackingResult | null> {
    try {
      const response = await fetch(
        `https://devconnect.tcscourier.com/ecom/api/tracking/${trackingNumber}`,
        {
          headers: { Authorization: `Bearer ${config.accessToken}` },
        }
      );

      const result = await response.json();

      if (result.message === "SUCCESS" && result.data) {
        return {
          trackingNumber,
          status: this.mapStatus(result.data.status),
          rawStatus: result.data.status,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private mapStatus(tcsStatus: string): string {
    const statusMap: Record<string, string> = {
      "PICKED UP": "picked_up",
      "IN TRANSIT": "in_transit",
      "OUT FOR DELIVERY": "out_for_delivery",
      DELIVERED: "delivered",
      "RETURN TO ORIGIN": "returned",
      CANCELLED: "cancelled",
    };
    return statusMap[tcsStatus] || "unknown";
  }
}
