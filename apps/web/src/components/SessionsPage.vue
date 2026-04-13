<script setup lang="ts">
import type { SessionSummary } from '@gitpulse-vnext/contracts';
import { onMounted, ref } from 'vue';
import { GitPulseClient } from '../lib/client';
import { formatDateTime, formatMinutes } from '../lib/format';

const client = new GitPulseClient();
const summary = ref<SessionSummary | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;

  try {
    summary.value = await client.sessions();
  } catch (error) {
    summary.value = null;
    pageError.value =
      error instanceof Error ? error.message : 'Could not load sessions.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading sessions...</p>
  </section>

  <template v-else>
    <section v-if="pageError" class="notice notice-error">
      <div>
        <strong>Sessions unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <template v-else-if="summary">
      <section class="stats-grid four-up">
        <article class="stat-card">
          <span class="label">Total Time</span>
          <strong>{{ formatMinutes(summary.total_minutes) }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Sessions</span>
          <strong>{{ summary.sessions.length }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Avg Length</span>
          <strong>{{ formatMinutes(summary.average_length_minutes) }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Longest</span>
          <strong>{{ formatMinutes(summary.longest_session_minutes) }}</strong>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Recent Sessions</h3>
          <span class="chip">{{ summary.sessions.length }}</span>
        </div>
        <div v-if="summary.sessions.length" class="list-stack">
          <div
            v-for="session in summary.sessions"
            :key="session.id"
            class="list-row"
          >
            <div>
              <strong>{{ formatMinutes(session.active_minutes) }}</strong>
              <p>
                {{ session.total_changed_lines }} lines changed across
                {{ session.event_count }} events
              </p>
            </div>
            <div class="row-meta">
              <span>{{ session.repo_ids.length }} repo(s)</span>
              <time>{{ formatDateTime(session.started_at) }}</time>
            </div>
          </div>
        </div>
        <div v-else>
          <p class="empty-state">
            No focus sessions computed yet. Sessions are derived from activity
            timestamps during analytics rebuild.
          </p>
          <ol class="step-list">
            <li>Add repositories on the Repositories page.</li>
            <li>Import history to backfill commit and file activity.</li>
            <li>Rebuild analytics on the dashboard to compute sessions.</li>
          </ol>
        </div>
      </section>
    </template>
  </template>
</template>
