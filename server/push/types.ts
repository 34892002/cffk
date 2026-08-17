export const pushChannels = ["EMAIL", "WECHAT", "TELEGRAM"] as const;
export const pushMessageTypes = ["NORMAL", "ADMIN"] as const;
export const pushScenes = [
  "TEST",
  "ORDER_PAID",
  "DELIVERY_SUCCESS",
  "DELIVERY_FAILED",
  "PAYMENT_EXCEPTION",
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "GUEST_ORDER_RECOVERY",
] as const;

export type PushChannel = (typeof pushChannels)[number];
export type PushMessageType = (typeof pushMessageTypes)[number];
export type PushScene = (typeof pushScenes)[number];
export type PushRecipient = { type: "CUSTOMER" | "ADMIN"; address: string };

export type PushDispatchInput = {
  scene: PushScene;
  messageType: PushMessageType;
  orderId?: number;
  variables: Record<string, string | number>;
  source: string;
  recipient?: PushRecipient;
  providerConfigId?: number;
};

export type PushDispatchResult = {
  channel: PushChannel;
  recipient: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  messageId?: string;
  reason?: string;
  retryScheduled?: boolean;
  terminal?: boolean;
};

export function pushDispatchHandled(result: PushDispatchResult) {
  return result.status === "SUCCESS" || result.status === "SKIPPED" || result.retryScheduled === true || result.terminal === true;
}
