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
    supportContact: "TG互助群|https://t.me/example",
    footerText: "中文页脚",
    orderNotice: "中文提示",
    headCode: null,
    footerCode: null,
    translationsJson: JSON.stringify({ "en-US": { subtitle: "EN subtitle", notice: "EN notice", supportContact: "Telegram support|https://t.me/example" } }),
    registrationEnabled: false,
    timezone: "Asia/Shanghai",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  test("ships every locale and falls back per field", () => {
    const site = toPublicSiteSettings(record);
    expect(site.subtitle["en-US"]).toBe("EN subtitle");
    expect(site.subtitle["zh-CN"]).toBe("中文副标题");
    expect(site.subtitle["zh-TW"]).toBe("中文副标题");
    expect(site.notice["en-US"]).toBe("EN notice");
    expect(site.supportContact["en-US"]).toBe("Telegram support|https://t.me/example");
    expect(site.supportContact["zh-CN"]).toBe("TG互助群|https://t.me/example");
    expect(site.footerText["en-US"]).toBe("中文页脚");
    expect(site.orderNotice["en-US"]).toBe("中文提示");
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
    context.sqlite.query("INSERT INTO productSku (productId, name, price, status, deliveryType, fixedDeliveryContent, minBuy, maxBuy, sort, translationsJson, createdAt, updatedAt) VALUES (?, 'Default', 1000, 'ACTIVE', 'FIXED_CARD', 'KEY', 1, 1, 0, ?, ?, ?)")
      .run(product.id, JSON.stringify({ "en-US": { name: "Default EN" } }), now, now);
    return context;
  }

  test("ships localized names, subtitles, descriptions and categories", async () => {
    const context = seed();
    const catalog = await getPublicCatalog(context.database);
    expect(catalog.categories.map((item) => item.name)).toEqual([
      { "zh-CN": "卡密分类", "zh-TW": "卡密分类", "en-US": "Cards EN" },
    ]);
    expect(catalog.products[0]).toMatchObject({
      name: { "zh-CN": "卡密商品", "zh-TW": "卡密商品", "en-US": "Card EN" },
      subtitle: { "zh-CN": "中文副标题", "zh-TW": "中文副标题", "en-US": "Sub EN" },
      categoryName: { "zh-CN": "卡密分类", "zh-TW": "卡密分类", "en-US": "Cards EN" },
    });

    const detail = await getPublicProductDetail(context.database, "card");
    expect(detail).toMatchObject({
      name: { "zh-CN": "卡密商品", "en-US": "Card EN" },
      subtitle: { "zh-CN": "中文副标题", "en-US": "Sub EN" },
      description: { "zh-CN": "<p>中文详情</p>", "en-US": "<p>EN details</p>" },
      categoryName: { "zh-CN": "卡密分类", "en-US": "Cards EN" },
    });
    expect(detail?.skus[0]?.name).toEqual({ "zh-CN": "Default", "zh-TW": "Default", "en-US": "Default EN" });
  });

  test("falls back to the base content", async () => {
    const context = seed();
    const catalog = await getPublicCatalog(context.database);
    expect(catalog.products[0]?.name["zh-TW"]).toBe("卡密商品");

    const detail = await getPublicProductDetail(context.database, "card");
    expect(detail?.name["zh-TW"]).toBe("卡密商品");
    expect(detail?.skus[0]?.name["zh-TW"]).toBe("Default");
  });
});
