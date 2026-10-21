// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
import enUS from "../../lib/i18n/en-US.ts";
import zhCN from "../../lib/i18n/zh-CN.ts";
import zhTW from "../../lib/i18n/zh-TW.ts";
import { enUSErrorMessages } from "../../lib/i18n/error-messages/en-US.ts";
import { zhCNErrorMessages } from "../../lib/i18n/error-messages/zh-CN.ts";
import { zhTWErrorMessages } from "../../lib/i18n/error-messages/zh-TW.ts";
import { parseEmailTemplateConfig } from "../../lib/config-schemas.ts";

// Common simplified-only characters used by this project. Traditional text must
// never contain them; the guard is intentionally a curated list so the test has
// no language-data dependency.
const simplifiedOnlyCharacters = "试货询处营销杂责团贴锁们为会发变单买卖户钱额库检验订计设联网邮递选费转达过进时显无条来现电产类级组经结统续编给罗职胜脑脚艺节获补装复规认议证说请读谢购资载输边运远连页项须预风马双语样点热开关门问题长错键钟应广庆务动劳势区医华协办与业个乐书乡仅从传伤价众优体余侧偿儿关兴养内册写冲决况冻净凭删别剂历压叶号员图场块坏备够头奖奥妇妈学宁实审对导岁届属岗币帮废异张强归当录径忆怀态总恶惊执扩扫扬损拥择挂换摇摄数断暂术机权极构档检楼欢气汉沟没测满灭灯炼爱爷环画畅疗监码础确礼离称积税稳穷签简粮纷细终继绩络绝缓罚联肠脸脱范蓝虑虚虽觉触讨让评识该详误调贝赞赶轮轻较遗释鉴闭阅队际难顶顺领饰饼驾鱼鸡黄";

const cjkOrJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function leafEntries(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (!value || typeof value !== "object") return [[prefix, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => leafEntries(item, prefix ? `${prefix}.${key}` : key));
}

function leafKeys(value: unknown) {
  return leafEntries(value).map(([key]) => key).sort();
}

function leafStrings(value: unknown) {
  return leafEntries(value)
    .map(([, item]) => item)
    .filter((item): item is string => typeof item === "string");
}

function simplifiedCharactersIn(value: unknown) {
  return [...new Set(leafStrings(value).flatMap((text) => [...text].filter((character) => simplifiedOnlyCharacters.includes(character))))];
}

function cjkTextsIn(value: unknown) {
  return leafStrings(value).filter((text) => cjkOrJapanese.test(text));
}

describe("storefront dictionaries", () => {
  test("every locale defines the same keys", () => {
    expect(leafKeys(enUS)).toEqual(leafKeys(zhCN));
    expect(leafKeys(zhTW)).toEqual(leafKeys(zhCN));
  });

  test("English only contains English", () => {
    expect(cjkTextsIn(enUS)).toEqual([]);
  });

  test("Traditional Chinese has no simplified characters left", () => {
    expect(simplifiedCharactersIn(zhTW)).toEqual([]);
  });

  test("placeholders stay identical across locales", () => {
    const placeholders = (value: unknown) =>
      Object.fromEntries(
        leafEntries(value).map(([key, item]) => [key, typeof item === "string" ? [...item.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort() : []]),
      );
    expect(placeholders(enUS)).toEqual(placeholders(zhCN));
    expect(placeholders(zhTW)).toEqual(placeholders(zhCN));
  });
});

describe("error message dictionaries", () => {
  test("every locale defines the same codes", () => {
    expect(Object.keys(enUSErrorMessages).sort()).toEqual(Object.keys(zhCNErrorMessages).sort());
    expect(Object.keys(zhTWErrorMessages).sort()).toEqual(Object.keys(zhCNErrorMessages).sort());
  });

  test("English error messages only contain English", () => {
    expect(cjkTextsIn(enUSErrorMessages)).toEqual([]);
  });

  test("Traditional error messages have no simplified characters left", () => {
    expect(simplifiedCharactersIn(zhTWErrorMessages)).toEqual([]);
  });
});

describe("email template translations", () => {
  const legacyTemplate = JSON.stringify({ subject: "[{{siteName}}] Hello", body: "Body {{actionUrl}}", format: "text", variables: ["siteName", "actionUrl"] });

  test("accepts templates without translations", () => {
    expect(parseEmailTemplateConfig(legacyTemplate).translations).toBeUndefined();
  });

  test("keeps localized content", () => {
    const config = parseEmailTemplateConfig(JSON.stringify({
      ...JSON.parse(legacyTemplate),
      translations: { "en-US": { subject: "Hello", body: "Body" }, "zh-TW": { subject: "您好", body: "內容" } },
    }));
    expect(config.translations?.["en-US"]).toEqual({ subject: "Hello", body: "Body" });
    expect(config.translations?.["zh-TW"]).toEqual({ subject: "您好", body: "內容" });
  });

  test("rejects unsupported locales", () => {
    expect(() => parseEmailTemplateConfig(JSON.stringify({ ...JSON.parse(legacyTemplate), translations: { "fr-FR": { subject: "x", body: "y" } } }))).toThrow();
  });

  test("rejects incomplete translations", () => {
    expect(() => parseEmailTemplateConfig(JSON.stringify({ ...JSON.parse(legacyTemplate), translations: { "en-US": { subject: "x", body: "" } } }))).toThrow();
  });
});
