import {
  acgCredentialsSchema,
  dujiaoNextCredentialsSchema,
  type SupplierProvider,
} from "../schema";
import { AcgAdapter } from "./acg";
import { AcgV311Adapter } from "./acg-v3.1.1";
import { DujiaoNextAdapter } from "./dujiao-next";
import type { SupplierAdapter } from "./types";

export function createSupplierAdapter(input: {
  provider: SupplierProvider;
  protocolVersion: string;
  baseUrl: string;
  credentials: unknown;
  currency: string;
  currencyDecimals: number;
  fetcher?: typeof fetch;
  now?: () => number;
}): SupplierAdapter {
  if (input.provider === "acg") {
    const credentials = acgCredentialsSchema.parse(input.credentials);
    if (input.protocolVersion === "acg_v3.1.2_plus") return new AcgAdapter({ ...input, ...credentials });
    if (input.protocolVersion === "acg_v3.1.1") return new AcgV311Adapter({ ...input, ...credentials });
    throw new Error("supplier_protocol_version_invalid");
  }
  if (input.protocolVersion !== "dujiao_next_v1") throw new Error("supplier_protocol_version_invalid");
  const credentials = dujiaoNextCredentialsSchema.parse(input.credentials);
  return new DujiaoNextAdapter({ ...input, ...credentials });
}
