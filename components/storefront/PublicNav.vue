<template>
  <nav class="flex shrink-0 items-center gap-1" :aria-label="messages.nav.main">
    <template v-if="user">
      <Button size="sm" variant="ghost" as-child><a href="/account/order"><ClipboardListIcon data-icon="inline-start" />{{ messages.nav.myOrders }}</a></Button>
    </template>
    <template v-else>
      <a class="pr-2" href="/order">{{ messages.nav.orderLookup }}</a>
    </template>
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
    <Button
      type="button"
      variant="ghost"
      size="icon"
      :aria-label="theme === 'light' ? messages.preferences.dark : messages.preferences.light"
      :title="theme === 'light' ? messages.preferences.dark : messages.preferences.light"
      @click="setTheme(theme === 'light' ? 'dark' : 'light')"
    >
      <SunIcon v-if="theme === 'light'" />
      <MoonIcon v-else />
    </Button>
    <template v-if="!user">
      <Button size="sm" as-child><a href="/login">{{ messages.nav.signIn }}</a></Button>
    </template>
    <template v-else>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button type="button" variant="ghost" size="icon" class="rounded-full" :aria-label="t(messages.nav.accountMenu, { name: currentUserName })">
            <Avatar class="size-8"><AvatarFallback>{{ userInitials }}</AvatarFallback></Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" :side-offset="8" class="w-48">
          <DropdownMenuLabel>{{ currentUserName }}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem as-child><a href="/account"><UserRoundCogIcon data-icon="inline-start" />{{ messages.nav.accountSettings }}</a></DropdownMenuItem>
            <DropdownMenuItem :disabled="signingOut" @select="signOut"><LogOutIcon data-icon="inline-start" />{{ signingOut ? messages.nav.signingOut : messages.nav.signOut }}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ClipboardListIcon, LanguagesIcon, LogOutIcon, MoonIcon, SunIcon, UserRoundCogIcon } from "@lucide/vue";

import { usePageContext } from "vike-vue/usePageContext";
import { toast } from "vue-sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import enUS from "@/lib/i18n/en-US";
import zhCN from "@/lib/i18n/zh-CN";
import zhTW from "@/lib/i18n/zh-TW";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

type PublicUser = { id: string; name?: string | null; email?: string | null };

const pageContext = usePageContext() as ReturnType<typeof usePageContext> & { user?: PublicUser | null };
const user = pageContext.user ?? null;
const currentUserName = computed(() => user?.name?.trim() || user?.email || messages.value.nav.account);
const userInitials = computed(() => currentUserName.value.slice(0, 1).toUpperCase());
const signingOut = ref(false);
const { messages, setLocale, setTheme, t, theme } = useStorefrontPreferences();

async function signOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  try {
    const result = await authClient.signOut();
    if (result.error) {
      toast.error(messages.value.nav.signOutFailed);
      return;
    }
    toast.success(messages.value.nav.signedOut);
    window.location.assign("/");
  } catch {
    toast.error(messages.value.nav.signOutFailed);
  } finally {
    signingOut.value = false;
  }
}
</script>
