import { unstable_dev } from "wrangler";

const worker = await unstable_dev("scripts/smtp-probe.worker.ts", {
  local: true,
  persist: true,
  persistTo: ".wrangler/state/v3",
  compatibilityDate: "2026-03-12",
  compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
  experimental: {
    d1Databases: [{ binding: "DB", database_name: "cffk_db", database_id: "local" }],
    disableExperimentalWarning: true,
    disableDevRegistry: true,
    watch: false,
  },
  logLevel: "error",
});

try {
  const response = await worker.fetch("http://localhost/");
  console.log(response.status, await response.text());
} finally {
  await worker.stop();
}
