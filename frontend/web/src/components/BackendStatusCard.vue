<script setup lang="ts">
defineProps<{
  apiBaseUrl: string;
  repoCount: number;
  score: number;
  activeMinutes: string;
  routeCount: number;
}>();
</script>

<template>
  <section class="status-card">
    <div>
      <p class="eyebrow">Live Go backend</p>
      <h2>Phase 2 web foundation shell</h2>
      <p>
        Astro + Vue is wired to the current Go API without changing the shipped Python browser path.
      </p>
    </div>

    <dl>
      <div>
        <dt>API base URL</dt>
        <dd>{{ apiBaseUrl }}</dd>
      </div>
      <div>
        <dt>Tracked repositories</dt>
        <dd>{{ repoCount }}</dd>
      </div>
      <div>
        <dt>Today score</dt>
        <dd>{{ score }}</dd>
      </div>
      <div>
        <dt>Active session</dt>
        <dd>{{ activeMinutes }}</dd>
      </div>
      <div>
        <dt>Planned web routes</dt>
        <dd>{{ routeCount }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.status-card {
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.75);
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #38bdf8;
  font-size: 0.75rem;
}

h2 {
  margin: 0.35rem 0 0.5rem;
}

p {
  margin: 0;
  color: #cbd5e1;
}

 dl {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}

 dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 0.25rem;
}

 dd {
  margin: 0;
  font-weight: 600;
}
</style>
