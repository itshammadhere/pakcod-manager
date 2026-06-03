export interface CourierBookingData {
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  codAmount: number;
  weight?: number;
  pieces?: number;
  specialInstructions?: string;
  courier?: string;
}

export interface CourierTrackingResult {
  trackingNumber: string;
  status: string;
  statusDate?: Date;
  rawStatus?: string;
}

export interface CourierBookingResult {
  success: boolean;
  trackingNumber?: string;
  label?: string;
  error?: string;
}

export interface CourierAdapter {
  name: string;
  book(data: CourierBookingData, config: any): Promise<CourierBookingResult>;
  track(trackingNumber: string, config: any): Promise<CourierTrackingResult | null>;
  cancel?(trackingNumber: string, config: any): Promise<boolean>;
}
