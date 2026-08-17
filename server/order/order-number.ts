export function generateOrderNo() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `ORD${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
