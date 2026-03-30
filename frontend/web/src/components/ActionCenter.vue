<script setup lang="ts">
import {
  createGitPulseClient,
  type OperatorActionResult,
} from "@gitpulse/shared";
import { ref } from "vue";

import { savePageFlash } from "../lib/flash";

const props = defineProps<{
  apiBaseUrl: string;
  importDays: number;
  trackedTotal: number;
}>();

const client = createGitPulseClient({ baseUrl: props.apiBaseUrl });
const selectedImportDays = ref(props.importDays);
const busyAction = ref<string | null>(null);
const error = ref<string | null>(null);

function hasRepositories(): boolean {
  return props.trackedTotal > 0;
}

function finish(result: OperatorActionResult): void {
  savePageFlash({ level: "success", message: result.summary });
  window.location.reload();
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function run(action: "import" | "rescan" | "rebuild"): Promise<void> {
  if (!hasRepositories()) {
    error.value =
      "Track at least one repository before running import, rescan, or rebuild.";
    return;
  }

  busyAction.value = action;
  error.value = null;

  try {
    switch (action) {
      case "import":
        finish((await client.importAll(selectedImportDays.value)).result);
        return;
      case "rescan":
        finish((await client.rescanAll()).result);
        return;
      case "rebuild":
        finish((await client.rebuildAnalytics()).result);
        return;
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Action failed.";
  } finally {
    busyAction.value = null;
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <h3>Action Center</h3>
        <p class="panel-copy">
          GitPulse stays manual-first. Import, rescan, and rebuild happen only
          when you ask.
        </p>
      </div>
      <span class="chip">{{ props.trackedTotal }} tracked</span>
    </div>

    <div class="form-grid">
      <label>
        <span>Import Window Days</span>
        <input v-model.number="selectedImportDays" type="number" min="1" />
      </label>

      <div class="button-row">
        <button
          class="button"
          type="button"
          :disabled="busyAction === 'import'"
          @click="run('import')"
        >
          {{
            busyAction === "import"
              ? "Importing…"
              : `Import ${selectedImportDays} Day History`
          }}
        </button>
        <button
          class="button-secondary"
          type="button"
          :disabled="busyAction === 'rescan'"
          @click="run('rescan')"
        >
          {{ busyAction === "rescan" ? "Rescanning…" : "Rescan All" }}
        </button>
        <button
          class="button-secondary"
          type="button"
          :disabled="busyAction === 'rebuild'"
          @click="run('rebuild')"
        >
          {{ busyAction === "rebuild" ? "Rebuilding…" : "Rebuild Analytics" }}
        </button>
      </div>

      <p class="helper">
        Import backfills commit history. Rescan refreshes working-tree state.
        Rebuild derives sessions, rollups, streaks, and score from stored
        events.
      </p>

      <section v-if="error" class="notice notice-error">
        <div>
          <strong>Action failed</strong>
          <p>{{ error }}</p>
        </div>
      </section>
    </div>
  </section>
</template>
