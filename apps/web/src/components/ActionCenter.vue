<script setup lang="ts">
import { ref } from 'vue';
import { GitPulseClient } from '../lib/client';

const props = defineProps<{
  importDays: number;
  trackedTotal: number;
}>();

const client = new GitPulseClient();
const days = ref(props.importDays);
const importing = ref(false);
const rescanning = ref(false);
const rebuilding = ref(false);

function flash(message: string, kind: 'success' | 'error' = 'success') {
  sessionStorage.setItem('gitpulse:flash', JSON.stringify({ message, kind }));
}

async function runImport() {
  importing.value = true;
  try {
    const result = await client.importAll(days.value);
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Import failed.', 'error');
    location.reload();
  }
}

async function runRescan() {
  rescanning.value = true;
  try {
    const result = await client.rescanAll();
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Rescan failed.', 'error');
    location.reload();
  }
}

async function runRebuild() {
  rebuilding.value = true;
  try {
    const result = await client.rebuildAnalytics();
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Rebuild failed.', 'error');
    location.reload();
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <h3>Action Center</h3>
        <p class="panel-copy">
          Import history, rescan working trees, or rebuild analytics for all
          tracked repositories.
        </p>
      </div>
      <span class="chip">{{ trackedTotal }} tracked</span>
    </div>

    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; margin-top: 0.75rem">
      <label style="display: grid; gap: 0.3rem; flex: 0 0 auto">
        <span>Import window</span>
        <input
          v-model.number="days"
          type="number"
          min="1"
          max="365"
          style="width: 6rem"
        />
      </label>

      <button
        class="button"
        :disabled="importing || trackedTotal === 0"
        @click="runImport"
      >
        {{ importing ? 'Importing...' : 'Import' }}
      </button>

      <button
        class="button-secondary"
        :disabled="rescanning || trackedTotal === 0"
        @click="runRescan"
      >
        {{ rescanning ? 'Rescanning...' : 'Rescan' }}
      </button>

      <button
        class="button-secondary"
        :disabled="rebuilding || trackedTotal === 0"
        @click="runRebuild"
      >
        {{ rebuilding ? 'Rebuilding...' : 'Rebuild' }}
      </button>
    </div>
  </section>
</template>
