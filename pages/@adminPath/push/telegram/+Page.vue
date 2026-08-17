<template>
  <section class="flex w-full flex-col gap-6">
    <AdminPageHeader />

    <Card>
      <CardHeader>
        <CardTitle>Telegram Bot</CardTitle>
        <CardDescription>使用 Bot Token 和 Chat ID 发送管理员通知。配置保存后可发送测试消息。</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">正在加载...</div>
        <form v-else class="grid gap-5 lg:grid-cols-2" novalidate @submit.prevent="submit">
          <VeeField v-slot="{ componentField, errors }" name="name">
            <Field class="lg:col-span-2" :data-invalid="errors.length > 0"><FieldLabel for="telegram-name">配置名称</FieldLabel><Input id="telegram-name" v-bind="componentField" placeholder="例如：订单通知 Bot" :aria-invalid="errors.length > 0" /><FieldError v-if="errors.length" :errors="errors" /></Field>
          </VeeField>
          <VeeField v-slot="{ componentField, errors }" name="botToken">
            <Field :data-invalid="errors.length > 0"><FieldLabel for="telegram-token">Bot Token</FieldLabel><Input id="telegram-token" v-bind="componentField" type="password" autocomplete="off" placeholder="从 @BotFather 获取" :aria-invalid="errors.length > 0" /><FieldDescription>在 Telegram 中联系<a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" class="font-medium text-primary underline underline-offset-4">@BotFather</a>，创建 Bot 后复制 Token。</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field>
          </VeeField>
          <VeeField v-slot="{ componentField, errors }" name="chatId">
            <Field :data-invalid="errors.length > 0"><FieldLabel for="telegram-chat-id">Chat ID</FieldLabel><Input id="telegram-chat-id" v-bind="componentField" placeholder="例如：123456789" :aria-invalid="errors.length > 0" /><FieldDescription>获取个人 ID：打开 <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" class="font-medium text-primary underline underline-offset-4">@userinfobot</a>，发送 <code>/start</code>，复制回复中的 <code>Id</code> 数字。</FieldDescription><FieldError v-if="errors.length" :errors="errors" /></Field>
          </VeeField>
          <div class="flex flex-wrap items-center justify-between gap-4 lg:col-span-2"><Field orientation="horizontal" class="w-auto"><div><FieldLabel for="telegram-enabled">启用 Telegram</FieldLabel><FieldDescription>启用后，可在推送策略中选择 Telegram。</FieldDescription></div><Switch id="telegram-enabled" v-model="isEnabled" /></Field><div class="flex flex-wrap gap-2"><Button type="submit" :disabled="saving">{{ saving ? "保存中..." : "保存配置" }}</Button><Button type="button" variant="outline" :disabled="testing || !providerId || configurationError" @click="testProvider">{{ testing ? "发送中..." : "发送测试消息" }}</Button></div></div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>配置步骤</CardTitle><CardDescription>Bot 必须能够向目标用户、群组或频道发送消息。</CardDescription></CardHeader>
      <CardContent class="grid gap-4"><Tabs default-value="create-bot"><TabsList><TabsTrigger value="create-bot">创建机器人</TabsTrigger><TabsTrigger value="personal-id">获取个人 ID</TabsTrigger></TabsList><TabsContent value="create-bot" class="grid gap-3 text-sm text-muted-foreground"><div class="grid gap-1"><p>1. 在 Telegram 中打开 <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" class="font-medium text-primary underline underline-offset-4">@BotFather</a>，发送 <code>/newbot</code>。</p><p class="pl-4">BotFather 回复：<code>Alright, a new bot. How are we going to call it?</code></p><p class="pl-4">意思是“好的，要如何称呼这个机器人？”，此时发送机器人显示名称，例如“订单通知 Bot”。</p></div><div class="grid gap-1"><p>2. BotFather 会提示：<code>Now let's choose a username for your bot. It must end in 'bot'.</code></p><p class="pl-4">意思是“现在为机器人选择用户名，必须以 <code>bot</code> 结尾”。发送全局唯一的用户名，例如 <code>my_store_bot</code>；创建后可通过 <code>@用户名</code> 找到机器人。</p></div><div class="grid gap-1"><p>3. BotFather 回复 <code>Done! Congratulations on your new bot.</code> 即表示创建成功。</p><p class="pl-4">在紧接着的 <code>Use this token to access the HTTP API:</code> 下方复制 Token，并填写到上方 <code>Bot Token</code> 字段。</p></div><p>4. Token 相当于密码，请勿分享或截图；如已泄露，请在 BotFather 中执行 <code>/revoke</code> 后生成新 Token，并更新此处配置。</p></TabsContent><TabsContent value="personal-id" class="grid gap-2 text-sm text-muted-foreground"><p>1. 在 Telegram 中打开 <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" class="font-medium text-primary underline underline-offset-4">@userinfobot</a>，发送 <code>/start</code>。</p><p>2. 它会回复个人信息，其中 <code>Id: 123456789</code> 这一行的数字就是你的个人 Chat ID；其他如 First、Lang、Registered 信息无需填写。</p><p>3. 将该数字填写到上方 <code>Chat ID</code> 字段。</p></TabsContent><div class="grid gap-2 text-sm text-muted-foreground"><p>填写 Bot Token 和 Chat ID 后，保存配置并点击“发送测试消息”。测试成功后，在“推送配置”的管理消息策略中勾选 Telegram。</p><p>如需推送到群组或频道，请将 Bot 加入目标会话；群组填写负数 Chat ID，公开频道可填写 <code>@channel</code>。</p></div></Tabs></CardContent>
    </Card>
  </section>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { Field as VeeField, useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runTelefunc } from "@/lib/telefunc-client";
