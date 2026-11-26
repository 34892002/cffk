import { appError } from "@/lib/app-error";
import * as xss from "xss";

export const PRODUCT_DESCRIPTION_LIMITS = {
  rawHtml: 100_000,
  cleanHtml: 80_000,
  url: 2_048,
  attribute: 500,
} as const;

const whiteList = {
  p: [],
  br: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  s: [],
  del: [],
  strike: [],
  code: ["class"],
  pre: [],
  blockquote: [],
  ul: [],
  ol: [],
  li: [],
  a: ["href", "title"],
  img: ["src", "alt", "title"],
  hr: [],
  span: ["style"],
  mark: ["style", "data-color"],
};

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeColor(value: string) {
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^rgba\((?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(?:0|1|0?\.\d+|1\.0+)\s*\)$/i.test(color)) return color;
  return null;
}

function safeUrl(value: string, image: boolean) {
  const url = value.trim();
  if (!url || url.length > PRODUCT_DESCRIPTION_LIMITS.url) return null;
  for (const character of url) {
    if (character.charCodeAt(0) < 32) return null;
  }
  if (image) {
    if (url.startsWith("/media/proxy/")) return url;
    return /^https?:\/\//i.test(url) ? url : null;
  }
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  // Root-relative only: `//host` is protocol-relative and would leave the site.
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}

const sanitizer = new xss.FilterXSS({
  whiteList,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "form"],
  allowCommentTag: false,
  css: {
    whiteList: {
      color: true,
      "background-color": true,
      "font-weight": true,
      "font-style": true,
      "text-decoration": true,
    },
  },
  onTagAttr(tag: string, name: string, value: string, isWhiteAttr: boolean) {
    if (!isWhiteAttr) return;
    if (tag === "a" && name === "href") {
      const url = safeUrl(value, false);
      // `onTagAttr` output is inserted as-is, so escape the URL ourselves.
      return url ? `href="${escapeAttribute(url)}" rel="noopener noreferrer" target="_blank"` : "";
    }
    if (tag === "img" && name === "src") {
      const url = safeUrl(value, true);
      return url ? `src="${escapeAttribute(url)}"` : "";
    }
    if (tag === "code" && name === "class") {
      const className = value.trim();
      return /^language-[a-z0-9_-]{1,32}$/i.test(className) ? `class="${escapeAttribute(className)}"` : "";
    }
    if (tag === "mark" && name === "data-color") {
      const color = safeColor(value);
      return color ? `data-color="${escapeAttribute(color)}"` : "";
    }
    if (value.length > PRODUCT_DESCRIPTION_LIMITS.attribute) return "";
  },
});

export function sanitizeProductDescription(html: string): string | null {
  if (typeof html !== "string" || html.length > PRODUCT_DESCRIPTION_LIMITS.rawHtml) appError("PRODUCT_DESCRIPTION_TOO_LONG");
  const output = sanitizer
    .process(html)
    // Drop images whose src was rejected; an empty <img> only renders a broken icon.
    .replace(/<img\b[^>]*>/gi, (tag) => (/\bsrc\s*=/i.test(tag) ? tag : ""))
    .trim();
  if (output.length > PRODUCT_DESCRIPTION_LIMITS.cleanHtml) appError("PRODUCT_DESCRIPTION_TOO_LONG");
  return output || null;
}