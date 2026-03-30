<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { PageFlashMessage } from "../lib/flash";
import { takePageFlash } from "../lib/flash";

const flash = ref<PageFlashMessage | null>(null);

onMounted(() => {
  flash.value = takePageFlash();
});
</script>

<template>
  <section v-if="flash" :class="['notice', flash.level === 'error' ? 'notice-error' : 'notice-success']">
    <div>
      <strong>{{ flash.level === 'error' ? 'Action failed' : 'Action complete' }}</strong>
      <p>{{ flash.message }}</p>
    </div>
    <button class="notice-close" type="button" aria-label="Dismiss message" @click="flash = null">
      ×
    </button>
  </section>
</template>

<style scoped>
.notice {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
}

.notice-success {
  background: rgba(16, 185, 129, 0.14);
  border-color: rgba(16, 185, 129, 0.35);
}

.notice-error {
  background: rgba(239, 68, 68, 0.14);
  border-color: rgba(239, 68, 68, 0.35);
}

strong,
p {
  margin: 0;
}

p {
  margin-top: 0.25rem;
  color: #cbd5e1;
}

.notice-close {
  border: 0;
  background: transparent;
  color: #e2e8f0;
  font-size: 1.2rem;
  cursor: pointer;
}
</style>
