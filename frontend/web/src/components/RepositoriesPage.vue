<script setup lang="ts">
import type { RepoCard, SettingsView } from "@gitpulse/shared";
import { computed, onMounted, ref } from "vue";
import {
  type BackendStatus,
  backendStatusFromError,
  createServerClient,
} from "../lib/server";
import ActionCenter from "./ActionCenter.vue";
import BackendStatusNotice from "./BackendStatusNotice.vue";
import RepositoryListManager from "./RepositoryListManager.vue";

const props = defineProps<{
  apiBaseUrl: string;
}>();

const client = createServerClient(props.apiBaseUrl);
const repositories = ref<RepoCard[]>([]);
const settings = ref<SettingsView | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);
const backendStatus = ref<BackendStatus | null>(null);
const importDays = computed(
  () => settings.value?.config.monitoring.import_days ?? 30,
);

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;
  backendStatus.value = null;

  try {
    const [repoCards, settingsData] = await Promise.all([
      client.repositories(),
      client.settings(),
    ]);
    repositories.value = repoCards;
    settings.value = settingsData;
  } catch (error) {
    repositories.value = [];
    settings.value = null;
    pageError.value =
      error instanceof Error ? error.message : "Could not load repositories.";
    backendStatus.value = backendStatusFromError(error, props.apiBaseUrl);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading repositories…</p>
  </section>

  <template v-else>
    <BackendStatusNotice v-if="backendStatus" :status="backendStatus" />

    <section v-else-if="pageError" class="notice notice-error">
      <div>
        <strong>Repository view unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <div v-else class="stack">
      <ActionCenter
        :api-base-url="apiBaseUrl"
        :import-days="importDays"
        :tracked-total="repositories.length"
      />
      <RepositoryListManager
        :api-base-url="apiBaseUrl"
        :initial-cards="repositories"
      />
    </div>
  </template>
</template>
