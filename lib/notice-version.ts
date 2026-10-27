/**
 * Stable, non-cryptographic version used to detect whether a visitor has
 * already dismissed the current notice. MD5 is unnecessary here: the cookie
 * only needs change detection, not tamper resistance.
 */
export function noticeVersion(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
