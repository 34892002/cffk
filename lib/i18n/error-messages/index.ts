import type { StorefrontLocale } from "@/lib/storefront-preferences";
import { enUSErrorMessages } from "./en-US";
import { zhCNErrorMessages } from "./zh-CN";
import { zhTWErrorMessages } from "./zh-TW";

export const errorMessagesByLocale: Record<StorefrontLocale, Record<string, string>> = {
  "zh-CN": zhCNErrorMessages,
  "en-US": enUSErrorMessages,
  "zh-TW": zhTWErrorMessages,
};
