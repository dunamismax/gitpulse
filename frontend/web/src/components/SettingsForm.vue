<script setup lang="ts">
import { createGitPulseClient, type SettingsView } from "@gitpulse/shared";
import { reactive, ref } from "vue";

import { savePageFlash } from "../lib/flash";

const props = defineProps<{
  apiBaseUrl: string;
  settings: SettingsView;
}>();

const client = createGitPulseClient({ baseUrl: props.apiBaseUrl });
const busy = ref(false);
const error = ref<string | null>(null);
const form = reactive({
  authors: props.settings.config.authors
    .map((author) => author.email)
    .join("\n"),
  changedLinesPerDay: props.settings.config.goals.changed_lines_per_day,
  commitsPerDay: props.settings.config.goals.commits_per_day,
  focusMinutesPerDay: props.settings.config.goals.focus_minutes_per_day,
  timezone: props.settings.config.ui.timezone,
  dayBoundaryMinutes: props.settings.config.ui.day_boundary_minutes,
  sessionGapMinutes: props.settings.config.monitoring.session_gap_minutes,
  importDays: props.settings.config.monitoring.import_days,
  includePatterns: props.settings.config.patterns.include.join("\n"),
  excludePatterns: props.settings.config.patterns.exclude.join("\n"),
  githubEnabled: props.settings.config.github.enabled,
  githubVerifyRemotePushes: props.settings.config.github.verify_remote_pushes,
  githubToken: "",
});

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// biome-ignore lint/correctness/noUnusedVariables: Used from the Vue template.
async function submit(): Promise<void> {
  busy.value = true;
  error.value = null;

  try {
    const payload = await client.saveSettings({
      authors: splitLines(form.authors),
      changed_lines_per_day: Number(form.changedLinesPerDay) || 0,
      commits_per_day: Number(form.commitsPerDay) || 0,
      focus_minutes_per_day: Number(form.focusMinutesPerDay) || 0,
      timezone: form.timezone.trim() || "UTC",
      day_boundary_minutes: Number(form.dayBoundaryMinutes) || 0,
      session_gap_minutes: Number(form.sessionGapMinutes) || 15,
      import_days: Math.max(1, Number(form.importDays) || 30),
      include_patterns: splitLines(form.includePatterns),
      exclude_patterns: splitLines(form.excludePatterns),
      github_enabled: form.githubEnabled,
      github_verify_remote_pushes: form.githubVerifyRemotePushes,
      github_token: form.githubToken,
    });

    savePageFlash({ level: "success", message: payload.result.summary });
    window.location.reload();
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : "Could not save settings.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="stack">
    <section v-if="error" class="notice notice-error">
      <div>
        <strong>Settings save failed</strong>
        <p>{{ error }}</p>
      </div>
    </section>

    <form class="stack" @submit.prevent="submit">
      <section class="panel">
        <div class="panel-head"><h3>Identity</h3></div>
        <label>
          <span>Author Emails (one per line)</span>
          <textarea v-model="form.authors" rows="4" />
        </label>
        <p class="panel-copy">
          Set these before the first import if you want commit and push totals to
          match your local identity cleanly.
        </p>
      </section>

      <section class="split-grid">
        <article class="panel form-grid">
          <div class="panel-head"><h3>Goals</h3></div>
          <label>
            <span>Changed Lines Per Day</span>
            <input v-model.number="form.changedLinesPerDay" type="number" />
          </label>
          <label>
            <span>Commits Per Day</span>
            <input v-model.number="form.commitsPerDay" type="number" />
          </label>
          <label>
            <span>Focus Minutes Per Day</span>
            <input v-model.number="form.focusMinutesPerDay" type="number" />
          </label>
        </article>

        <article class="panel form-grid">
          <div class="panel-head"><h3>Time and Sessions</h3></div>
          <label>
            <span>Timezone (IANA format)</span>
            <input v-model="form.timezone" type="text" />
          </label>
          <label>
            <span>Day Boundary Minutes</span>
            <input v-model.number="form.dayBoundaryMinutes" type="number" />
          </label>
          <label>
            <span>Session Gap Minutes</span>
            <input v-model.number="form.sessionGapMinutes" type="number" />
          </label>
          <label>
            <span>Import Window Days</span>
            <input v-model.number="form.importDays" type="number" min="1" />
          </label>
          <p class="panel-copy">
            Used by explicit import actions. Rescans do not import history.
          </p>
        </article>
      </section>

      <section class="split-grid">
        <article class="panel form-grid">
          <div class="panel-head"><h3>Patterns</h3></div>
          <label>
            <span>Global Include Patterns (one per line)</span>
            <textarea v-model="form.includePatterns" rows="5" />
          </label>
          <label>
            <span>Global Exclude Patterns (one per line)</span>
            <textarea v-model="form.excludePatterns" rows="8" />
          </label>
        </article>

        <article class="panel form-grid">
          <div class="panel-head"><h3>GitHub Verification</h3></div>
          <label class="checkbox-row">
            <input v-model="form.githubEnabled" type="checkbox" />
            <span>Enable GitHub metadata lookups</span>
          </label>
          <label class="checkbox-row">
            <input v-model="form.githubVerifyRemotePushes" type="checkbox" />
            <span>Confirm pushes remotely when possible</span>
          </label>
          <label>
            <span>GitHub Token</span>
            <input
              v-model="form.githubToken"
              type="password"
              placeholder="Leave blank to keep the current token"
            />
          </label>

          <div class="meta-stack">
            <span>Config File: {{ props.settings.paths.config_file }}</span>
            <span>Config Dir: {{ props.settings.paths.config_dir }}</span>
            <span>Data: {{ props.settings.paths.data_dir }}</span>
          </div>

          <p class="panel-copy">
            Environment overrides still win on the next process start.
          </p>
        </article>
      </section>

      <div>
        <button class="button" type="submit" :disabled="busy">
          {{ busy ? "Saving…" : "Save Settings" }}
        </button>
      </div>
    </form>
  </div>
</template>
