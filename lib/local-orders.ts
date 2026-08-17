const storageKey = "cffk-local-orders";
const maxOrdersPerEmail = 50;

/** Non-sensitive order summary stored only in the buyer's current browser. */
export type LocalOrder = {
  orderNo: string;
  productName: string;
  amount: string;
  createdAt: string;
};

export type LocalOrderGroups = Record<string, LocalOrder[]>;

export function normalizeOrderEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getLocalOrderGroups(): LocalOrderGroups {
  return readLocalOrderGroups().groups;
}

export function getLocalOrders(): LocalOrder[] {
  return Object.values(getLocalOrderGroups()).flat();
}

export const getAllLocalOrders = getLocalOrders;

export function getLocalOrdersByEmail(email: string): LocalOrder[] {
  const normalizedEmail = normalizeOrderEmail(email);
  if (!normalizedEmail) return [];
  return getLocalOrderGroups()[normalizedEmail] ?? [];
}

export function saveGuestOrder(email: string, order: LocalOrder): boolean {
  const normalizedEmail = normalizeOrderEmail(email);
  const safeOrder = toLocalOrder(order);
  if (!normalizedEmail || !safeOrder) return false;

  const state = readLocalOrderGroups();
  if (!state.readable) return false;

  const existingOrders = state.groups[normalizedEmail] ?? [];
  const nextOrders = [
    safeOrder,
    ...existingOrders.filter((item) => item.orderNo !== safeOrder.orderNo),
  ].slice(0, maxOrdersPerEmail);

  return writeLocalOrderGroups({
    ...state.groups,
    [normalizedEmail]: nextOrders,
  });
}

/** Replaces one email group with a single localStorage write. */
export function replaceLocalOrdersForEmail(email: string, orders: LocalOrder[]): boolean {
  const normalizedEmail = normalizeOrderEmail(email);
  if (!normalizedEmail || !Array.isArray(orders)) return false;

  const state = readLocalOrderGroups();
  if (!state.readable) return false;

  const nextOrders = sanitizeOrders(orders);
  return writeLocalOrderGroups({
    ...state.groups,
    [normalizedEmail]: nextOrders,
  });
}

export function deleteLocalOrdersForEmail(email: string): boolean {
  const normalizedEmail = normalizeOrderEmail(email);
  if (!normalizedEmail) return false;

  const state = readLocalOrderGroups();
  if (!state.readable) return false;

  const entries = Object.entries(state.groups).filter(([groupEmail]) => groupEmail !== normalizedEmail);
  return writeLocalOrderGroups(Object.fromEntries(entries));
}

export function clearAllLocalOrders(): boolean {
  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

function readLocalOrderGroups(): { groups: LocalOrderGroups; readable: boolean } {
  try {
    const rawValue = localStorage.getItem(storageKey);
    if (rawValue === null) return { groups: {}, readable: true };

    const parsed: unknown = JSON.parse(rawValue);
    if (!isRecord(parsed) || Array.isArray(parsed)) return { groups: {}, readable: true };

    const groupedOrders = new Map<string, LocalOrder[]>();
    for (const [email, value] of Object.entries(parsed)) {
      const normalizedEmail = normalizeOrderEmail(email);
      if (!normalizedEmail || !Array.isArray(value)) continue;

      const existingOrders = groupedOrders.get(normalizedEmail) ?? [];
      groupedOrders.set(normalizedEmail, sanitizeOrders([...existingOrders, ...value]));
    }

    return { groups: Object.fromEntries(groupedOrders), readable: true };
  } catch {
    return { groups: {}, readable: false };
  }
}

function writeLocalOrderGroups(groups: LocalOrderGroups): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(groups));
    return true;
  } catch {
    // Private browsing or storage limits must not block checkout.
    return false;
  }
}

function sanitizeOrders(values: unknown[]): LocalOrder[] {
  const orders: LocalOrder[] = [];
  const orderNumbers = new Set<string>();

  for (const value of values) {
    const order = toLocalOrder(value);
    if (!order || orderNumbers.has(order.orderNo)) continue;
    orders.push(order);
    orderNumbers.add(order.orderNo);
    if (orders.length === maxOrdersPerEmail) break;
  }

  return orders;
}

function toLocalOrder(value: unknown): LocalOrder | null {
  if (!isRecord(value)) return null;

  const { orderNo, productName, amount, createdAt } = value;
  if (![orderNo, productName, amount, createdAt].every(isNonEmptyString)) return null;

  return {
    orderNo: orderNo as string,
    productName: productName as string,
    amount: amount as string,
    createdAt: createdAt as string,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
