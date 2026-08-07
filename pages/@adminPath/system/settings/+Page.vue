<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <Alert v-if="error" variant="destructive">
      <AlertTitle>操作未完成</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <Card>
      <CardHeader>
        <CardTitle>站点设置</CardTitle>
        <CardDescription>维护公开商城展示的站点名称、公告、联系方式和下单提示。</CardDescription>
      </CardHeader>

      <form id="site-settings-form" novalidate @submit="saveSettings">
        <CardContent>
          <FieldGroup class="gap-5">
            <FieldSet class="gap-4">
              <FieldLegend>基础信息</FieldLegend>
              <div class="grid gap-4 md:grid-cols-2">
                <VeeField v-slot="{ componentField, errors }" name="siteName" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-name">站点名称</FieldLabel>
                    <Input id="site-name" v-bind="componentField" autocomplete="organization" placeholder="例如：CFFK发卡" :aria-invalid="errors.length > 0" />
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>

                <VeeField v-slot="{ componentField, errors }" name="siteSubtitle" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-subtitle">副标题 / 默认 SEO 描述</FieldLabel>
                    <Input id="site-subtitle" v-bind="componentField" placeholder="例如：安全、稳定的自动发卡商城" :aria-invalid="errors.length > 0" />
                    <FieldDescription>同时用作公开首页副标题和默认 description。</FieldDescription>
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <VeeField v-slot="{ componentField, errors }" name="siteUrl" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-url">网站地址</FieldLabel>
                    <Input id="site-url" v-bind="componentField" type="url" inputmode="url" placeholder="https://shop.example.com" :aria-invalid="errors.length > 0" />
                    <FieldDescription>用于 canonical 和社交分享链接，建议填写站点对外访问地址。</FieldDescription>
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>

                <VeeField v-slot="{ componentField, errors }" name="timezone">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-timezone">站点时区</FieldLabel>
                    <Select v-bind="componentField">
                      <SelectTrigger id="site-timezone" :aria-invalid="errors.length > 0"><SelectValue placeholder="选择站点时区" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Shanghai">亚洲/上海（UTC+8）</SelectItem>
                        <SelectItem value="Asia/Tokyo">亚洲/东京（UTC+9）</SelectItem>
                        <SelectItem value="Asia/Singapore">亚洲/新加坡（UTC+8）</SelectItem>
                        <SelectItem value="UTC">协调世界时（UTC）</SelectItem>
                        <SelectItem value="America/Los_Angeles">美国/洛杉矶</SelectItem>
                        <SelectItem value="America/New_York">美国/纽约</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>用于订单、日志和定时任务中的日期时间展示。</FieldDescription>
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>
              </div>
            </FieldSet>

            <FieldSeparator />

            <FieldSet class="gap-4">
              <FieldLegend>品牌资源</FieldLegend>
              <div class="grid gap-4 md:grid-cols-2">
                <VeeField v-slot="{ componentField, errors }" name="logoIcon" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-favicon">网站 Favicon 地址</FieldLabel>
                    <Input id="site-favicon" v-bind="componentField" type="url" inputmode="url" placeholder="https://example.com/favicon.ico" :aria-invalid="errors.length > 0" />
                    <FieldDescription>支持 ico、png、svg 或其他浏览器可识别的公开图片地址。</FieldDescription>
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>

                <VeeField v-slot="{ componentField, errors }" name="logo" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-logo">网站 Logo 地址</FieldLabel>
                    <Input id="site-logo" v-bind="componentField" type="url" inputmode="url" placeholder="https://example.com/logo.png" :aria-invalid="errors.length > 0" />
                    <FieldDescription>用于公开商城导航和社交分享图片 fallback。</FieldDescription>
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>
              </div>
            </FieldSet>

            <FieldSeparator />

            <FieldSet class="gap-4">
              <FieldLegend>公开商城内容</FieldLegend>
              <VeeField v-slot="{ componentField, errors }" name="notice" :validate-on-input="true">
                <Field :data-invalid="errors.length > 0">
                  <FieldLabel for="site-notice">首页公告</FieldLabel>
                  <Textarea id="site-notice" v-bind="componentField" rows="3" placeholder="展示在商城首页的公告内容。" :aria-invalid="errors.length > 0" />
                  <FieldError v-if="errors.length" :errors="errors" />
                </Field>
              </VeeField>

              <div class="grid gap-4 md:grid-cols-2">
                <VeeField v-slot="{ componentField, errors }" name="supportContact" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-support-contact">客服联系方式</FieldLabel>
                    <Textarea id="site-support-contact" v-bind="componentField" rows="3" placeholder="每行一条，例如：Telegram 客服|https://t.me/example" :aria-invalid="errors.length > 0" />
                    <FieldDescription>每行一条。使用“显示文字|链接地址”格式可生成可点击联系方式。</FieldDescription>
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>

                <VeeField v-slot="{ componentField, errors }" name="footerText" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-footer-text">页脚文案</FieldLabel>
                    <Textarea id="site-footer-text" v-bind="componentField" rows="3" placeholder="例如：© 2026 CFFK 版权所有" :aria-invalid="errors.length > 0" />
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>
              </div>

              <VeeField v-slot="{ componentField, errors }" name="orderNotice" :validate-on-input="true">
                <Field :data-invalid="errors.length > 0">
                  <FieldLabel for="site-order-notice">下单提示</FieldLabel>
                  <Textarea id="site-order-notice" v-bind="componentField" rows="3" placeholder="展示在下单流程中的补充说明。" :aria-invalid="errors.length > 0" />
                  <FieldError v-if="errors.length" :errors="errors" />
                </Field>
              </VeeField>
            </FieldSet>

            <FieldSeparator />

            <FieldSet class="gap-4">
              <FieldLegend>自定义代码</FieldLegend>
              <FieldDescription>当前仅保存代码，尚未启用页面注入。请勿填写密钥、令牌或用户数据。</FieldDescription>
              <div class="grid gap-4 md:grid-cols-2">
                <VeeField v-slot="{ componentField, errors }" name="headCode" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-head-code">页头代码（head）</FieldLabel>
                    <Textarea id="site-head-code" v-bind="componentField" rows="6" spellcheck="false" class="min-h-36 font-mono text-xs leading-5" placeholder="&lt;meta name=&quot;...&quot; content=&quot;...&quot;&gt;" :aria-invalid="errors.length > 0" />
                    <FieldDescription>预留用于第三方验证或额外 Meta 标签，启用前需经过安全审核。</FieldDescription>
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>

                <VeeField v-slot="{ componentField, errors }" name="footerCode" :validate-on-input="true">
                  <Field :data-invalid="errors.length > 0">
                    <FieldLabel for="site-footer-code">页脚代码（body）</FieldLabel>
                    <Textarea id="site-footer-code" v-bind="componentField" rows="6" spellcheck="false" class="min-h-36 font-mono text-xs leading-5" placeholder="&lt;script&gt;...&lt;/script&gt;" :aria-invalid="errors.length > 0" />
                    <FieldDescription>预留用于可信脚本；启用前需确认脚本来源和安全性。</FieldDescription>
                    <FieldError v-if="errors.length" :errors="errors" />
                  </Field>
                </VeeField>
              </div>
            </FieldSet>
          </FieldGroup>
        </CardContent>

        <CardFooter class="flex justify-end border-t">
          <Button type="submit" :disabled="loading">{{ loading ? "保存中..." : "保存设置" }}</Button>
        </CardFooter>
      </form>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";

