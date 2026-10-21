// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { Database } from "bun:sqlite";
import { applyMigrationFiles, listMigrationFiles } from "../helpers/sqlite-d1.ts";

const migrationsBeforeLocale = listMigrationFiles().filter((name) => name < "0004");
const localeMigration = listMigrationFiles().find((name) => name.startsWith("0004"));

function insertTemplate(sqlite: Database, scene: string, name: string, template: unknown) {
  sqlite
    .query("INSERT INTO emailTemplate (scene, name, templateJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
    .run(scene, name, typeof template === "string" ? template : JSON.stringify(template), Date.now(), Date.now());
}

describe("order locale migration", () => {
  test("adds translations without touching customized templates", () => {
    const sqlite = new Database(":memory:");
    applyMigrationFiles(sqlite, migrationsBeforeLocale);
    insertTemplate(sqlite, "ORDER_PAID", "我的自定义模板", {
      subject: "自定义标题 {{orderNo}}",
      body: "自定义正文 {{siteName}}",
      format: "text",
      variables: ["siteName", "orderNo"],
    });
    insertTemplate(sqlite, "DELIVERY_SUCCESS", "已有多语模板", {
      subject: "自定义发货",
      body: "正文",
      format: "text",
      variables: [],
      translations: { "en-US": { subject: "Custom delivered", body: "Custom body" } },
    });

    applyMigrationFiles(sqlite, [localeMigration!]);

    const rows = sqlite.query("SELECT scene, name, templateJson FROM emailTemplate ORDER BY scene").all() as Array<{ scene: string; name: string; templateJson: string }>;
    const paidRow = rows.find((row) => row.scene === "ORDER_PAID")!;
    const paid = JSON.parse(paidRow.templateJson);
    expect(paidRow.name).toBe("我的自定义模板");
    expect(paid.subject).toBe("自定义标题 {{orderNo}}");
    expect(paid.body).toBe("自定义正文 {{siteName}}");
    expect(paid.variables).toEqual(["siteName", "orderNo"]);
    expect(paid.translations["en-US"].subject).toBe("[{{siteName}}] Order {{orderNo}} paid");

    const delivered = JSON.parse(rows.find((row) => row.scene === "DELIVERY_SUCCESS")!.templateJson);
    expect(delivered.subject).toBe("自定义发货");
    expect(delivered.translations).toEqual({ "en-US": { subject: "Custom delivered", body: "Custom body" } });

    expect(sqlite.query("PRAGMA table_info(`order`)").all().some((column) => (column as { name?: string }).name === "locale")).toBe(true);
    sqlite.close();
  });

  test("skips malformed template JSON instead of failing the migration", () => {
    const sqlite = new Database(":memory:");
    applyMigrationFiles(sqlite, migrationsBeforeLocale);
    insertTemplate(sqlite, "ORDER_PAID", "坏模板", "{not json");

    expect(() => applyMigrationFiles(sqlite, [localeMigration!])).not.toThrow();
    const row = sqlite.query("SELECT templateJson FROM emailTemplate WHERE scene = 'ORDER_PAID'").get() as { templateJson: string };
    expect(row.templateJson).toBe("{not json");
    sqlite.close();
  });
});
