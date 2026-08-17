import { pinyin } from "pinyin-pro";

export function slugify(value: string) {
  return pinyin(value, { toneType: "none", nonZh: "consecutive" })
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
