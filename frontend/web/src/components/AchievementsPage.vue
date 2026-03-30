<script setup lang="ts">
import type { AchievementsView } from "@gitpulse/shared";
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
const data = ref<AchievementsView | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);
const backendStatus = ref<BackendStatus | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;
  backendStatus.value = null;

  try {
    data.value = await client.achievements();
  } catch (error) {
    data.value = null;
    pageError.value =
      error instanceof Error ? error.message : "Could not load achievements.";
    backendStatus.value = backendStatusFromError(error, props.apiBaseUrl);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading achievements…</p>
  </section>

  <template v-else>
    <BackendStatusNotice v-if="backendStatus" :status="backendStatus" />

    <section v-else-if="pageError" class="notice notice-error">
      <div>
        <strong>Achievements unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <template v-else-if="data">
      <section class="stats-grid three-up">
        <article class="stat-card">
          <span class="label">Current Streak</span>
          <strong>{{ data.streaks.current_days }} days</strong>
        </article>
        <article class="stat-card">
          <span class="label">Best Streak</span>
          <strong>{{ data.streaks.best_days }} days</strong>
        </article>
        <article class="stat-card">
          <span class="label">Today's Score</span>
          <strong>{{ data.today_score }}</strong>
        </article>
      </section>

      <section v-if="data.achievements.length" class="card-grid three-up">
        <article v-for="achievement in data.achievements" :key="`${achievement.kind}:${achievement.unlocked_at}`" class="panel achievement-card">
          <h3>{{ achievement.kind }}</h3>
          <p>{{ achievement.reason }}</p>
          <small>
            {{ achievement.day ? `Unlocked on ${achievement.day}` : "Unlocked recently" }}
          </small>
        </article>
      </section>

      <section v-else class="panel empty-guide compact-guide">
        <div class="panel-head">
          <div>
            <h3>No achievements yet</h3>
            <p class="panel-copy">
              That usually means GitPulse has not been given enough local history
              to derive milestones, not that anything is broken.
            </p>
          </div>
          <span class="chip">Fresh run</span>
        </div>
        <ol class="step-list">
          <li>
            Import recent history so the first repository and first commit
            milestones can unlock.
          </li>
          <li>
            Rescan and rebuild analytics so sessions, streaks, and score settle
            into place.
          </li>
          <li>
            Check settings if authored commits are missing because author emails
            are not configured.
          </li>
        </ol>
      </section>
    </template>
  </template>
</template>
