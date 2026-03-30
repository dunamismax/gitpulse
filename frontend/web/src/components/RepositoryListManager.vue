<script setup lang="ts">
import { createGitPulseClient, type RepoCard } from "@gitpulse/shared";
import { ref } from "vue";

import { savePageFlash } from "../lib/flash";

const props = defineProps<{
  apiBaseUrl: string;
  initialCards: RepoCard[];
}>();

const client = createGitPulseClient({ baseUrl: props.apiBaseUrl });
const pathValue = ref("");
const cards = ref<RepoCard[]>(props.initialCards);
const busyKey = ref<string | null>(null);
const error = ref<string | null>(null);

async function reloadCards(): Promise<void> {
  cards.value = await client.repositories();
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function addTarget(): Promise<void> {
  if (!pathValue.value.trim()) {
    error.value = "Path is required.";
    return;
  }

  busyKey.value = "add";
  error.value = null;

  try {
    const payload = await client.addTarget(pathValue.value.trim());
    pathValue.value = "";
    await reloadCards();
    savePageFlash({ level: "success", message: payload.result.summary });
    window.location.reload();
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : "Could not add target.";
  } finally {
    busyKey.value = null;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function runRepoAction(
  repoId: string,
  action: "refresh" | "toggle" | "remove",
): Promise<void> {
  busyKey.value = `${action}:${repoId}`;
  error.value = null;

  try {
    switch (action) {
      case "refresh": {
        const result = await client.refreshRepository(repoId);
        await reloadCards();
        savePageFlash({ level: "success", message: result.result.summary });
        window.location.reload();
        return;
      }
      case "toggle": {
        const result = await client.toggleRepository(repoId);
        await reloadCards();
        savePageFlash({ level: "success", message: result.result.summary });
        window.location.reload();
        return;
      }
      case "remove": {
        const result = await client.removeRepository(repoId);
        await reloadCards();
        savePageFlash({ level: "success", message: result.result.summary });
        window.location.reload();
        return;
      }
    }
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : "Repository action failed.";
  } finally {
    busyKey.value = null;
  }
}
</script>

<template>
  <div class="stack">
    <section class="panel">
      <form class="inline-form" @submit.prevent="addTarget">
        <input
          v-model="pathValue"
          type="text"
          placeholder="/Users/you/code"
          required
        />
        <button class="button" type="submit" :disabled="busyKey === 'add'">
          {{ busyKey === "add" ? "Adding…" : "Add Target" }}
        </button>
      </form>
      <p class="panel-copy">
        Point GitPulse at one repo or a parent folder. Nested repositories are
        discovered and tracked individually.
      </p>
    </section>

    <section v-if="error" class="notice notice-error">
      <div>
        <strong>Repository action failed</strong>
        <p>{{ error }}</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>Tracked Repositories</h3>
          <p class="panel-copy">
            Every repository stays local. Monitoring can be disabled without
            removing the row.
          </p>
        </div>
        <span class="chip">{{ cards.length }} tracked</span>
      </div>

      <div v-if="cards.length" class="repo-grid">
        <article v-for="card in cards" :key="card.repo.id" class="panel repo-card">
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
              <small>Changed lines</small>
              <strong>
                {{
                  card.snapshot
                    ? card.snapshot.live_additions +
                      card.snapshot.live_deletions +
                      card.snapshot.staged_additions +
                      card.snapshot.staged_deletions
                    : 0
                }}
              </strong>
            </div>
            <div>
              <small>Score</small>
              <strong>{{ card.metrics?.score ?? 0 }}</strong>
            </div>
            <div>
              <small>Focus time</small>
              <strong>{{ card.metrics?.focus_minutes ?? 0 }}m</strong>
            </div>
            <div>
              <small>Sync</small>
              <strong>
                +{{ card.snapshot?.ahead_count ?? 0 }} /
                -{{ card.snapshot?.behind_count ?? 0 }}
              </strong>
            </div>
          </div>

          <div class="sparkline" aria-hidden="true">
            <span
              v-for="(value, index) in card.sparkline"
              :key="`${card.repo.id}:${index}`"
              :style="{
                height: `${Math.max(
                  8,
                  Math.round(
                    (value / Math.max(...card.sparkline, 1)) * 48,
                  ),
                )}px`,
              }"
            />
          </div>

          <div class="button-row">
            <button
              class="button-secondary"
              type="button"
              :disabled="busyKey === `refresh:${card.repo.id}`"
              @click="runRepoAction(card.repo.id, 'refresh')"
            >
              {{
                busyKey === `refresh:${card.repo.id}`
                  ? "Rescanning…"
                  : "Rescan"
              }}
            </button>
            <button
              class="button-secondary"
              type="button"
              :disabled="busyKey === `toggle:${card.repo.id}`"
              @click="runRepoAction(card.repo.id, 'toggle')"
            >
              {{
                busyKey === `toggle:${card.repo.id}`
                  ? "Saving…"
                  : card.repo.is_monitored
                    ? "Disable"
                    : "Enable"
              }}
            </button>
            <button
              class="button-danger"
              type="button"
              :disabled="busyKey === `remove:${card.repo.id}`"
              @click="runRepoAction(card.repo.id, 'remove')"
            >
              {{
                busyKey === `remove:${card.repo.id}`
                  ? "Removing…"
                  : "Remove"
              }}
            </button>
          </div>
        </article>
      </div>

      <p v-else class="empty-state">
        No repositories tracked yet. Add one above, then import, rescan, and
        rebuild to populate the rest of the product.
      </p>
    </section>
  </div>
</template>
