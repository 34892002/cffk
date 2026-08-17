<template>
  <Alert variant="destructive" class="max-w-2xl">
    <AlertTitle>{{ heading }}</AlertTitle>
    <AlertDescription>{{ abortReason }}</AlertDescription>
  </Alert>
</template>

<script lang="ts" setup>
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageContext } from "vike-vue/usePageContext";
const pageContext = usePageContext();
let { is404, abortReason } = pageContext;
if (!abortReason) abortReason = is404 ? "This page could not be found." : "Something went wrong.";
const heading = is404 ? "Page Not Found" : "Internal Error";
</script>
