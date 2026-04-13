<script setup lang="ts">
import type { SettingsView } from '@gitpulse-vnext/contracts';
import { onMounted, ref } from 'vue';
import { GitPulseClient } from '../lib/client';
import SettingsForm from './SettingsForm.vue';

const client = new GitPulseClient();
const settings = ref<SettingsView | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;

  try {
    settings.value = await client.settings();
  } catch (error) {
    settings.value = null;
    pageError.value =
      error instanceof Error ? error.message : 'Could not load settings.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading settings...</p>
  </section>

  <template v-else>
    <section v-if="pageError" class="notice notice-error">
      <div>
        <strong>Settings unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <SettingsForm v-else-if="settings" :settings="settings" />
  </template>
</template>
