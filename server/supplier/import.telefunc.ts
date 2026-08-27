import { telefuncAction } from "@/server/telefunc-action";
import { appError } from "@/lib/app-error";
import { supplierProviderSchema, supplierProtocolVersionSchema } from "./schema";
import { fetchSupplierCatalog } from "./catalog";
import { importSupplierProduct, switchSupplierBinding } from "./import";
import { requireAdmin } from "@/server/telefunc-context";

function readSourceInput(input: unknown) {
  if (!input || typeof input !== "object") appError("SUPPLIER_IMPORT_INPUT_INVALID");
  const value = input as Record<string, unknown>;
  const provider = supplierProviderSchema.safeParse(value.provider);
  const normalizedApiOrigin = typeof value.normalizedApiOrigin === "string" ? value.normalizedApiOrigin.trim() : "";
  const protocolVersion = supplierProtocolVersionSchema.safeParse(value.protocolVersion);
  if (!provider.success || !protocolVersion.success || !normalizedApiOrigin) appError("SUPPLIER_IMPORT_INPUT_INVALID");
  return { value, provider: provider.data, normalizedApiOrigin, protocolVersion: protocolVersion.data };
}

export const onImportSupplierProduct = telefuncAction(async (input: unknown) => {
  const { db } = requireAdmin();
  const { value, provider, normalizedApiOrigin, protocolVersion } = readSourceInput(input);
  const productId = typeof value.productId === "string" ? value.productId : "";
  const skuIds = Array.isArray(value.skuIds) && value.skuIds.every((id) => typeof id === "string") ? value.skuIds : [];
  const fixedMarkupMinor = typeof value.fixedMarkupMinor === "string" ? value.fixedMarkupMinor : "0";
  const markupBps = typeof value.markupBps === "number" ? value.markupBps : 0;
  const publish = value.publish === true;
  const page = typeof value.page === "number" && Number.isInteger(value.page) && value.page > 0 ? value.page : 1;
  if (!productId || !skuIds.length) appError("SUPPLIER_IMPORT_INPUT_INVALID");
  const result = await fetchSupplierCatalog({ provider, normalizedApiOrigin, protocolVersion }, "", page);
  const product = result.products.find((item) => item.id === productId);
  if (!product) appError("SUPPLIER_PRODUCT_NOT_FOUND");
  return importSupplierProduct(db, { provider, normalizedApiOrigin, protocolVersion, productId, skuIds, fixedMarkupMinor, markupBps, publish }, product);
});

export const onSwitchSupplierBinding = telefuncAction(async (input: unknown) => {
  const { db } = requireAdmin();
  const { value, provider, normalizedApiOrigin, protocolVersion } = readSourceInput(input);
  const productSkuId = typeof value.productSkuId === "number" ? value.productSkuId : 0;
  const productId = typeof value.productId === "string" ? value.productId : "";
  const skuId = typeof value.skuId === "string" ? value.skuId : "";
  if (!Number.isInteger(productSkuId) || productSkuId < 1 || !productId || !skuId) appError("SUPPLIER_IMPORT_INPUT_INVALID");
  const result = await fetchSupplierCatalog({ provider, normalizedApiOrigin, protocolVersion }, "", 1, 100);
  const product = result.products.find((item) => item.id === productId);
  if (!product) appError("SUPPLIER_PRODUCT_NOT_FOUND");
  return switchSupplierBinding(db, { productSkuId, provider, normalizedApiOrigin, protocolVersion, productId, skuId }, product);
});
