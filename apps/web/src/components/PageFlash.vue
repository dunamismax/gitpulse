<script setup lang="ts">
import { onMounted, ref } from 'vue';

const message = ref<string | null>(null);
const kind = ref<'success' | 'error'>('success');

onMounted(() => {
  const stored = sessionStorage.getItem('gitpulse:flash');
  if (!stored) return;
  sessionStorage.removeItem('gitpulse:flash');

  try {
    const parsed = JSON.parse(stored) as { message: string; kind: string };
    message.value = parsed.message;
    kind.value = parsed.kind === 'error' ? 'error' : 'success';
  } catch {
    message.value = stored;
  }
});

function dismiss() {
  message.value = null;
}
</script>

<template>
  <div
    v-if="message"
    :class="['notice', kind === 'error' ? 'notice-error' : 'notice-success']"
    style="display: flex; justify-content: space-between; align-items: center"
  >
    <p>{{ message }}</p>
    <button class="button-secondary" style="min-height: auto; padding: 0.4rem 0.7rem" @click="dismiss">
      Dismiss
    </button>
  </div>
</template>
