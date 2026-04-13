<script setup lang="ts">
import type { AchievementsView } from '@gitpulse-vnext/contracts';
import { onMounted, ref } from 'vue';
import { GitPulseClient } from '../lib/client';
import { formatDateTime } from '../lib/format';

const client = new GitPulseClient();
const view = ref<AchievementsView | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;

  try {
    view.value = await client.achievements();
  } catch (error) {
    view.value = null;
    pageError.value =
      error instanceof Error ? error.message : 'Could not load achievements.';
  } finally {
    loading.value = false;
  }
}

function achievementLabel(kind: string): string {
  return kind.replaceAll('_', ' ');
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading achievements...</p>
  </section>

  <template v-else>
    <section v-if="pageError" class="notice notice-error">
      <div>
        <strong>Achievements unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <template v-else-if="view">
      <section class="stats-grid four-up">
        <article class="stat-card">
          <span class="label">Current Streak</span>
          <strong>{{ view.streaks.current_days }} days</strong>
        </article>
        <article class="stat-card">
          <span class="label">Best Streak</span>
          <strong>{{ view.streaks.best_days }} days</strong>
        </article>
        <article class="stat-card">
          <span class="label">Today Score</span>
          <strong>{{ view.today_score }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Unlocked</span>
          <strong>{{ view.achievements.length }}</strong>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Achievements</h3>
          <span class="chip">{{ view.achievements.length }} unlocked</span>
        </div>
        <div v-if="view.achievements.length" class="card-grid three-up" style="margin-top: 0.75rem">
          <article
            v-for="achievement in view.achievements"
            :key="achievement.kind"
            class="stat-card achievement-card"
          >
            <strong>{{ achievementLabel(achievement.kind) }}</strong>
            <p>{{ achievement.reason }}</p>
            <small>{{ formatDateTime(achievement.unlocked_at) }}</small>
          </article>
        </div>
        <div v-else>
          <p class="empty-state">
            No achievements unlocked yet. Achievements are awarded during
            analytics rebuild based on activity milestones.
          </p>
          <ol class="step-list">
            <li>Add and import repositories to record activity.</li>
            <li>Rebuild analytics to evaluate achievement criteria.</li>
            <li>Keep coding to unlock more milestones.</li>
          </ol>
        </div>
      </section>
    </template>
  </template>
</template>