import { onGetTelegramProvider, onSaveTelegramProvider, onTestTelegramProvider } from "@/server/push/telegram-admin.telefunc";

const schema = toTypedSchema(z.object({
  name: z.string().trim().min(1, "请填写配置名称。").max(120, "配置名称不能超过 120 个字符。"),
  botToken: z.string().trim().regex(/^\d+:[A-Za-z0-9_-]+$/, "请填写有效的 Bot Token。"),
  chatId: z.string().trim().min(1, "请填写 Chat ID。").max(128, "Chat ID 不能超过 128 个字符。").refine((value) => /^-?\d+$/.test(value) || /^@[A-Za-z][A-Za-z0-9_]{4,}$/.test(value), "请填写数字 Chat ID 或 @channel 用户名。"),
}));
const { handleSubmit, resetForm } = useForm({ validationSchema: schema, initialValues: { name: "Telegram Bot", botToken: "", chatId: "" } });
const loading = ref(false); const saving = ref(false); const testing = ref(false); const isEnabled = ref(false); const providerId = ref<number>(); const configurationError = ref(false);
async function loadProvider() { loading.value = true; try { const result = await runTelefunc(() => onGetTelegramProvider()); const provider = result.provider; providerId.value = provider?.id; isEnabled.value = provider?.isEnabled ?? false; configurationError.value = provider?.configurationError ?? false; resetForm({ values: { name: provider?.name ?? "Telegram Bot", botToken: provider?.botToken ?? "", chatId: provider?.chatId ?? "" } }); } finally { loading.value = false; } }
const submit = handleSubmit(async (values) => { saving.value = true; try { await runTelefunc(() => onSaveTelegramProvider({ ...values, isEnabled: isEnabled.value }), { successMessage: "Telegram 配置已保存。" }); await loadProvider(); } catch { /* runTelefunc owns feedback */ } finally { saving.value = false; } });
async function testProvider() { testing.value = true; try { await runTelefunc(() => onTestTelegramProvider(), { successMessage: "Telegram 测试消息已发送。" }); } catch { /* runTelefunc owns feedback */ } finally { testing.value = false; } }
onMounted(loadProvider);
</script>
