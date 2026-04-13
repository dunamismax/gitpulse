<script setup lang="ts">
import type { RepoCard } from '@gitpulse-vnext/contracts';
import { ref } from 'vue';
import { GitPulseClient } from '../lib/client';
import { formatMinutes, sumLines } from '../lib/format';

const props = defineProps<{
  initialCards: RepoCard[];
}>();

const client = new GitPulseClient();
const cards = ref<RepoCard[]>(props.initialCards);
const addPath = ref('');
const adding = ref(false);
const busy = ref<string | null>(null);

function flash(message: string, kind: 'success' | 'error' = 'success') {
  sessionStorage.setItem('gitpulse:flash', JSON.stringify({ message, kind }));
}

async function addTarget() {
  const path = addPath.value.trim();
  if (!path) return;
  adding.value = true;
  try {
    const result = await client.addTarget(path);
    flash(result.result.summary);
    addPath.value = '';
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Add failed.', 'error');
    location.reload();
  }
}

async function refreshRepo(repoId: string) {
  busy.value = repoId;
  try {
    const result = await client.refreshRepository(repoId);
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Refresh failed.', 'error');
    location.reload();
  }
}

async function toggleRepo(repoId: string) {
  busy.value = repoId;
  try {
    const result = await client.toggleRepository(repoId);
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Toggle failed.', 'error');
    location.reload();
  }
}

async function removeRepo(repoId: string) {
  busy.value = repoId;
  try {
    const result = await client.removeRepository(repoId);
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Remove failed.', 'error');
    location.reload();
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h3>Add Repository</h3>
    </div>
    <form class="inline-form" style="margin-top: 0.75rem" @submit.prevent="addTarget">
      <input
        v-model="addPath"
        type="text"
        placeholder="/path/to/repo or parent folder"
        :disabled="adding"
      />
      <button class="button" :disabled="adding || !addPath.trim()">
        {{ adding ? 'Adding...' : 'Add Target' }}
      </button>
    </form>
  </section>

  <section v-if="cards.length === 0" class="panel">
    <p class="empty-state">
      No repositories tracked yet. Add one above to get started.
    </p>
  </section>

  <div v-else class="repo-grid">
    <article
      v-for="card in cards"
      :key="card.repo.id"
      class="panel repo-card"
    >
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
          <strong>{{ card.snapshot?.branch || '(detached)' }}</strong>
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
                    card.snapshot.live_additions + card.snapshot.staged_additions,
                    card.snapshot.live_deletions + card.snapshot.staged_deletions,
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

      <div class="button-row" style="margin-top: 0.5rem">
        <button
          class="button-secondary"
          :disabled="busy === card.repo.id"
          @click="refreshRepo(card.repo.id)"
        >
          Rescan
        </button>
        <button
          class="button-secondary"
          :disabled="busy === card.repo.id"
          @click="toggleRepo(card.repo.id)"
        >
          {{ card.repo.state === 'active' ? 'Disable' : 'Enable' }}
        </button>
        <button
          class="button-danger"
          :disabled="busy === card.repo.id"
          @click="removeRepo(card.repo.id)"
        >
          Remove
        </button>
      </div>
    </article>
  </div>
</template>
