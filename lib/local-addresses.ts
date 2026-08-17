const storageKey = "cffk-local-addresses";
const maxAddresses = 10;

export type LocalAddress = {
  id: string;
  recipientName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type AddressInput = Omit<LocalAddress, "id" | "createdAt" | "updatedAt">;

export function getLocalAddresses(): LocalAddress[] {
  return readAddresses();
}

export function clearLocalAddresses(): boolean {
  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export function saveLocalAddress(input: AddressInput): LocalAddress | null {
  const now = new Date().toISOString();
  const address: LocalAddress = {
    ...input,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };
  const addresses = readAddresses();
  const next = [
    ...(address.isDefault ? addresses.map((item) => ({ ...item, isDefault: false })) : addresses),
    address,
  ].slice(-maxAddresses);
  if (!address.isDefault && !next.some((item) => item.isDefault)) next[0] = { ...next[0], isDefault: true };
  return writeAddresses(next) ? address : null;
}

function readAddresses(): LocalAddress[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalAddress).slice(0, maxAddresses);
  } catch {
    return [];
  }
}

function writeAddresses(addresses: LocalAddress[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(addresses));
    return true;
  } catch {
    return false;
  }
}

function isLocalAddress(value: unknown): value is LocalAddress {
  if (!value || typeof value !== "object") return false;
  const address = value as Partial<LocalAddress>;
  return typeof address.id === "string"
    && typeof address.recipientName === "string"
    && typeof address.phone === "string"
    && typeof address.country === "string"
    && typeof address.province === "string"
    && typeof address.city === "string"
    && typeof address.district === "string"
    && typeof address.addressLine === "string"
    && (typeof address.postalCode === "string" || address.postalCode === null)
    && typeof address.isDefault === "boolean"
    && typeof address.createdAt === "string"
    && typeof address.updatedAt === "string";
}

function createId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
