<script setup lang="ts">
import { formatDateTime, type SessionSummary } from "@gitpulse/shared";
import { onMounted, ref } from "vue";
import {
  type BackendStatus,
  backendStatusFromError,
  createServerClient,
} from "../lib/server";
import BackendStatusNotice from "./BackendStatusNotice.vue";

const props = defineProps<{
  apiBaseUrl: string;
}>();

const client = createServerClient(props.apiBaseUrl);
const summary = ref<SessionSummary | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);
const backendStatus = ref<BackendStatus | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;
  backendStatus.value = null;

  try {
    summary.value = await client.sessions();
  } catch (error) {
    summary.value = null;
    pageError.value =
      error instanceof Error ? error.message : "Could not load sessions.";
    backendStatus.value = backendStatusFromError(error, props.apiBaseUrl);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading sessions…</p>
  </section>

  <template v-else>
    <BackendStatusNotice v-if="backendStatus" :status="backendStatus" />

    <section v-else-if="pageError" class="notice notice-error">
      <div>
        <strong>Sessions unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <template v-else-if="summary">
      <section class="stats-grid three-up">
        <article class="stat-card">
          <span class="label">Total Minutes</span>
          <strong>{{ summary.total_minutes }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Average Session</span>
          <strong>{{ summary.average_length_minutes }} min</strong>
        </article>
        <article class="stat-card">
          <span class="label">Longest Session</span>
          <strong>{{ summary.longest_session_minutes }} min</strong>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Recent Sessions</h3></div>
        <div v-if="summary.sessions.length" class="list-stack">
          <div v-for="session in summary.sessions" :key="session.id" class="list-row simple">
            <div>
              <strong>{{ session.active_minutes }} min</strong>
              <p>
                {{ formatDateTime(session.started_at) }} to
                {{ formatDateTime(session.ended_at) }}
              </p>
            </div>
            <span class="chip">{{ session.total_changed_lines }} changed lines</span>
          </div>
        </div>
        <div v-else class="empty-guide compact-guide">
          <p class="empty-state">
            No sessions recorded yet. Sessions are derived data, so a fresh
            database stays blank until you import or rescan activity and then
            rebuild analytics.
          </p>
          <ol class="step-list">
            <li>Import recent history to backfill commit activity.</li>
            <li>Rescan active repositories to record current working-tree changes.</li>
            <li>Run rebuild analytics so GitPulse can derive session windows.</li>
          </ol>
        </div>
      </section>
    </template>
  </template>
</template>
