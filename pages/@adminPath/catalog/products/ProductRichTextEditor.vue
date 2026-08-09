<template>
  <div class="grid gap-2 rounded-md border p-2">
    <div class="flex flex-wrap gap-1 border-b pb-2">
      <Button v-for="item in tools" :key="item.label" type="button" variant="ghost" size="icon-sm" :aria-label="item.label" :title="item.label" :disabled="!editor" @click="item.action"><component :is="item.icon" /></Button>
      <div class="flex items-center gap-1"><Input v-model="linkUrl" class="h-8 w-44" placeholder="选中文本后输入链接" aria-label="链接地址" @keyup.enter="applyLink" /><Button type="button" variant="ghost" size="icon-sm" aria-label="应用链接" title="应用链接" @click="applyLink"><LinkIcon /></Button></div><Button type="button" variant="ghost" size="icon-sm" aria-label="分割线" title="分割线" @click="editor?.chain().focus().setHorizontalRule().run()"><MinusIcon /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="插入媒体图片" title="插入媒体图片" @click="pickerOpen = true"><ImageIcon /></Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="清除格式" title="清除格式" @click="editor?.chain().focus().clearNodes().unsetAllMarks().run()"><RemoveFormattingIcon /></Button>
    </div>
    <EditorContent :editor="editor" class="product-editor-content min-h-44 px-2 py-1" />
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
import { BoldIcon, Heading2Icon, Heading3Icon, ImageIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, MinusIcon, QuoteIcon, Redo2Icon, RemoveFormattingIcon, Undo2Icon } from "@lucide/vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import MediaPickerDialog from "@/components/admin/MediaPickerDialog.vue";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const pickerOpen = ref(false); const linkUrl = ref("");
const editor = useEditor({ content: props.modelValue, extensions: [StarterKit, Link.configure({ openOnClick: false }), Image.configure({ allowBase64: false }), Placeholder.configure({ placeholder: "编辑商品详情…" })], onUpdate: ({ editor: instance }) => emit("update:modelValue", instance.getHTML()) });
const tools = [
  { label: "标题 2", icon: Heading2Icon, action: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "标题 3", icon: Heading3Icon, action: () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: "粗体", icon: BoldIcon, action: () => editor.value?.chain().focus().toggleBold().run() },
  { label: "斜体", icon: ItalicIcon, action: () => editor.value?.chain().focus().toggleItalic().run() },
  { label: "引用", icon: QuoteIcon, action: () => editor.value?.chain().focus().toggleBlockquote().run() },
  { label: "无序列表", icon: ListIcon, action: () => editor.value?.chain().focus().toggleBulletList().run() },
  { label: "有序列表", icon: ListOrderedIcon, action: () => editor.value?.chain().focus().toggleOrderedList().run() },
  { label: "撤销", icon: Undo2Icon, action: () => editor.value?.chain().focus().undo().run() },
  { label: "重做", icon: Redo2Icon, action: () => editor.value?.chain().focus().redo().run() },
];
function applyLink() { const url = linkUrl.value.trim(); if (!url) { editor.value?.chain().focus().unsetLink().run(); return; } editor.value?.chain().focus().setLink({ href: url }).run(); }
function insertImage(src: string) { editor.value?.chain().focus().setImage({ src }).run(); }
onBeforeUnmount(() => editor.value?.destroy());
</script>
<style>
.product-editor-content .ProseMirror { min-height: 10rem; outline: none; }
.product-editor-content .ProseMirror p { margin: 0.5rem 0; }
.product-editor-content .ProseMirror h2 { margin: 1rem 0 0.5rem; font-size: 1.25rem; font-weight: 700; }
.product-editor-content .ProseMirror h3 { margin: 0.75rem 0 0.5rem; font-size: 1.1rem; font-weight: 600; }
.product-editor-content .ProseMirror ul, .product-editor-content .ProseMirror ol { padding-left: 1.5rem; }
.product-editor-content .ProseMirror blockquote { border-left: 3px solid var(--border); padding-left: 0.75rem; }
</style>
