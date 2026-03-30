<script setup lang="ts">
import {
  type DashboardView,
  formatDateTime,
  formatMinutes,
  heatmapClass,
  type SettingsView,
  sumLines,
} from "@gitpulse/shared";
import { computed, onMounted, ref } from "vue";
import {
  type BackendStatus,
  backendStatusFromError,
  createServerClient,
} from "../lib/server";
import ActionCenter from "./ActionCenter.vue";
import BackendStatusNotice from "./BackendStatusNotice.vue";

const props = defineProps<{
  apiBaseUrl: string;
}>();

const client = createServerClient(props.apiBaseUrl);
const dashboard = ref<DashboardView | null>(null);
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
    const [dashboardData, settingsData] = await Promise.all([
      client.dashboard(),
      client.settings(),
    ]);
    dashboard.value = dashboardData;
    settings.value = settingsData;
  } catch (error) {
    dashboard.value = null;
    settings.value = null;
    pageError.value =
      error instanceof Error ? error.message : "Could not load the dashboard.";
    backendStatus.value = backendStatusFromError(error, props.apiBaseUrl);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading dashboard…</p>
  </section>

  <template v-else>
    <BackendStatusNotice v-if="backendStatus" :status="backendStatus" />

    <section v-else-if="pageError" class="notice notice-error">
      <div>
        <strong>Dashboard unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <template v-else-if="dashboard">
      <ActionCenter
        :api-base-url="apiBaseUrl"
        :import-days="importDays"
        :tracked-total="dashboard.repo_cards.length"
      />

      <section v-if="dashboard.repo_cards.length === 0" class="panel empty-guide">
        <div class="panel-head">
          <div>
            <h3>First Run Guide</h3>
            <p class="panel-copy">
              A brand-new database is expected to look quiet. GitPulse only
              shows what you have explicitly imported or scanned.
            </p>
          </div>
          <span class="chip">Empty state</span>
        </div>
        <ol class="step-list">
          <li>
            Add a repository or parent folder so GitPulse has local roots to
            inspect.
          </li>
          <li>
            Import recent history to backfill commits and push visibility.
          </li>
          <li>
            Rescan and rebuild so sessions, rollups, and score reflect current
            local truth.
          </li>
        </ol>
      </section>

      <section class="stats-grid six-up">
        <article class="stat-card">
          <span class="label">Live Lines</span>
          <strong>{{ dashboard.summary.live_lines }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Staged Lines</span>
          <strong>{{ dashboard.summary.staged_lines }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Commits Today</span>
          <strong>{{ dashboard.summary.commits_today }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Pushes Today</span>
          <strong>{{ dashboard.summary.pushes_today }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Active Session</span>
          <strong>{{ formatMinutes(dashboard.summary.active_session_minutes) }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Streak / Score</span>
          <strong>
            {{ dashboard.summary.streak_days }} /
            {{ dashboard.summary.today_score }}
          </strong>
        </article>
      </section>

      <section class="split-grid">
        <article class="panel">
          <div class="panel-head">
            <h3>30 Day Trend</h3>
            <span class="chip">Changed lines + score</span>
          </div>
          <div v-if="dashboard.trend_points.length" class="trend-bars">
            <span
              v-for="point in dashboard.trend_points"
              :key="point.day"
              :title="`${point.day}: score ${point.score}`"
              :style="{ height: `${Math.max(point.score, 4)}px` }"
            />
          </div>
          <p v-else class="empty-state">
            No trend data yet. Import history and rebuild analytics to seed the
            chart.
          </p>
        </article>

        <article class="panel">
          <div class="panel-head">
            <h3>12 Week Heatmap</h3>
            <span class="chip">Consistency</span>
          </div>
          <div v-if="dashboard.heatmap_days.length" class="heatmap-grid">
            <span
              v-for="point in dashboard.heatmap_days"
              :key="point.day"
              :class="`heat-cell ${heatmapClass(point.score)}`"
              :title="`${point.day}: score ${point.score}`"
            />
          </div>
          <p v-else class="empty-state">
            No heatmap yet. Rebuild analytics after importing history to
            populate consistency data.
          </p>
        </article>
      </section>

      <section class="split-grid">
        <article class="panel">
          <div class="panel-head">
            <h3>Activity Feed</h3>
            <span class="chip">Live</span>
          </div>
          <div v-if="dashboard.activity_feed.length" class="list-stack">
            <div v-for="item in dashboard.activity_feed" :key="`${item.kind}:${item.timestamp}:${item.repo_name}`" class="list-row">
              <div>
                <strong>{{ item.repo_name }}</strong>
                <p>{{ item.detail }}</p>
              </div>
              <div class="row-meta">
                <span>{{ item.kind }}</span>
                <time>{{ formatDateTime(item.timestamp) }}</time>
              </div>
            </div>
          </div>
          <p v-else class="empty-state">
            No recent activity yet. Run a rescan after making local changes to
            record new working-tree state.
          </p>
        </article>

        <article class="panel">
          <div class="panel-head">
            <h3>Goals</h3>
            <span class="chip">Transparent scoring</span>
          </div>
          <div v-if="dashboard.summary.goals.length" class="goal-stack">
            <div v-for="goal in dashboard.summary.goals" :key="goal.label">
              <div class="goal-head">
                <span>{{ goal.label }}</span>
                <strong>{{ goal.current }}/{{ goal.target }}</strong>
              </div>
              <div class="progress">
                <span :style="{ width: `${goal.percent}%` }" />
              </div>
            </div>
          </div>
          <p v-else class="empty-state">
            No goals configured. Set daily targets on the settings page if you
            want score progress to anchor to something specific.
          </p>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>Repository Pulse</h3>
            <p class="panel-copy">
              Quick status from the Go runtime, rendered through the shipped
              Astro + Vue frontend.
            </p>
          </div>
          <span class="chip">{{ dashboard.repo_cards.length }} tracked</span>
        </div>
        <div v-if="dashboard.repo_cards.length" class="repo-grid">
          <article v-for="card in dashboard.repo_cards" :key="card.repo.id" class="panel repo-card">
            <div class="repo-card-head">
              <div>
                <p class="eyebrow-subtle">{{ card.health }}</p>
                <h3>
                  <a :href="`/repositories/${card.repo.id}`">{{ card.repo.name }}</a>
                </h3>
                <p>{{ card.repo.root_path }}</p>
              </div>
              <span class="chip">{{ card.repo.state }}</span>
            </div>

            <div class="repo-stat-grid">
              <div>
                <small>Branch</small>
                <strong>{{ card.snapshot?.branch || "(detached)" }}</strong>
              </div>
              <div>
                <small>Score</small>
                <strong>{{ card.metrics?.score ?? 0 }}</strong>
              </div>
              <div>
                <small>Changed lines</small>
                <strong>
                  {{
                    card.snapshot
                      ? sumLines(
                          card.snapshot.live_additions +
                            card.snapshot.staged_additions,
                          card.snapshot.live_deletions +
                            card.snapshot.staged_deletions,
                        )
                      : 0
                  }}
                </strong>
              </div>
              <div>
                <small>Focus time</small>
                <strong>{{ formatMinutes(card.metrics?.focus_minutes ?? 0) }}</strong>
              </div>
            </div>

            <div class="sparkline" aria-hidden="true">
              <span
                v-for="(value, index) in card.sparkline"
                :key="`${card.repo.id}:${index}`"
                :style="{ height: `${Math.max(value, 8)}px` }"
              />
            </div>
          </article>
        </div>
        <p v-else class="empty-state">
          No repositories tracked yet. Add one on the repositories page, then
          come back once import and rescan have populated the dashboard.
        </p>
      </section>
    </template>
  </template>
</template>
