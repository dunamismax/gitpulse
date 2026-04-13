<script setup lang="ts">
import { ref } from 'vue';
import { GitPulseClient } from '../lib/client';

const props = defineProps<{
  repoId: string;
  repoState: string;
  includePatterns: string[];
  excludePatterns: string[];
  importDays: number;
}>();

const client = new GitPulseClient();
const days = ref(props.importDays);
const includeText = ref(props.includePatterns.join('\n'));
const excludeText = ref(props.excludePatterns.join('\n'));
const busy = ref(false);

function flash(message: string, kind: 'success' | 'error' = 'success') {
  sessionStorage.setItem('gitpulse:flash', JSON.stringify({ message, kind }));
}

async function runImport() {
  busy.value = true;
  try {
    const result = await client.importRepository(props.repoId, days.value);
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Import failed.', 'error');
    location.reload();
  }
}

async function runRefresh() {
  busy.value = true;
  try {
    const result = await client.refreshRepository(props.repoId);
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Refresh failed.', 'error');
    location.reload();
  }
}

async function toggleRepo() {
  busy.value = true;
  try {
    const result = await client.toggleRepository(props.repoId);
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Toggle failed.', 'error');
    location.reload();
  }
}

async function removeRepo() {
  busy.value = true;
  try {
    const result = await client.removeRepository(props.repoId);
    flash(result.result.summary);
    window.location.href = '/repositories';
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Remove failed.', 'error');
    location.reload();
  }
}

async function savePatterns() {
  busy.value = true;
  try {
    const include = includeText.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const exclude = excludeText.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const result = await client.saveRepositoryPatterns(
      props.repoId,
      include,
      exclude
    );
    flash(result.result.summary);
    location.reload();
  } catch (error) {
    flash(
      error instanceof Error ? error.message : 'Save patterns failed.',
      'error'
    );
    location.reload();
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h3>Actions</h3>
    </div>

    <div
      style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; margin-top: 0.75rem"
    >
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
      <button class="button" :disabled="busy" @click="runImport">
        Import History
      </button>
      <button class="button-secondary" :disabled="busy" @click="runRefresh">
        Rescan
      </button>
      <button class="button-secondary" :disabled="busy" @click="toggleRepo">
        {{ repoState === 'active' ? 'Disable' : 'Enable' }}
      </button>
      <button class="button-danger" :disabled="busy" @click="removeRepo">
        Remove
      </button>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h3>Pattern Overrides</h3>
    </div>

    <div class="form-grid" style="margin-top: 0.75rem">
      <label>
        <span>Include patterns (one per line)</span>
        <textarea v-model="includeText" rows="3" :disabled="busy" />
      </label>
      <label>
        <span>Exclude patterns (one per line)</span>
        <textarea v-model="excludeText" rows="3" :disabled="busy" />
      </label>
      <div>
        <button class="button-secondary" :disabled="busy" @click="savePatterns">
          Save Patterns
        </button>
      </div>
    </div>
  </section>
</template>
