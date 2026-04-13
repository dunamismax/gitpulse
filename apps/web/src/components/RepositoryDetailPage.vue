<script setup lang="ts">
import type { RepoDetailView, SettingsView } from '@gitpulse-vnext/contracts';
import { computed, onMounted, ref } from 'vue';
import { GitPulseClient } from '../lib/client';
import {
  formatDateTime,
  formatMinutes,
  pushKindLabel,
  shortSha,
  sumLines,
} from '../lib/format';
import RepoDetailActions from './RepoDetailActions.vue';

const props = defineProps<{
  repoId: string;
}>();

const client = new GitPulseClient();
const detail = ref<RepoDetailView | null>(null);
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
    const [detailData, settingsData] = await Promise.all([
      client.repositoryDetail(props.repoId),
      client.settings(),
    ]);
    detail.value = detailData;
    settings.value = settingsData;
  } catch (error) {
    detail.value = null;
    settings.value = null;
    pageError.value =
      error instanceof Error ? error.message : 'Could not load repository.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading repository detail...</p>
  </section>

  <template v-else>
    <section v-if="pageError" class="notice notice-error">
      <div>
        <strong>Repository unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <template v-else-if="detail">
      <RepoDetailActions
        :repo-id="detail.card.repo.id"
        :repo-state="detail.card.repo.state"
        :include-patterns="detail.include_patterns"
        :exclude-patterns="detail.exclude_patterns"
        :import-days="importDays"
      />

      <section class="stats-grid four-up">
        <article class="stat-card">
          <span class="label">Branch</span>
          <strong>{{ detail.card.snapshot?.branch || '(detached)' }}</strong>
        </article>
        <article class="stat-card">
          <span class="label">Sync</span>
          <strong>
            +{{ detail.card.snapshot?.ahead_count ?? 0 }}
            / -{{ detail.card.snapshot?.behind_count ?? 0 }}
          </strong>
        </article>
        <article class="stat-card">
          <span class="label">Changed Lines</span>
          <strong>
            {{
              detail.card.snapshot
                ? sumLines(
                    detail.card.snapshot.live_additions +
                      detail.card.snapshot.staged_additions,
                    detail.card.snapshot.live_deletions +
                      detail.card.snapshot.staged_deletions,
                  )
                : 0
            }}
          </strong>
        </article>
        <article class="stat-card">
          <span class="label">Score</span>
          <strong>{{ detail.card.metrics?.score ?? 0 }}</strong>
        </article>
      </section>

      <section v-if="detail.language_breakdown.length" class="panel">
        <div class="panel-head">
          <h3>Language Breakdown</h3>
          <span class="chip">{{ detail.language_breakdown.length }} languages</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Language</th>
                <th>Code</th>
                <th>Comments</th>
                <th>Blanks</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="lang in detail.language_breakdown" :key="lang.language">
                <td><strong>{{ lang.language }}</strong></td>
                <td>{{ lang.code }}</td>
                <td>{{ lang.comments }}</td>
                <td>{{ lang.blanks }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="detail.top_files.length" class="panel">
        <div class="panel-head">
          <h3>Top Files</h3>
        </div>
        <div style="margin-top: 0.5rem">
          <span v-for="file in detail.top_files" :key="file" class="file-pill">
            {{ file }}
          </span>
        </div>
      </section>

      <section class="split-grid">
        <article class="panel">
          <div class="panel-head">
            <h3>Recent Commits</h3>
            <span class="chip">{{ detail.recent_commits.length }}</span>
          </div>
          <div v-if="detail.recent_commits.length" class="list-stack">
            <div
              v-for="commit in detail.recent_commits"
              :key="commit.id"
              class="list-row"
            >
              <div>
                <strong>{{ commit.summary }}</strong>
                <p>
                  {{ shortSha(commit.commit_sha) }} -
                  +{{ commit.additions }}/-{{ commit.deletions }}
                  ({{ commit.files_changed }} files)
                  {{ commit.is_merge ? ' [merge]' : '' }}
                </p>
              </div>
              <div class="row-meta">
                <span>{{ commit.author_name || commit.author_email || '-' }}</span>
                <time>{{ formatDateTime(commit.authored_at) }}</time>
              </div>
            </div>
          </div>
          <p v-else class="empty-state">
            No commits imported yet. Run import to backfill history.
          </p>
        </article>

        <article class="panel">
          <div class="panel-head">
            <h3>Recent Pushes</h3>
            <span class="chip">{{ detail.recent_pushes.length }}</span>
          </div>
          <div v-if="detail.recent_pushes.length" class="list-stack">
            <div
              v-for="push in detail.recent_pushes"
              :key="push.id"
              class="list-row"
            >
              <div>
                <strong>{{ pushKindLabel(push.kind) }}</strong>
                <p>
                  {{ shortSha(push.head_sha) }} -
                  {{ push.pushed_commit_count }} commit(s)
                  {{ push.upstream_ref ? `to ${push.upstream_ref}` : '' }}
                </p>
              </div>
              <div class="row-meta">
                <time>{{ formatDateTime(push.observed_at) }}</time>
              </div>
            </div>
          </div>
          <p v-else class="empty-state">
            No pushes detected yet. Rescan after pushing to record push events.
          </p>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Recent Focus Sessions</h3>
          <span class="chip">{{ detail.recent_sessions.length }}</span>
        </div>
        <div v-if="detail.recent_sessions.length" class="list-stack">
          <div
            v-for="session in detail.recent_sessions"
            :key="session.id"
            class="list-row"
          >
            <div>
              <strong>{{ formatMinutes(session.active_minutes) }}</strong>
              <p>{{ session.total_changed_lines }} lines, {{ session.event_count }} events</p>
            </div>
            <div class="row-meta">
              <time>{{ formatDateTime(session.started_at) }}</time>
            </div>
          </div>
        </div>
        <p v-else class="empty-state">
          No sessions computed for this repository. Rebuild analytics after
          importing history.
        </p>
      </section>

      <section
        v-if="!detail.recent_commits.length && !detail.recent_pushes.length"
        class="panel empty-guide"
      >
        <div class="panel-head">
          <div>
            <h3>Getting Started</h3>
            <p class="panel-copy">
              This repository has been added but does not have imported data yet.
            </p>
          </div>
        </div>
        <ol class="step-list">
          <li>Click Import History above to backfill recent commits.</li>
          <li>Click Rescan to capture current working-tree state.</li>
          <li>Go to the dashboard and click Rebuild to compute sessions and scores.</li>
        </ol>
      </section>
    </template>
  </template>
</template>
