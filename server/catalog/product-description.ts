import { appError } from "@/lib/app-error";

export const PRODUCT_DESCRIPTION_LIMITS = {
  rawHtml: 100_000,
  cleanHtml: 80_000,
  url: 2_048,
  attribute: 500,
} as const;

const allowedTags = new Set(["p", "br", "h2", "h3", "strong", "em", "blockquote", "ul", "ol", "li", "a", "img", "hr"]);
const voidTags = new Set(["br", "img", "hr"]);
const dangerousBlocks = /<(script|style|iframe|object|embed|form)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi;
const tagPattern = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi;
const attributePattern = /\s+([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi;

function safeUrl(value: string, image: boolean) {
  const url = value.trim();
  if (!url || url.length > PRODUCT_DESCRIPTION_LIMITS.url || [...url].some((character) => character.charCodeAt(0) < 32)) return null;
  if (image) {
    if (url.startsWith("/media/proxy/")) return url;
    try { const parsed = new URL(url); return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null; } catch { return null; }
  }
  try {
    const parsed = new URL(url, "https://invalid.local");
    if (["http:", "https:", "mailto:"].includes(parsed.protocol) && (url.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(url))) return url;
  } catch { /* invalid URL */ }
  return null;
}

function attributes(tag: string, name: string) {
  const match = tag.match(/^<[a-z][^>]*>/i);
  if (!match) return "";
  const result: string[] = [];
  const source = match[0].slice(1, -1);
  const attributeSource = source.slice(name.length);
  attributePattern.lastIndex = 0;
  let item: RegExpExecArray | null;
  while ((item = attributePattern.exec(attributeSource))) {
    const key = item[1].toLowerCase();
    const value = item[2] ?? item[3] ?? item[4] ?? "";
    if (value.length > PRODUCT_DESCRIPTION_LIMITS.attribute) continue;
    if (name === "a" && key === "href") { const url = safeUrl(value, false); if (url) result.push(` href="${escapeAttribute(url)}"`); }
    if (name === "img" && (key === "src" || key === "alt" || key === "title")) {
      const normalized = key === "src" ? safeUrl(value, true) : value.trim();
      if (normalized) result.push(` ${key}="${escapeAttribute(normalized)}"`);
    }
  }
  if (name === "img" && !result.some((value) => value.startsWith(" src="))) return "";
  if (name === "a" && result.some((value) => value.startsWith(" href="))) result.push(' rel="noopener noreferrer" target="_blank"');
  return result.join("");
}

function escapeAttribute(value: string) { return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export function sanitizeProductDescription(html: string): string | null {
  if (typeof html !== "string" || html.length > PRODUCT_DESCRIPTION_LIMITS.rawHtml) appError("PRODUCT_DESCRIPTION_TOO_LONG");
  const source = html.replace(dangerousBlocks, "");
  const output = source.replace(tagPattern, (raw) => {
    const closing = /^<\//.test(raw);
    const nameMatch = raw.match(/^<\/?\s*([a-z0-9]+)/i);
    const name = nameMatch?.[1]?.toLowerCase();
    if (!name || !allowedTags.has(name)) return "";
    if (closing) return `</${name}>`;
    if (voidTags.has(name)) {
      const cleanedAttributes = attributes(raw, name);
      return cleanedAttributes || name !== "img" ? `<${name}${cleanedAttributes}>` : "";
    }
    return `<${name}${attributes(raw, name)}>`;
  }).trim();
  if (output.length > PRODUCT_DESCRIPTION_LIMITS.cleanHtml) appError("PRODUCT_DESCRIPTION_TOO_LONG");
  return output.replace(/<((?:p|h2|h3|blockquote|ul|ol|li|a|strong|em|img|hr|br)(?:\s[^>]*)?)>\s*<\/\1>/gi, "") || null;
}
