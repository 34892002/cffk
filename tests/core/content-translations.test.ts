// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { afterEach, describe, expect, test } from "bun:test";
import { localizeContentText, readContentTranslations, serializeContentTranslations } from "../../lib/content-translations.ts";
import { getPublicCatalog, getPublicProductDetail } from "../../server/catalog/public.ts";
import { toPublicSiteSettings } from "../../server/site/public-settings.ts";
import { createTestDatabase } from "../helpers/sqlite-d1.ts";

const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  while (databases.length) databases.pop()!.close();
});

describe("content translations", () => {
  test("reads only known locales and fields", () => {
    const translations = readContentTranslations(JSON.stringify({
      "en-US": { name: " Card ", unknown: "drop", subtitle: "" },
      "fr-FR": { name: "Carte" },
      "zh-TW": { name: "卡密" },
    }), ["name", "subtitle"]);
    expect(translations).toEqual({ "en-US": { name: "Card" }, "zh-TW": { name: "卡密" } });
  });

  test("ignores malformed stored JSON", () => {
    expect(readContentTranslations("{not json", ["name"])).toEqual({});
    expect(readContentTranslations(null, ["name"])).toEqual({});
  });

  test("falls back field by field", () => {
    const translations = readContentTranslations(JSON.stringify({ "en-US": { name: "Card" } }), ["name", "subtitle"]);
    expect(localizeContentText("卡密", translations, "en-US", "name")).toBe("Card");
    expect(localizeContentText("副标题", translations, "en-US", "subtitle")).toBe("副标题");
    expect(localizeContentText("卡密", translations, "zh-CN", "name")).toBe("卡密");
    expect(localizeContentText("卡密", translations, "zh-TW", "name")).toBe("卡密");
  });

  test("drops empty locales when serializing", () => {
    expect(serializeContentTranslations({ "en-US": { name: " " }, "zh-TW": { name: "" } }, ["name"])).toBeNull();
    expect(serializeContentTranslations({ "en-US": { name: "Card" } }, ["name"])).toBe(JSON.stringify({ "en-US": { name: "Card" } }));
  });
});

describe("localized site settings", () => {
  const record = {
    id: 1,
    siteName: "Shop",
    siteUrl: null,
    siteSubtitle: "中文副标题",
    logo: null,
    logoIcon: null,
    notice: "中文公告",
    supportContact: null,
    footerText: "中文页脚",
    orderNotice: "中文提示",
    headCode: null,
    footerCode: null,
    translationsJson: JSON.stringify({ "en-US": { subtitle: "EN subtitle", notice: "EN notice" } }),
    registrationEnabled: false,
    timezone: "Asia/Shanghai",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  test("uses the translated values and falls back per field", () => {
    const en = toPublicSiteSettings(record, "en-US");
    expect(en.subtitle).toBe("EN subtitle");
    expect(en.notice).toBe("EN notice");
    expect(en.footerText).toBe("中文页脚");
    expect(en.orderNotice).toBe("中文提示");
  });

  test("keeps the base content for Chinese and untranslated locales", () => {
    expect(toPublicSiteSettings(record, "zh-CN").subtitle).toBe("中文副标题");
    expect(toPublicSiteSettings(record, "zh-TW").subtitle).toBe("中文副标题");
  });
});

describe("localized catalog", () => {
  function seed() {
    const context = createTestDatabase();
    databases.push(context);
    const now = Date.now();
    context.sqlite.query("INSERT INTO category (name, slug, status, sort, translationsJson, createdAt, updatedAt) VALUES (?, ?, 'ACTIVE', 0, ?, ?, ?)")
      .run("卡密分类", "cards", JSON.stringify({ "en-US": { name: "Cards EN", description: "Category EN" } }), now, now);
    const category = context.sqlite.query("SELECT id FROM category WHERE slug = 'cards'").get() as { id: number };
    context.sqlite.query("INSERT INTO product_v2 (categoryId, name, slug, subtitle, description, status, sort, translationsJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?, ?)")
      .run(category.id, "卡密商品", "card", "中文副标题", "<p>中文详情</p>", JSON.stringify({ "en-US": { name: "Card EN", subtitle: "Sub EN", description: "<p>EN details</p>" } }), now, now);
    const product = context.sqlite.query("SELECT id FROM product_v2 WHERE slug = 'card'").get() as { id: number };
    context.sqlite.query("INSERT INTO productSku (productId, name, price, status, deliveryType, fixedDeliveryContent, minBuy, maxBuy, sort, createdAt, updatedAt) VALUES (?, 'Default', 1000, 'ACTIVE', 'FIXED_CARD', 'KEY', 1, 1, 0, ?, ?)")
      .run(product.id, now, now);
    return context;
  }

  test("localizes names, subtitles, descriptions and category names", async () => {
    const context = seed();
    const catalog = await getPublicCatalog(context.database, "en-US");
    expect(catalog.categories.map((item) => item.name)).toEqual(["Cards EN"]);
    expect(catalog.products[0]).toMatchObject({ name: "Card EN", subtitle: "Sub EN", categoryName: "Cards EN" });

    const detail = await getPublicProductDetail(context.database, "card", "en-US");
    expect(detail).toMatchObject({ name: "Card EN", subtitle: "Sub EN", description: "<p>EN details</p>", categoryName: "Cards EN" });
  });

  test("falls back to the base content", async () => {
    const context = seed();
    const catalog = await getPublicCatalog(context.database, "zh-CN");
    expect(catalog.categories.map((item) => item.name)).toEqual(["卡密分类"]);
    expect(catalog.products[0]).toMatchObject({ name: "卡密商品", subtitle: "中文副标题", categoryName: "卡密分类" });

    const detail = await getPublicProductDetail(context.database, "card", "zh-TW");
    expect(detail).toMatchObject({ name: "卡密商品", description: "<p>中文详情</p>" });
  });
});
