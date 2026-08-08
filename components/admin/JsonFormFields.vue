<template>
  <Field v-for="field in fields" :key="field.key" :class="field.type === 'textarea' || field.type === 'multi_select' ? 'sm:col-span-2' : ''">
    <template v-if="field.type === 'switch'">
      <Field orientation="horizontal"><FieldLabel :for="fieldId(field)">{{ field.label }}</FieldLabel><Switch :id="fieldId(field)" :model-value="Boolean(values[field.key])" @update:model-value="setValue(field.key, $event === true)" /></Field>
    </template>
    <template v-else-if="field.type === 'select'">
      <FieldLabel :for="fieldId(field)">{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></FieldLabel>
      <Select :model-value="stringValue(field.key)" @update:model-value="setValue(field.key, String($event ?? ''))"><SelectTrigger :id="fieldId(field)"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select>
    </template>
    <template v-else-if="field.type === 'multi_select'">
      <FieldLabel>{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></FieldLabel>
      <div class="flex flex-wrap gap-x-4 gap-y-3 rounded-md border p-3"><label v-for="option in field.options ?? []" :key="option.value" class="flex items-center gap-2 text-sm font-normal"><Checkbox :model-value="arrayValue(field.key).includes(option.value)" @update:model-value="toggle(field.key, option.value, $event === true)" />{{ option.label }}</label></div>
    </template>
    <template v-else-if="field.type === 'textarea'">
      <FieldLabel :for="fieldId(field)">{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></FieldLabel>
      <Textarea :id="fieldId(field)" :model-value="stringValue(field.key)" rows="4" :placeholder="secretPlaceholder(field)" @update:model-value="setValue(field.key, $event)" />
    </template>
    <template v-else>
      <FieldLabel :for="fieldId(field)">{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></FieldLabel>
      <Input :id="fieldId(field)" :model-value="stringValue(field.key)" :type="field.secret ? 'password' : field.type" :placeholder="secretPlaceholder(field)" autocomplete="off" @update:model-value="setValue(field.key, field.type === 'number' ? Number($event) : $event)" />
    </template>
    <FieldDescription v-if="field.description">{{ field.description }}</FieldDescription>
    <FieldDescription v-if="field.secret && secrets[field.key]?.configured">已保存敏感配置；留空则保持不变。</FieldDescription>
  </Field>
</template>

<script lang="ts" setup>
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type JsonFormValue = string | number | boolean | string[];
export type JsonFormField = { key: string; label: string; type: "text" | "email" | "number" | "password" | "url" | "switch" | "select" | "multi_select" | "textarea"; required?: boolean; secret?: boolean; description?: string; options?: Array<{ label: string; value: string }> };
const props = defineProps<{ fields: JsonFormField[]; values: Record<string, JsonFormValue>; secrets: Record<string, { configured: boolean }> }>();
const emit = defineEmits<{ "update:values": [values: Record<string, JsonFormValue>] }>();
function setValue(key: string, value: JsonFormValue) { emit("update:values", { ...props.values, [key]: value }); }
function stringValue(key: string) { const value = props.values[key]; return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function arrayValue(key: string) { const value = props.values[key]; return Array.isArray(value) ? value : []; }
function toggle(key: string, value: string, checked: boolean) { const current = arrayValue(key); setValue(key, checked ? [...new Set([...current, value])] : current.filter((item) => item !== value)); }
function secretPlaceholder(field: JsonFormField) { return field.secret && props.secrets[field.key]?.configured ? "已配置，留空保持不变" : undefined; }
function fieldId(field: JsonFormField) { return `payment-config-${field.key}`; }
</script>
