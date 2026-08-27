import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { AcgV311Adapter } from "../server/supplier/providers/acg-v3.1.1";
import { signAcgForm } from "../server/supplier/providers/signatures";

const accountName = process.argv[2] ?? "二次元旧版";
const account = loadAccount(accountName);
const adapter = new AcgV311Adapter({
  baseUrl: account.baseUrl.replace(/\/$/, ""),
  apiId: account.apiId,
  appKey: account.appKey,
  currency: "CNY",
  currencyDecimals: 2,
});
const baseUrl = account.baseUrl.replace(/\/$/, "");
const requestData = { app_id: account.apiId };
const form = new URLSearchParams(requestData);
form.set("sign", signAcgForm(requestData, account.appKey));
const response = await fetch(`${baseUrl}/shared/commodity/items`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
  body: form.toString(),
});
const bytes = new Uint8Array(await response.arrayBuffer());
console.log("Raw upstream response summary:");
console.log(`POST ${baseUrl}/shared/commodity/items`);
console.log(`HTTP ${response.status} ${response.statusText}`);
console.log(`content-type: ${response.headers.get("content-type") ?? "(missing)"}`);
console.log(`content-length: ${response.headers.get("content-length") ?? "(missing)"}`);
console.log(`actual bytes: ${bytes.byteLength}`);

try {
  const body = JSON.parse(new TextDecoder().decode(bytes)) as { code?: unknown; msg?: unknown; data?: unknown };
  console.log(JSON.stringify({
    code: body.code,
    msg: body.msg,
    categories: Array.isArray(body.data) ? body.data.length : undefined,
    leafProducts: Array.isArray(body.data) ? countLeafProducts(body.data) : undefined,
  }, null, 2));
  console.log("\nCFFK adapter page 1:");
  console.log(JSON.stringify(await adapter.listProducts({ page: 1, pageSize: 3 }), null, 2));
} catch {
  console.log("Response body is not valid JSON");
}

function countLeafProducts(nodes: unknown[]): number {
  return nodes.reduce<number>((count, node) => {
    if (!node || typeof node !== "object") return count;
    const children = (node as { children?: unknown }).children;
    return count + (Array.isArray(children) && children.length ? countLeafProducts(children) : 1);
  }, 0);
}

function loadAccount(name: string) {
  const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  for (const file of readdirSync(directory).filter((item) => item.endsWith(".sqlite") && item !== "metadata.sqlite")) {
    const database = new Database(join(directory, file), { readonly: true });
    try {
      const row = database.query("SELECT baseUrl, credentialsJson FROM supplierAccount WHERE name = ? AND provider = 'acg' AND protocolVersion = 'acg_v3.1.1' LIMIT 1").get(name) as { baseUrl: string; credentialsJson: string } | null;
      if (!row) continue;
      const credentials = JSON.parse(row.credentialsJson) as { apiId?: string; appKey?: string };
      if (!credentials.apiId || !credentials.appKey) throw new Error("账户缺少 apiId 或 appKey");
      return { baseUrl: row.baseUrl, apiId: credentials.apiId, appKey: credentials.appKey };
    } finally {
      database.close();
    }
  }
  throw new Error(`未找到旧版 ACG 账户：${name}`);
}
