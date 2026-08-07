<template>
  <MailSettingsLayout>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h2 class="text-xl font-semibold tracking-normal">邮件模板</h2><p class="mt-1 text-sm text-muted-foreground">主题、正文和可用变量均保存为 JSON，可在不迁移数据库的情况下调整。</p></div>
      <Button :disabled="loading" @click="loadTemplates">刷新数据</Button>
    </div>

    <Alert v-if="error" variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{{ error }}</AlertDescription></Alert>

    <Card v-for="item in templates" :key="item.scene">
      <CardHeader>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle>{{ item.name }}</CardTitle><CardDescription class="mt-1 font-mono">{{ item.scene }}</CardDescription></div>
          <Badge :variant="item.isEnabled ? 'secondary' : 'outline'">{{ item.isEnabled ? '已启用' : '未启用' }}</Badge>
        </div>
      </CardHeader>
      <form @submit.prevent="saveTemplate(item.scene)">
        <CardContent class="grid max-w-3xl gap-4">
          <label class="grid gap-2 text-sm font-medium">显示名称<Input v-model="forms[item.scene].name" required /></label>
          <label class="flex items-center justify-between gap-3 text-sm font-medium"><span>启用此模板</span><Switch v-model="forms[item.scene].isEnabled" /></label>
          <label class="grid gap-2 text-sm font-medium">模板 JSON<Textarea v-model="forms[item.scene].templateJson" rows="12" spellcheck="false" class="min-h-56 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <p class="text-xs leading-5 text-muted-foreground">必须包含 `subject`、`body` 和 `format`。变量使用 <code v-pre>{{variable}}</code>，并在 `variables` 数组中列出。</p>
        </CardContent>
        <CardFooter><Button type="submit" :disabled="saving === item.scene">{{ saving === item.scene ? '保存中...' : '保存模板' }}</Button></CardFooter>
      </form>
    </Card>

    <Card v-if="!loading && !templates.length"><CardContent class="py-10 text-center text-sm text-muted-foreground">尚未初始化邮件模板。请先执行数据库 seed。</CardContent></Card>
  </MailSettingsLayout>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import MailSettingsLayout from "@/components/admin/MailSettingsLayout.vue";
import { runTelefunc, userErrorMessage } from "@/lib/telefunc-client";
import { onGetEmailTemplates, onSaveEmailTemplate } from "@/server/email/admin.telefunc";

type Template = Awaited<ReturnType<typeof onGetEmailTemplates>>[number];
type Form = { name: string; isEnabled: boolean; templateJson: string };
const templates = ref<Template[]>([]);
const forms = reactive<Record<string, Form>>({});
const loading = ref(false);
const saving = ref<string | null>(null);
const error = ref<string | null>(null);

async function loadTemplates() {
  loading.value = true;
  error.value = null;
  try {
    templates.value = await runTelefunc(() => onGetEmailTemplates(), { notifyError: false });
    for (const item of templates.value) forms[item.scene] = { name: item.name, isEnabled: item.isEnabled, templateJson: item.templateJson };
  } catch (cause) {
    error.value = userErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function saveTemplate(scene: Template["scene"]) {
  const form = forms[scene];
  if (!form) return;
  saving.value = scene;
  error.value = null;
  try {
    await runTelefunc(() => onSaveEmailTemplate({ scene, ...form }), { notifyError: false });
    await loadTemplates();
  } catch (cause) {
    error.value = userErrorMessage(cause);
  } finally {
    saving.value = null;
  }
}


onMounted(loadTemplates);
</script>
