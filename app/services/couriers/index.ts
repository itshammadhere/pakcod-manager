import type { CourierAdapter, CourierBookingData } from "./base";
import { TCSAdapter } from "./tcs";
import { WeShipAdapter } from "./weship";
import { LeopardsAdapter } from "./leopards";

const adapters: Record<string, CourierAdapter> = {
  tcs: new TCSAdapter(),
  weship: new WeShipAdapter(),
  leopards: new LeopardsAdapter(),
};

export function getCourierAdapter(name: string): CourierAdapter | undefined {
  return adapters[name];
}

export function getRegisteredCouriers(): { name: string; label: string }[] {
  return [
    { name: "tcs", label: "TCS" },
    { name: "leopards", label: "Leopards" },
    { name: "trax", label: "Trax" },
    { name: "mandp", label: "M&P" },
    { name: "blueex", label: "BlueEx" },
    { name: "weship", label: "WeShip (Aggregator)" },
  ];
}

export async function bookShipment(
  courierName: string,
  data: CourierBookingData,
  config: any
) {
  const adapter = getCourierAdapter(courierName);
  if (!adapter) {
    return { success: false, error: `Unsupported courier: ${courierName}` };
  }
  return adapter.book(data, config);
}

export async function trackShipment(
  courierName: string,
  trackingNumber: string,
  config: any
) {
  const adapter = getCourierAdapter(courierName);
  if (!adapter) return null;
  return adapter.track(trackingNumber, config);
}
