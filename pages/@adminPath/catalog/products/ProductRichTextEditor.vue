<template>
  <div class="grid gap-2 rounded-md border p-2">
    <div class="flex flex-wrap items-center gap-1 border-b pb-2">
      <div class="flex items-center gap-1">
        <Button v-for="item in formatTools" :key="item.label" type="button" variant="ghost" size="icon-sm" :class="item.active?.() ? 'bg-accent text-accent-foreground' : ''" :aria-label="item.label" :title="item.label" :disabled="!editor || htmlMode" @mousedown.prevent @click="item.action"><component :is="item.icon" /></Button>
      </div>
      <Separator orientation="vertical" class="mx-1 hidden h-6 sm:block" />
      <div class="flex items-center gap-1">
        <Popover v-model:open="textColorOpen">
          <PopoverTrigger as-child><Button type="button" variant="ghost" size="icon-sm" :class="editor?.isActive('textStyle') ? 'bg-accent text-accent-foreground' : ''" aria-label="文字颜色" title="文字颜色" :disabled="!editor || htmlMode"><PaletteIcon /></Button></PopoverTrigger>
          <PopoverContent class="w-48 p-3" align="start">
            <div class="mb-2 flex items-center justify-between text-sm font-medium"><span>文字颜色</span><Button type="button" variant="ghost" size="sm" @click="unsetTextColor">清除</Button></div>
            <div class="flex overflow-hidden rounded-md border"><Button v-for="color in textColors" :key="color.value" type="button" variant="ghost" size="icon-sm" class="rounded-none" :aria-label="color.label" :title="color.label" @click="setTextColor(color.value)"><span class="size-4 rounded-sm border" :style="{ backgroundColor: color.value }" /></Button></div>
            <div class="mt-3 flex gap-2"><Input v-model="textColorValue" class="h-8 font-mono" :placeholder="colorPlaceholder(textColorFormat)" :aria-label="`文字${textColorFormat.toUpperCase()}颜色值`" @update:model-value="applyTextColorValue" /><Button type="button" variant="outline" size="icon-sm" :aria-label="`切换为 ${nextColorFormat(textColorFormat).toUpperCase()} 输入`" :title="`切换为 ${nextColorFormat(textColorFormat).toUpperCase()} 输入`" @click="toggleTextColorFormat"><Repeat2Icon /></Button></div>
          </PopoverContent>
        </Popover>
        <Popover v-model:open="highlightOpen">
          <PopoverTrigger as-child><Button type="button" variant="ghost" size="icon-sm" :class="editor?.isActive('highlight') ? 'bg-accent text-accent-foreground' : ''" aria-label="文本高亮" title="文本高亮" :disabled="!editor || htmlMode"><HighlighterIcon /></Button></PopoverTrigger>
          <PopoverContent class="w-48 p-3" align="start">
            <div class="mb-2 flex items-center justify-between text-sm font-medium"><span>文本高亮</span><Button type="button" variant="ghost" size="sm" @click="unsetHighlight">清除</Button></div>
            <div class="flex overflow-hidden rounded-md border"><Button v-for="color in highlightColors" :key="color.value" type="button" variant="ghost" size="icon-sm" class="rounded-none" :aria-label="color.label" :title="color.label" @click="setHighlight(color.value)"><span class="size-4 rounded-sm border" :style="{ backgroundColor: color.value }" /></Button></div>
            <div class="mt-3 flex gap-2"><Input v-model="highlightValue" class="h-8 font-mono" :placeholder="colorPlaceholder(highlightFormat)" :aria-label="`高亮${highlightFormat.toUpperCase()}颜色值`" @update:model-value="applyHighlightValue" /><Button type="button" variant="outline" size="icon-sm" :aria-label="`切换为 ${nextColorFormat(highlightFormat).toUpperCase()} 输入`" :title="`切换为 ${nextColorFormat(highlightFormat).toUpperCase()} 输入`" @click="toggleHighlightFormat"><Repeat2Icon /></Button></div>
          </PopoverContent>
        </Popover>
      </div>
      <Separator orientation="vertical" class="mx-1 hidden h-6 sm:block" />
      <div class="flex items-center gap-1">
        <Popover v-model:open="linkOpen">
          <PopoverTrigger as-child><Button type="button" variant="ghost" size="icon-sm" aria-label="插入链接" title="插入链接" :disabled="!editor || htmlMode" @click="syncLinkUrl"><LinkIcon /></Button></PopoverTrigger>
          <PopoverContent class="w-72 p-3" align="start"><div class="grid gap-2"><Input v-model="linkUrl" class="h-8" placeholder="https://example.com" aria-label="链接地址" @keyup.enter="applyLink" /><div class="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" @click="unsetLink">移除</Button><Button type="button" size="sm" @click="applyLink">应用</Button></div></div></PopoverContent>
        </Popover>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="插入图片" title="插入图片" :disabled="htmlMode" @click="pickerOpen = true"><ImageIcon /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="分割线" title="分割线" :disabled="!editor || htmlMode" @click="editor?.chain().focus().setHorizontalRule().run()"><MinusIcon /></Button>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="清除格式" title="清除格式" :disabled="!editor || htmlMode" @click="editor?.chain().focus().clearNodes().unsetAllMarks().run()"><RemoveFormattingIcon /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="撤销" title="撤销" :disabled="!editor || htmlMode || !editor.can().chain().focus().undo().run()" @click="editor?.chain().focus().undo().run()"><Undo2Icon /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="重做" title="重做" :disabled="!editor || htmlMode || !editor.can().chain().focus().redo().run()" @click="editor?.chain().focus().redo().run()"><Redo2Icon /></Button>
        <Button type="button" variant="ghost" size="sm" :class="htmlMode ? 'bg-accent text-accent-foreground' : ''" aria-label="HTML 源码" title="HTML 源码" @click="toggleHtmlMode">HTML</Button>
      </div>
    </div>
    <Textarea v-if="htmlMode" v-model="htmlDraft" class="min-h-80 resize-y font-mono text-sm" aria-label="HTML 源码" @update:model-value="updateHtml" />
    <EditorContent v-else :editor="editor" class="product-editor-content min-h-80 px-2 py-1" />
    <MediaPickerDialog v-model:open="pickerOpen" @select="insertImage" />
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { AlignLeftIcon, BoldIcon, Heading1Icon, Heading2Icon, Heading3Icon, HighlighterIcon, ImageIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, MinusIcon, PaletteIcon, QuoteIcon, Redo2Icon, RemoveFormattingIcon, Repeat2Icon, Undo2Icon } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import MediaPickerDialog from "@/components/admin/MediaPickerDialog.vue";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const pickerOpen = ref(false); const linkOpen = ref(false); const textColorOpen = ref(false); const highlightOpen = ref(false); const htmlMode = ref(false); const linkUrl = ref(""); const textColorValue = ref(""); const highlightValue = ref(""); const textColorFormat = ref<"hex" | "rgba">("hex"); const highlightFormat = ref<"hex" | "rgba">("hex"); const htmlDraft = ref(props.modelValue);
const textColors = [{ value: "#111827", label: "深灰" }, { value: "#2563eb", label: "蓝色" }, { value: "#7c3aed", label: "紫色" }, { value: "#dc2626", label: "红色" }, { value: "#16a34a", label: "绿色" }, { value: "#ea580c", label: "橙色" }];
const highlightColors = [{ value: "#fef08a", label: "黄色高亮" }, { value: "#bfdbfe", label: "蓝色高亮" }, { value: "#fecdd3", label: "粉色高亮" }, { value: "#bbf7d0", label: "绿色高亮" }, { value: "#e9d5ff", label: "紫色高亮" }];
const editor = useEditor({ content: props.modelValue, extensions: [StarterKit, Link.configure({ openOnClick: false }), Image.configure({ allowBase64: false }), TextStyle, Color.configure({ types: ["textStyle"] }), Highlight.configure({ multicolor: true }), Placeholder.configure({ placeholder: "编辑商品详情..." })], onUpdate: ({ editor: instance }) => emit("update:modelValue", instance.getHTML()) });
const formatTools = [
  { label: "正文", icon: AlignLeftIcon, active: () => editor.value?.isActive("paragraph"), action: setParagraph },
  { label: "标题 1", icon: Heading1Icon, active: () => editor.value?.isActive("heading", { level: 1 }), action: () => setHeading(1) },
  { label: "标题 2", icon: Heading2Icon, active: () => editor.value?.isActive("heading", { level: 2 }), action: () => setHeading(2) },
  { label: "标题 3", icon: Heading3Icon, active: () => editor.value?.isActive("heading", { level: 3 }), action: () => setHeading(3) },
  { label: "粗体", icon: BoldIcon, active: () => editor.value?.isActive("bold"), action: () => editor.value?.chain().focus().toggleBold().run() },
  { label: "斜体", icon: ItalicIcon, active: () => editor.value?.isActive("italic"), action: () => editor.value?.chain().focus().toggleItalic().run() },
  { label: "引用", icon: QuoteIcon, active: () => editor.value?.isActive("blockquote"), action: () => editor.value?.chain().focus().toggleBlockquote().run() },
  { label: "无序列表", icon: ListIcon, active: () => editor.value?.isActive("bulletList"), action: () => editor.value?.chain().focus().toggleBulletList().run() },
  { label: "有序列表", icon: ListOrderedIcon, active: () => editor.value?.isActive("orderedList"), action: () => editor.value?.chain().focus().toggleOrderedList().run() },
];
function setParagraph() { editor.value?.chain().focus().setParagraph().run(); }
function setHeading(level: 1 | 2 | 3) { editor.value?.chain().focus().setHeading({ level }).run(); }
function syncLinkUrl() { linkUrl.value = editor.value?.getAttributes("link").href ?? ""; }
function applyLink() { const url = linkUrl.value.trim(); if (!url) return unsetLink(); editor.value?.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); linkOpen.value = false; }
function unsetLink() { editor.value?.chain().focus().unsetLink().run(); linkUrl.value = ""; linkOpen.value = false; }
function insertImage(src: string) { editor.value?.chain().focus().setImage({ src }).run(); }
function isColorValue(value: string, format?: "hex" | "rgba") { const normalized = value.trim(); return (format !== "rgba" && /^#[0-9a-f]{6}$/i.test(normalized)) || (format !== "hex" && /^rgba\((?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]),(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]),(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]),(?:0|1|0?\.\d+|1\.0+)\)$/i.test(normalized)); }
function normalizeColorValue(value: string) { return value.trim().toLowerCase(); }
function nextColorFormat(format: "hex" | "rgba") { return format === "hex" ? "rgba" : "hex"; }
function colorPlaceholder(format: "hex" | "rgba") { return format === "hex" ? "#2563EB" : "37,99,235,0.5"; }
function toRgbaInput(value: string) { const hex = value.trim().match(/^#([0-9a-f]{6})$/i)?.[1]; const rgba = value.trim().match(/^rgba\((\d+),(\d+),(\d+),([^)]+)\)$/i); if (hex) return `${Number.parseInt(hex.slice(0, 2), 16)},${Number.parseInt(hex.slice(2, 4), 16)},${Number.parseInt(hex.slice(4, 6), 16)},1`; return rgba ? `${rgba[1]},${rgba[2]},${rgba[3]},${rgba[4]}` : value; }
function toRgba(value: string) { return `rgba(${value.trim()})`; }
function toHex(value: string) { const match = value.trim().match(/^(?:rgba\()?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,[^)]+\)?$/i); return match ? `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}` : value; }

function setTextColor(color: string) { editor.value?.chain().focus().setColor(color).run(); textColorValue.value = textColorFormat.value === "rgba" ? toRgbaInput(color) : color; textColorOpen.value = false; }
function applyTextColorValue() { const value = textColorFormat.value === "rgba" ? toRgba(textColorValue.value) : textColorValue.value; if (isColorValue(value, textColorFormat.value)) editor.value?.chain().focus().setColor(normalizeColorValue(value)).run(); }
function toggleTextColorFormat() { textColorFormat.value = nextColorFormat(textColorFormat.value); textColorValue.value = textColorFormat.value === "rgba" ? toRgbaInput(textColorValue.value) : toHex(textColorValue.value); }
function unsetTextColor() { editor.value?.chain().focus().unsetColor().run(); textColorValue.value = ""; textColorOpen.value = false; }
function setHighlight(color: string) { editor.value?.chain().focus().setHighlight({ color }).run(); highlightValue.value = highlightFormat.value === "rgba" ? toRgbaInput(color) : color; highlightOpen.value = false; }
function applyHighlightValue() { const value = highlightFormat.value === "rgba" ? toRgba(highlightValue.value) : highlightValue.value; if (isColorValue(value, highlightFormat.value)) editor.value?.chain().focus().setHighlight({ color: normalizeColorValue(value) }).run(); }
function toggleHighlightFormat() { highlightFormat.value = nextColorFormat(highlightFormat.value); highlightValue.value = highlightFormat.value === "rgba" ? toRgbaInput(highlightValue.value) : toHex(highlightValue.value); }
function unsetHighlight() { editor.value?.chain().focus().unsetHighlight().run(); highlightValue.value = ""; highlightOpen.value = false; }
function toggleHtmlMode() { if (htmlMode.value) { editor.value?.commands.setContent(htmlDraft.value, { emitUpdate: false }); emit("update:modelValue", editor.value?.getHTML() ?? ""); } else htmlDraft.value = editor.value?.getHTML() ?? ""; htmlMode.value = !htmlMode.value; }
function updateHtml(value: string | number) { htmlDraft.value = String(value); emit("update:modelValue", htmlDraft.value); }
onBeforeUnmount(() => editor.value?.destroy());
</script>
<style>
.product-editor-content .ProseMirror { min-height: 20rem; outline: none; }
.product-editor-content .ProseMirror p { margin: 0.5rem 0; }
.product-editor-content .ProseMirror h1 { margin: 1rem 0 0.5rem; font-size: 1.5rem; font-weight: 700; }
.product-editor-content .ProseMirror h2 { margin: 1rem 0 0.5rem; font-size: 1.25rem; font-weight: 700; }
.product-editor-content .ProseMirror h3 { margin: 0.75rem 0 0.5rem; font-size: 1.1rem; font-weight: 600; }
.product-editor-content .ProseMirror ul, .product-editor-content .ProseMirror ol { padding-left: 1.5rem; }
.product-editor-content .ProseMirror blockquote { border-left: 3px solid var(--border); padding-left: 0.75rem; }
.product-editor-content .ProseMirror img { max-width: 100%; height: auto; }
</style>