import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import { z } from "zod";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetSiteSettings, onSaveSiteSettings } from "@/server/site/admin.telefunc";

const urlMessage = "请输入有效的 HTTP 或 HTTPS 地址。";
const optionalUrl = z.string().trim().refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, urlMessage);

const formSchema = toTypedSchema(z.object({
  siteName: z.string().trim().min(1, "请输入站点名称。").max(120, "站点名称不能超过 120 个字符。"),
  siteSubtitle: z.string().trim().max(300, "副标题不能超过 300 个字符。"),
  siteUrl: optionalUrl,
  timezone: z.enum(["Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore", "UTC", "America/Los_Angeles", "America/New_York"]),
  logoIcon: optionalUrl,
  logo: optionalUrl,
  notice: z.string().trim().max(2_000, "首页公告不能超过 2,000 个字符。"),
  supportContact: z.string().trim().max(2_000, "客服联系方式不能超过 2,000 个字符。"),
  footerText: z.string().trim().max(1_000, "页脚文案不能超过 1,000 个字符。"),
  orderNotice: z.string().trim().max(2_000, "下单提示不能超过 2,000 个字符。"),
  headCode: z.string().trim().max(20_000, "页头代码不能超过 20,000 个字符。"),
  footerCode: z.string().trim().max(20_000, "页脚代码不能超过 20,000 个字符。"),
}));

type FormValues = {
  siteName: string;
  siteUrl: string;
  siteSubtitle: string;
  logo: string;
  logoIcon: string;
  notice: string;
  supportContact: string;
  footerText: string;
  orderNotice: string;
  headCode: string;
  footerCode: string;
  timezone: "Asia/Shanghai" | "Asia/Tokyo" | "Asia/Singapore" | "UTC" | "America/Los_Angeles" | "America/New_York";
};

const initialValues: FormValues = {
  siteName: "CFFK发卡",
  siteUrl: "",
  siteSubtitle: "",
  logo: "",
  logoIcon: "",
  notice: "",
  supportContact: "",
  footerText: "",
  orderNotice: "",
  headCode: "",
  footerCode: "",
  timezone: "Asia/Shanghai",
};

const { handleSubmit, resetForm } = useForm<FormValues>({ validationSchema: formSchema, initialValues });
const loading = ref(false);
const error = ref<string | null>(null);

function toFormValues(settings: Awaited<ReturnType<typeof onGetSiteSettings>>): FormValues {
  const timezone = initialValues.timezone;
  const supportedTimezones = ["Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore", "UTC", "America/Los_Angeles", "America/New_York"] as const;
  const isSupportedTimezone = (value: string): value is FormValues["timezone"] => supportedTimezones.includes(value as FormValues["timezone"]);

  return {
    siteName: settings.siteName,
    siteUrl: settings.siteUrl ?? "",
    siteSubtitle: settings.siteSubtitle ?? "",
    logo: settings.logo ?? "",
    logoIcon: settings.logoIcon ?? "",
    notice: settings.notice ?? "",
    supportContact: settings.supportContact ?? "",
    footerText: settings.footerText ?? "",
    orderNotice: settings.orderNotice ?? "",
    headCode: settings.headCode ?? "",
    footerCode: settings.footerCode ?? "",
    timezone: isSupportedTimezone(settings.timezone) ? settings.timezone : timezone,
  };
}

async function loadSettings() {
  loading.value = true;
  error.value = null;
  try {
    resetForm({ values: toFormValues(await runTelefunc(() => onGetSiteSettings(), { notifyError: false })) });
  } catch (cause) {
    error.value = userErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

const saveSettings = handleSubmit(async (values) => {
  loading.value = true;
  error.value = null;
  try {
    const settings = await runTelefunc(() => onSaveSiteSettings(values), { successMessage: "站点设置已保存。", notifyError: false });
    resetForm({ values: toFormValues(settings) });
  } catch (cause) {
    error.value = userErrorMessage(cause);
  } finally {
    loading.value = false;
  }
});

onMounted(loadSettings);
</script>
