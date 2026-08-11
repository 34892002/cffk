import { pinyin } from "pinyin-pro";
import { z } from "zod";

import type { onGetProductAdminDetail } from "@/server/catalog/admin.telefunc";

export const deliveryTypes = ["CARD_AUTO", "FIXED_CARD", "MANUAL", "EXPRESS"] as const;
export const productStatuses = ["DRAFT", "ACTIVE", "INACTIVE"] as const;

export const productFormSchema = z.object({
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().positive("请选择商品分类"),
  name: z.string().trim().min(1, "商品名称不能为空").max(120, "商品名称不能超过 120 个字符"),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug 只能包含小写英文、数字和连字符"),
  subtitle: z.string().max(300, "副标题不能超过 300 个字符"),
  coverImage: z.string(),
  description: z.string().trim().min(1, "商品详情不能为空"),
  fixedDeliveryContent: z.string(),
  manualDeliveryHint: z.string(),
  purchaseNote: z.string(),

  price: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "请输入有效金额"),
  status: z.enum(productStatuses),
  deliveryType: z.enum(deliveryTypes),
  physicalStock: z.number().int().min(0).nullable(),
  minBuy: z.number().int().min(1, "最小购买数至少为 1"),
  maxBuy: z.number().int().min(1, "最大购买数至少为 1"),
  sort: z.number().int().min(0),
}).superRefine((value, ctx) => {
  if (value.deliveryType !== "FIXED_CARD" && value.maxBuy < value.minBuy) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxBuy"], message: "最大购买数不能小于最小购买数" });
  if (value.deliveryType === "FIXED_CARD" && value.status === "ACTIVE" && !value.fixedDeliveryContent.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fixedDeliveryContent"], message: "上架前必须填写固定交付内容" });
});

export type ProductForm = z.infer<typeof productFormSchema>;
export type ProductDetail = Awaited<ReturnType<typeof onGetProductAdminDetail>>;

export function slugifyProductName(value: string) {
  return pinyin(value, { toneType: "none", nonZh: "consecutive" }).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function defaultProductForm(categoryId: number | null = null): ProductForm {
  return { categoryId: categoryId ?? 0, name: "", slug: "", subtitle: "", coverImage: "", description: "", fixedDeliveryContent: "", manualDeliveryHint: "", purchaseNote: "", price: "0.00", status: "DRAFT", deliveryType: "CARD_AUTO", physicalStock: null, minBuy: 1, maxBuy: 1, sort: 0 };
}

export function productDetailToForm(item: ProductDetail["product"]): ProductForm {
  return { id: item.id, categoryId: item.categoryId ?? 0, name: item.name, slug: item.slug, subtitle: item.subtitle ?? "", coverImage: item.coverImage ?? "", description: item.description ?? "", fixedDeliveryContent: item.fixedDeliveryContent ?? "", manualDeliveryHint: item.manualDeliveryHint ?? "", purchaseNote: item.purchaseNote ?? "", price: item.price, status: item.status, deliveryType: item.deliveryType, physicalStock: item.physicalStock, minBuy: item.minBuy, maxBuy: item.maxBuy, sort: item.sort };
}

export function formToSaveInput(form: ProductForm) {
  return { ...form, categoryId: form.categoryId || null, physicalStock: form.deliveryType === "MANUAL" || form.deliveryType === "EXPRESS" ? form.physicalStock : null };
}
