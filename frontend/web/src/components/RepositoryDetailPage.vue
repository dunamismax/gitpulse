<script setup lang="ts">
import {
  formatDateTime,
  pushKindLabel,
  type RepoDetailView,
  type SettingsView,
  shortSha,
  sumLines,
} from "@gitpulse/shared";
import { onMounted, ref, watch } from "vue";
import {
  type BackendStatus,
  backendStatusFromError,
  createServerClient,
} from "../lib/server";
import BackendStatusNotice from "./BackendStatusNotice.vue";
import RepoDetailActions from "./RepoDetailActions.vue";

const props = defineProps<{
  apiBaseUrl: string;
}>();

const client = createServerClient(props.apiBaseUrl);
const repoId = ref("");
const detail = ref<RepoDetailView | null>(null);
const settings = ref<SettingsView | null>(null);
const loading = ref(true);
const pageError = ref<string | null>(null);
const backendStatus = ref<BackendStatus | null>(null);

function repoIdFromPathname(pathname: string): string {
  const prefix = "/repositories/";
  if (!pathname.startsWith(prefix)) {
    return "";
  }

  return decodeURIComponent(pathname.slice(prefix.length).replace(/\/+$/, ""));
}

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = null;
  backendStatus.value = null;

  if (typeof window === "undefined") {
    loading.value = false;
    return;
  }

  repoId.value = repoIdFromPathname(window.location.pathname);
  if (!repoId.value) {
    detail.value = null;
    settings.value = null;
    pageError.value = "Repository id missing from URL.";
    loading.value = false;
    return;
  }

  try {
    const [detailData, settingsData] = await Promise.all([
      client.repositoryDetail(repoId.value),
      client.settings(),
    ]);
    detail.value = detailData;
    settings.value = settingsData;
  } catch (error) {
    detail.value = null;
    settings.value = null;
    pageError.value =
      error instanceof Error
        ? error.message
        : "Could not load repository detail.";
    backendStatus.value = backendStatusFromError(error, props.apiBaseUrl);
  } finally {
    loading.value = false;
  }
}

watch(detail, (value) => {
  if (typeof document !== "undefined") {
    document.title = `${value?.card.repo.name || "Repository Detail"} · GitPulse`;
  }
});

onMounted(load);
</script>

