<template>
  <footer>
    <div class="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p class="whitespace-pre-wrap">{{ site.footerText }}</p>
      <DropdownMenu v-if="supportContacts.length > 1">
        <DropdownMenuTrigger as-child>
          <Button type="button" variant="outline" size="sm">
            <HeadphonesIcon data-icon="inline-start" />
            {{ messages.storefront.contactSupport }}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-44">
          <DropdownMenuItem v-for="contact in supportContacts" :key="`${contact.label}-${contact.href}`" as-child>
            <a :href="contact.href" target="_blank" rel="noopener noreferrer">{{ contact.label }}</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <a v-else-if="supportContacts[0]" :href="supportContacts[0].href" class="hover:text-foreground hover:underline" target="_blank" rel="noopener noreferrer">
        {{ supportContacts[0].label }}
      </a>
    </div>
  </footer>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { HeadphonesIcon } from "@lucide/vue";
import { usePageContext } from "vike-vue/usePageContext";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useStorefrontPreferences } from "@/lib/storefront-preferences";

type Site = {
  supportContact: string | null;
  footerText: string | null;
};

type SupportContact = {
  label: string;
  href: string;
};

const pageContext = usePageContext() as unknown as { site: Site };
const site = pageContext.site;
const { messages } = useStorefrontPreferences();
const supportContacts = computed<SupportContact[]>(() => (site.supportContact ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const separatorIndex = line.indexOf("|");
    const label = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : line;
    const address = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : line;
    if (!label || !address) return null;
    return { label, href: address.includes(":") ? address : `mailto:${address}` };
  })
  .filter((contact): contact is SupportContact => contact !== null));
</script>
