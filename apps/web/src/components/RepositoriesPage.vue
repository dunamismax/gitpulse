<script setup lang="ts">
import type { RepoCard, SettingsView } from '@gitpulse-vnext/contracts';
import { computed, onMounted, ref } from 'vue';
import { GitPulseClient } from '../lib/client';
import ActionCenter from './ActionCenter.vue';
import RepositoryListManager from './RepositoryListManager.vue';

const client = new GitPulseClient();
const repoCards = ref<RepoCard[]>([]);
const settings = ref<SettingsView | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);
const importDays = computed(
  () => settings.value?.config.monitoring.import_days ?? 30
);

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;

  try {
    const [repos, settingsData] = await Promise.all([
      client.repositories(),
      client.settings(),
    ]);
    repoCards.value = repos;
    settings.value = settingsData;
  } catch (error) {
    repoCards.value = [];
    settings.value = null;
    pageError.value =
      error instanceof Error ? error.message : 'Could not load repositories.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading repositories...</p>
  </section>

  <template v-else>
    <section v-if="pageError" class="notice notice-error">
      <div>
        <strong>Repositories unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <template v-else>
      <ActionCenter
        :import-days="importDays"
        :tracked-total="repoCards.length"
      />

      <RepositoryListManager :initial-cards="repoCards" />
    </template>
  </template>
</template>
