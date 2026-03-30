<script setup lang="ts">
import { createGitPulseClient } from "@gitpulse/shared";
import { reactive, ref } from "vue";

import { savePageFlash } from "../lib/flash";

const props = defineProps<{
  apiBaseUrl: string;
  repoId: string;
  importDays: number;
  includePatterns: string[];
  excludePatterns: string[];
  isMonitored: boolean;
}>();

const client = createGitPulseClient({ baseUrl: props.apiBaseUrl });
const busy = ref<string | null>(null);
const error = ref<string | null>(null);
const form = reactive({
  importDays: props.importDays,
  includePatterns: props.includePatterns.join("\n"),
  excludePatterns: props.excludePatterns.join("\n"),
});

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function finish(message: string, redirectTo?: string): void {
  savePageFlash({ level: "success", message });
  window.location.assign(redirectTo || window.location.pathname);
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function importHistory(): Promise<void> {
  busy.value = "import";
  error.value = null;

  try {
    const payload = await client.importRepository(
      props.repoId,
      Math.max(1, form.importDays),
    );
    finish(payload.result.summary);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Import failed.";
  } finally {
    busy.value = null;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function refreshRepository(): Promise<void> {
  busy.value = "refresh";
  error.value = null;

  try {
    const payload = await client.refreshRepository(props.repoId);
    finish(payload.result.summary);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Rescan failed.";
  } finally {
    busy.value = null;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function savePatterns(): Promise<void> {
  busy.value = "patterns";
  error.value = null;

  try {
    const payload = await client.saveRepositoryPatterns(
      props.repoId,
      splitLines(form.includePatterns),
      splitLines(form.excludePatterns),
    );
    finish(payload.result.summary);
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? caught.message
        : "Could not save repository patterns.";
  } finally {
    busy.value = null;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function toggleMonitoring(): Promise<void> {
  busy.value = "toggle";
  error.value = null;

  try {
    const payload = await client.toggleRepository(props.repoId);
    finish(payload.result.summary);
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? caught.message
        : "Could not update repository state.";
  } finally {
    busy.value = null;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function removeRepository(): Promise<void> {
  busy.value = "remove";
  error.value = null;

  try {
    const payload = await client.removeRepository(props.repoId);
    finish(payload.result.summary, "/repositories");
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : "Could not remove repository.";
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="stack">
    <section v-if="error" class="notice notice-error">
      <div>
        <strong>Repository action failed</strong>
        <p>{{ error }}</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>Repository Actions</h3>
          <p class="panel-copy">
            Import recent history and rescan explicitly. Removal stays manual and
            local.
          </p>
        </div>
        <span class="chip">{{ props.isMonitored ? "monitored" : "disabled" }}</span>
      </div>

      <div class="form-grid">
        <label>
          <span>Import Window Days</span>
          <input v-model.number="form.importDays" type="number" min="1" />
        </label>

        <div class="button-row">
          <button
            class="button"
            type="button"
            :disabled="busy === 'import'"
            @click="importHistory"
          >
            {{
              busy === "import"
                ? "Importing…"
                : `Import ${form.importDays} Day History`
            }}
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="busy === 'refresh'"
            @click="refreshRepository"
          >
            {{ busy === "refresh" ? "Rescanning…" : "Rescan Repository" }}
          </button>
        </div>

        <div class="button-row">
          <button
            class="button-secondary"
            type="button"
            :disabled="busy === 'toggle'"
            @click="toggleMonitoring"
          >
            {{
              busy === "toggle"
                ? "Saving…"
                : props.isMonitored
                  ? "Disable Monitoring"
                  : "Enable Monitoring"
            }}
          </button>
          <button
            class="button-danger"
            type="button"
            :disabled="busy === 'remove'"
            @click="removeRepository"
          >
            {{ busy === "remove" ? "Removing…" : "Remove Repository" }}
          </button>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>Pattern Overrides</h3>
          <p class="panel-copy">
            These patterns apply only to this repository. Excludes always win.
          </p>
        </div>
      </div>

      <div class="form-grid">
        <label>
          <span>Repo Include Patterns</span>
          <textarea v-model="form.includePatterns" rows="5" />
        </label>

        <label>
          <span>Repo Exclude Patterns</span>
          <textarea v-model="form.excludePatterns" rows="7" />
        </label>

        <div>
          <button
            class="button"
            type="button"
            :disabled="busy === 'patterns'"
            @click="savePatterns"
          >
            {{ busy === "patterns" ? "Saving…" : "Save Repo Patterns" }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
