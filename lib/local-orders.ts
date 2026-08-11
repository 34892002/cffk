/** Order credentials stored only in the buyer's current browser. */
const storageKey = "cffk-local-orders";
const maxOrders = 50;

export type LocalOrder = {
  orderNo: string;
  queryToken: string;
  productName: string;
  amount: string;
  createdAt: string;
};

export function getLocalOrders(): LocalOrder[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(isLocalOrder).slice(0, maxOrders)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalOrder(order: LocalOrder) {
  try {
    const orders = getLocalOrders().filter((item) => item.orderNo !== order.orderNo);
    orders.unshift(order);
    localStorage.setItem(storageKey, JSON.stringify(orders.slice(0, maxOrders)));
  } catch {
    // Private browsing or storage limits must not block checkout.
  }
}

function isLocalOrder(value: unknown): value is LocalOrder {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["orderNo", "queryToken", "productName", "amount", "createdAt"].every((key) => typeof record[key] === "string" && record[key].trim());
}
