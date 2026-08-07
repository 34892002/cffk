<template>
  <section class="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
    正在进入邮件统计...
  </section>
</template>

<script lang="ts" setup>
import { onMounted } from "vue";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-vue/usePageContext";

const pageContext = usePageContext();

onMounted(() => {
  void navigate(`/${pageContext.routeParams.adminPath}/mail/overview`);
});
</script>
