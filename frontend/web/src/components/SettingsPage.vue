<script setup lang="ts">
import type { SettingsView } from "@gitpulse/shared";
import { onMounted, ref } from "vue";
import {
  type BackendStatus,
  backendStatusFromError,
  createServerClient,
} from "../lib/server";
import BackendStatusNotice from "./BackendStatusNotice.vue";
import SettingsForm from "./SettingsForm.vue";

const props = defineProps<{
  apiBaseUrl: string;
}>();

const client = createServerClient(props.apiBaseUrl);
const settings = ref<SettingsView | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);
const backendStatus = ref<BackendStatus | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;
  backendStatus.value = null;

  try {
    settings.value = await client.settings();
  } catch (error) {
    settings.value = null;
    pageError.value =
      error instanceof Error ? error.message : "Could not load settings.";
    backendStatus.value = backendStatusFromError(error, props.apiBaseUrl);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading settings…</p>
  </section>

  <template v-else>
    <BackendStatusNotice v-if="backendStatus" :status="backendStatus" />

    <section v-else-if="pageError" class="notice notice-error">
      <div>
        <strong>Settings unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <SettingsForm v-else-if="settings" :api-base-url="apiBaseUrl" :settings="settings" />
  </template>
</template>
