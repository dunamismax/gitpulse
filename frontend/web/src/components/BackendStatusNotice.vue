<script setup lang="ts">
import type { BackendStatus } from "../lib/server";

defineProps<{
  status: BackendStatus;
}>();
</script>

<template>
  <section class="notice notice-error backend-status">
    <div>
      <strong>{{ status.title }}</strong>
      <p>{{ status.message }}</p>
      <p class="meta-tight">Configured backend origin: <code>{{ status.baseUrl }}</code></p>
      <p class="meta-tight">
        Start the Go server with <code>{{ status.command }}</code> or set
        <code>{{ status.envVar }}</code>.
      </p>
    </div>
  </section>
</template>