<template>
  <section v-if="loading" class="panel">
    <p class="panel-copy">Loading repository detail…</p>
  </section>

  <template v-else>
    <BackendStatusNotice v-if="backendStatus" :status="backendStatus" />

    <section v-else-if="pageError" class="notice notice-error">
      <div>
        <strong>Repository detail unavailable</strong>
        <p>{{ pageError }}</p>
      </div>
    </section>

    <template v-else-if="detail">
      <section class="panel">
        <div class="panel-head detail-head-actions">
          <div>
            <p class="eyebrow-subtle">Tracked repository</p>
            <h3>{{ detail.card.repo.name }}</h3>
            <p class="panel-copy">{{ detail.card.repo.root_path }}</p>
          </div>
          <span class="chip">{{ detail.card.health }}</span>
        </div>
      </section>

      <section
        v-if="!detail.card.snapshot || !detail.recent_commits.length"
        class="panel empty-guide compact-guide"
      >
        <div class="panel-head">
          <div>
            <h3>Repository still being backfilled</h3>
            <p class="panel-copy">
              This repo is registered, but GitPulse has not yet collected all of
              the usual first-run data.
            </p>
          </div>
          <span class="chip">Needs import/rescan</span>
        </div>
        <ol class="step-list">
          <li>
            Import recent history from the controls below to backfill commits for
            this repository.
          </li>
          <li>
            Rescan to capture the current working tree and ahead/behind state.
          </li>
          <li>
            Run a rebuild from the dashboard or repositories page if sessions and
            achievements still look blank.
          </li>
        </ol>
      </section>

      <RepoDetailActions
        :api-base-url="apiBaseUrl"
        :repo-id="detail.card.repo.id"
        :import-days="settings?.config.monitoring.import_days ?? 30"
        :include-patterns="detail.include_patterns"
        :exclude-patterns="detail.exclude_patterns"
        :is-monitored="detail.card.repo.is_monitored"
      />

      <section class="stats-grid four-up">
        <article class="stat-card">
          <span class="label">Branch</span>
          <strong>{{ detail.card.snapshot?.branch || "(detached)" }}</strong>
          <small>{{ detail.card.snapshot?.upstream_ref || "no upstream" }}</small>
        </article>
        <article class="stat-card">
          <span class="label">Sync</span>
          <strong>
            +{{ detail.card.snapshot?.ahead_count ?? 0 }} /
            -{{ detail.card.snapshot?.behind_count ?? 0 }}
          </strong>
          <small>{{ detail.card.snapshot?.upstream_ref || "no upstream tracking" }}</small>
        </article>
        <article class="stat-card">
          <span class="label">Last Snapshot</span>
          <strong>
            {{
              detail.card.snapshot?.observed_at
                ? formatDateTime(detail.card.snapshot.observed_at)
                : "Not scanned yet"
            }}
          </strong>
          <small>
            {{ detail.card.snapshot?.live_files ?? 0 }} live files /
            {{ detail.card.snapshot?.staged_files ?? 0 }} staged files
          </small>
        </article>
        <article class="stat-card">
          <span class="label">Repo Updated</span>
          <strong>{{ formatDateTime(detail.card.repo.updated_at) }}</strong>
          <small>
            {{ detail.card.health }} · score {{ detail.card.metrics?.score ?? 0 }}
          </small>
        </article>
      </section>

      <section class="stats-grid three-up">
        <article class="stat-card">
          <span class="label">Live / Staged</span>
          <strong>
            {{
              sumLines(
                detail.card.snapshot?.live_additions ?? 0,
                detail.card.snapshot?.live_deletions ?? 0,
              )
            }}
            /
            {{
              sumLines(
                detail.card.snapshot?.staged_additions ?? 0,
                detail.card.snapshot?.staged_deletions ?? 0,
              )
            }}
          </strong>
          <small>Changed lines</small>
        </article>
        <article class="stat-card">
          <span class="label">Pushes Today</span>
          <strong>{{ detail.card.metrics?.pushes ?? 0 }}</strong>
          <small>From daily rollups</small>
        </article>
        <article class="stat-card">
          <span class="label">Recent Pushes</span>
          <strong>{{ detail.recent_pushes.length }}</strong>
          <small>Latest push visibility from the Go API</small>
        </article>
      </section>

      <section class="split-grid">
        <article class="panel">
          <div class="panel-head"><h3>Language Breakdown</h3></div>
          <div v-if="detail.language_breakdown.length" class="list-stack">
            <div v-for="language in detail.language_breakdown" :key="language.language" class="list-row simple">
              <span>{{ language.language }}</span>
              <strong>{{ language.code }} lines</strong>
            </div>
          </div>
          <p v-else class="empty-state">
            No language data available yet. A fresh rescan is usually what
            populates this section.
          </p>
        </article>

        <article class="panel">
          <div class="panel-head"><h3>Top Files Touched</h3></div>
          <div v-if="detail.top_files.length">
            <span v-for="file in detail.top_files" :key="file" class="file-pill"><code>{{ file }}</code></span>
          </div>
          <p v-else class="empty-state">
            No file activity recorded yet. A rescan or import will populate
            touched-file history.
          </p>
        </article>
      </section>

      <section class="split-grid">
        <article class="panel">
          <div class="panel-head"><h3>Recent Commits</h3></div>
          <div v-if="detail.recent_commits.length" class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SHA</th>
                  <th>Summary</th>
                  <th>Lines</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="commit in detail.recent_commits" :key="commit.id">
                  <td><code>{{ shortSha(commit.commit_sha) }}</code></td>
                  <td>{{ commit.summary }}</td>
                  <td>{{ sumLines(commit.additions, commit.deletions) }}</td>
                  <td>{{ formatDateTime(commit.authored_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-state">
            No commits imported yet. Use the import action above to backfill this
            repository's history.
          </p>
        </article>

        <article class="panel">
          <div class="panel-head"><h3>Recent Pushes</h3></div>
          <div v-if="detail.recent_pushes.length" class="list-stack">
            <div v-for="push in detail.recent_pushes" :key="push.id" class="list-row">
              <div>
                <strong>{{ pushKindLabel(push.kind) }}</strong>
                <p>{{ push.upstream_ref || "no upstream recorded" }}</p>
              </div>
              <div class="row-meta">
                <span>
                  {{ push.pushed_commit_count }} commit{{ push.pushed_commit_count === 1 ? "" : "s" }}
                </span>
                <time>{{ formatDateTime(push.observed_at) }}</time>
              </div>
            </div>
          </div>
          <p v-else class="empty-state">
            No push events recorded for this repository yet. Import recent
            history first, then remote or local push events can surface here.
          </p>
        </article>
      </section>

      <section class="split-grid">
        <article class="panel">
          <div class="panel-head"><h3>Recent Sessions</h3></div>
          <div v-if="detail.recent_sessions.length" class="list-stack">
            <div v-for="session in detail.recent_sessions" :key="session.id" class="list-row simple">
              <div>
                <strong>{{ session.active_minutes }} min</strong>
                <p>{{ formatDateTime(session.started_at) }}</p>
              </div>
              <span class="chip">{{ session.total_changed_lines }} lines</span>
            </div>
          </div>
          <p v-else class="empty-state">
            No sessions recorded for this repository yet. Rebuild analytics after
            import and rescan to derive sessions.
          </p>
        </article>

        <article class="panel">
          <div class="panel-head"><h3>Repository Metadata</h3></div>
          <div class="meta-stack">
            <span>Default Branch: {{ detail.card.repo.default_branch || "-" }}</span>
            <span>Remote URL: {{ detail.card.repo.remote_url || "-" }}</span>
            <span>Repository State: {{ detail.card.repo.state }}</span>
            <span>
              Monitoring:
              {{ detail.card.repo.is_monitored ? "enabled" : "disabled" }}
            </span>
          </div>
        </article>
      </section>
    </template>
  </template>
</template>
