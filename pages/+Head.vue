<template>
  <link rel="icon" :href="iconUrl" />
  <link rel="apple-touch-icon" :href="iconUrl" />
  <link v-if="seo.canonicalUrl" rel="canonical" :href="seo.canonicalUrl" />
  <meta v-if="seo.robots" name="robots" :content="seo.robots" />
  <template v-if="!seo.robots">
    <meta property="og:type" :content="seo.ogType" />
    <meta property="og:title" :content="seo.title" />
    <meta property="og:description" :content="seo.description" />
    <meta property="og:site_name" :content="seo.siteName" />
    <meta v-if="seo.canonicalUrl" property="og:url" :content="seo.canonicalUrl" />
    <meta v-if="seo.imageUrl" property="og:image" :content="seo.imageUrl" />
    <meta name="twitter:card" :content="seo.imageUrl ? 'summary_large_image' : 'summary'" />
    <meta name="twitter:title" :content="seo.title" />
    <meta name="twitter:description" :content="seo.description" />
    <meta v-if="seo.imageUrl" name="twitter:image" :content="seo.imageUrl" />
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import defaultLogoUrl from "@/assets/logo.svg?url";

type Site = { name?: string; subtitle?: string | null; siteUrl?: string | null; logo?: string | null; logoIcon?: string | null };
type ProductData = { name?: string; subtitle?: string | null; description?: string | null; coverImage?: string | null };
type SeoPageContext = { site?: Site; data?: ProductData; urlPathname?: string; routeParams?: { adminPath?: string }; urlParsed?: { origin?: string } };

const pageContext = usePageContext() as SeoPageContext;
const isPrivatePage = computed(() => {
  const pathname = pageContext.urlPathname || "/";
  return Boolean(pageContext.routeParams?.adminPath) || pathname === "/setup" || pathname === "/order" || pathname === "/checkout" || pathname === "/payment-result" || pathname.startsWith("/_error");
});
const siteUrl = computed(() => normalizeOrigin(pageContext.site?.siteUrl) || normalizeOrigin(pageContext.urlParsed?.origin));
const iconUrl = computed(() => pageContext.site?.logoIcon || pageContext.site?.logo || defaultLogoUrl);
const seo = computed(() => {
  const siteName = pageContext.site?.name || "CFFK-Shop";
  const product = pageContext.data;
  const isProductPage = Boolean(product?.name && (pageContext.urlPathname || "").startsWith("/product/"));
  const title = isProductPage ? `${product?.name} - ${siteName}` : siteName;
  const description = isProductPage
    ? product?.subtitle?.trim() || toPlainText(product?.description) || pageContext.site?.subtitle || "自动发卡系统"
    : pageContext.site?.subtitle || "自动发卡系统";
  const canonicalUrl = !isPrivatePage.value && siteUrl.value ? new URL(pageContext.urlPathname || "/", `${siteUrl.value}/`).toString() : null;
  const imageUrl = !isPrivatePage.value ? toAbsoluteUrl(product?.coverImage || pageContext.site?.logoIcon || pageContext.site?.logo || defaultLogoUrl, siteUrl.value) : null;

  return {
    title,
    description,
    siteName,
    canonicalUrl,
    imageUrl,
    ogType: isProductPage ? "product" : "website",
    robots: isPrivatePage.value ? "noindex,nofollow,noarchive" : null,
  };
});

function toPlainText(value: string | null | undefined) {
  return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "";
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function toAbsoluteUrl(value: string | null | undefined, origin: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, origin || undefined);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
</script>
