<template>
  <div class="flex items-center gap-1">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="ghost" size="icon" :aria-label="messages.preferences.language" :title="messages.preferences.language">
          <LanguagesIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" :side-offset="8" class="w-36">
        <DropdownMenuLabel>{{ messages.preferences.language }}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem @select="setLocale('zh-CN')">{{ zhCN.languageName }}</DropdownMenuItem>
          <DropdownMenuItem @select="setLocale('zh-TW')">{{ zhTW.languageName }}</DropdownMenuItem>
          <DropdownMenuItem @select="setLocale('en-US')">{{ enUS.languageName }}</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button type="button" variant="ghost" size="icon" :aria-label="theme === 'light' ? messages.preferences.dark : messages.preferences.light" :title="theme === 'light' ? messages.preferences.dark : messages.preferences.light" @click="setTheme(theme === 'light' ? 'dark' : 'light')">
      <SunIcon v-if="theme === 'light'" />
      <MoonIcon v-else />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { LanguagesIcon, MoonIcon, SunIcon } from "@lucide/vue";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import enUS from "@/lib/i18n/en-US";
import zhCN from "@/lib/i18n/zh-CN";
import zhTW from "@/lib/i18n/zh-TW";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

const { messages, setLocale, setTheme, theme } = useStorefrontPreferences();
</script>
