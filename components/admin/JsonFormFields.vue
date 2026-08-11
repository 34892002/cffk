<template>
  <Field v-for="field in visibleFields" :key="field.key" :data-invalid="Boolean(errors[field.key])">
    <template v-if="field.type === 'switch'">
      <Field orientation="horizontal"><FieldLabel :for="fieldId(field)">{{ field.label }}</FieldLabel><Switch :id="fieldId(field)" :model-value="Boolean(values[field.key])" @update:model-value="setValue(field.key, $event === true)" /></Field>
    </template>
    <template v-else-if="field.type === 'select'">
      <FieldLabel :for="fieldId(field)">{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></FieldLabel>
      <Select :model-value="stringValue(field.key)" @update:model-value="setValue(field.key, String($event ?? ''))"><SelectTrigger :id="fieldId(field)" :aria-invalid="Boolean(errors[field.key])"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select>
    </template>
    <template v-else-if="field.type === 'multi_select'">
      <FieldLabel>{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></FieldLabel>
      <div class="flex flex-wrap gap-x-4 gap-y-3 rounded-md border p-3"><label v-for="option in field.options ?? []" :key="option.value" class="flex items-center gap-2 text-sm font-normal"><Checkbox :model-value="arrayValue(field.key).includes(option.value)" :aria-invalid="Boolean(errors[field.key])" @update:model-value="toggle(field.key, option.value, $event === true)" />{{ option.label }}</label></div>
    </template>
    <template v-else-if="field.type === 'textarea'">
      <FieldLabel :for="fieldId(field)">{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></FieldLabel>
      <Textarea :id="fieldId(field)" :model-value="stringValue(field.key)" rows="4" :placeholder="secretPlaceholder(field)" :aria-invalid="Boolean(errors[field.key])" @update:model-value="setValue(field.key, $event)" />
    </template>
    <template v-else>
      <FieldLabel :for="fieldId(field)">{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></FieldLabel>
      <Input :id="fieldId(field)" :model-value="stringValue(field.key)" :type="field.secret ? 'password' : field.type" :placeholder="secretPlaceholder(field)" autocomplete="off" :aria-invalid="Boolean(errors[field.key])" @update:model-value="setValue(field.key, normalizeJsonFormInputValue(field.type, $event))" />
    </template>
    <FieldDescription v-if="field.description">{{ field.description }}</FieldDescription>
    <FieldDescription v-if="field.secret && configuredSecrets.includes(field.key)">已保存敏感配置；留空则保持不变。</FieldDescription>
    <FieldError v-if="errors[field.key]" :errors="[errors[field.key]]" />
  </Field>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { normalizeJsonFormInputValue, type JsonFormFieldDefinition, type JsonFormInputValue, type JsonFormValues } from "@/lib/json-form-values";

const props = defineProps<{ fields: JsonFormFieldDefinition[]; values: JsonFormValues; configuredSecrets: string[]; errors?: Record<string, string> }>();
const errors = computed(() => props.errors ?? {});
const emit = defineEmits<{ "update:values": [values: JsonFormValues] }>();
const visibleFields = computed(() => props.fields.filter((field) => field.key !== "notifyUrl" && field.key !== "returnUrl"));
function setValue(key: string, value: JsonFormInputValue) { emit("update:values", { ...props.values, [key]: value }); }
function stringValue(key: string) { const value = props.values[key]; return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function arrayValue(key: string) { const value = props.values[key]; return Array.isArray(value) ? value : []; }
function toggle(key: string, value: string, checked: boolean) { const current = arrayValue(key); setValue(key, checked ? [...new Set([...current, value])] : current.filter((item) => item !== value)); }
function secretPlaceholder(field: JsonFormFieldDefinition) { return field.secret && props.configuredSecrets.includes(field.key) ? "已配置，留空保持不变" : undefined; }
function fieldId(field: JsonFormFieldDefinition) { return `payment-config-${field.key}`; }
</script>
