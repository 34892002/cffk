import type { PaymentProviderKind, PaymentChannel } from "./registry";

export type AddressSnapshot = {
  version: 1;
  recipientName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;
};

export type PaymentAddressInput = Omit<AddressSnapshot, "version" | "postalCode"> & {
  postalCode?: string;
};

export type PaymentCreateInput = {
  productId: number;
  productSkuId: number;
  quantity: number;
  paymentProvider: PaymentProviderKind;
  paymentChannel?: PaymentChannel;
  contactType: "EMAIL" | "QQ" | "TELEGRAM" | "OTHER";
  contactValue?: string;
  buyerNote?: string;
  addressId?: number;
  address?: PaymentAddressInput;
  discountCode?: string;
};

export type PaymentResult = {
  mode: "redirect" | "qr";
  url?: string;
  qrCode?: string;
  paymentOrderNo?: string;
  payableAmount?: number;
};

export type PaymentCreateResult = {
  orderNo: string;
  amount: number;
  paymentStatus: "UNPAID" | "PAID";
  payment: PaymentResult | null;
};

export type PaymentQueryResult = PaymentNotifyResult & {
  provider: PaymentProviderKind;
};

export type PaymentNotifyResult = {
  provider: PaymentProviderKind;
  orderNo?: string;
  paymentOrderNo?: string;
  amount?: number;
  currency?: string;
  status: "PENDING" | "PAID" | "FAILED";
  verified: boolean;
  message: string;
};

export type PaymentAdapter = {
  create(input: { orderNo: string; amount: number; subject: string; notifyUrl: string; returnUrl: string; channel?: PaymentChannel }): Promise<PaymentResult>;
  verify(input: { payload: Record<string, string>; rawBody?: string; rawBodyBytes?: Uint8Array; headers?: Headers }): Promise<PaymentNotifyResult>;
  query?(input: { orderNo: string; paymentOrderNo?: string; amount: number }): Promise<PaymentQueryResult>;
};
