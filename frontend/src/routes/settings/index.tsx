import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Panel, PanelHead } from "@/components/ui/panel";
import { saveSettings } from "@/lib/api";
import { settingsQuery } from "@/lib/queries";
import { splitLines } from "@/lib/utils";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

interface SettingsForm {
  authors: string;
  changed_lines_per_day: number;
  commits_per_day: number;
  focus_minutes_per_day: number;
  timezone: string;
  day_boundary_minutes: number;
  session_gap_minutes: number;
  import_days: number;
  include_patterns: string;
  exclude_patterns: string;
  github_enabled: boolean;
  github_verify_remote_pushes: boolean;
  github_token: string;
}

const defaultForm: SettingsForm = {
  authors: "",
  changed_lines_per_day: 0,
  commits_per_day: 0,
  focus_minutes_per_day: 0,
  timezone: "UTC",
  day_boundary_minutes: 0,
  session_gap_minutes: 15,
  import_days: 30,
  include_patterns: "",
  exclude_patterns: "",
  github_enabled: false,
  github_verify_remote_pushes: false,
  github_token: "",
};

function SettingsPage() {
  const { data, error, isLoading } = useQuery(settingsQuery());
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsForm>(defaultForm);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        authors: data.config.authors.map((a) => a.email).join("\n"),
        changed_lines_per_day: data.config.goals.changed_lines_per_day,
        commits_per_day: data.config.goals.commits_per_day,
        focus_minutes_per_day: data.config.goals.focus_minutes_per_day,
        timezone: data.config.ui.timezone,
        day_boundary_minutes: data.config.ui.day_boundary_minutes,
        session_gap_minutes: data.config.monitoring.session_gap_minutes,
        import_days: data.config.monitoring.import_days,
        include_patterns: data.config.patterns.include.join("\n"),
        exclude_patterns: data.config.patterns.exclude.join("\n"),
        github_enabled: data.config.github.enabled,
        github_verify_remote_pushes: data.config.github.verify_remote_pushes,
        github_token: "",
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        authors: splitLines(form.authors),
        changed_lines_per_day: Number(form.changed_lines_per_day),
        commits_per_day: Number(form.commits_per_day),
        focus_minutes_per_day: Number(form.focus_minutes_per_day),
        timezone: form.timezone,
        day_boundary_minutes: Number(form.day_boundary_minutes),
        session_gap_minutes: Number(form.session_gap_minutes),
        import_days: Number(form.import_days),
        include_patterns: splitLines(form.include_patterns),
        exclude_patterns: splitLines(form.exclude_patterns),
        github_enabled: form.github_enabled,
        github_verify_remote_pushes: form.github_verify_remote_pushes,
        github_token: form.github_token,
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const updateField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  return (
    <AppLayout
      eyebrow="Settings"
      heading="Identity, goals, and boundaries"
      description="Configured author emails shape commit and push history totals. Live working-tree activity always counts locally."
    >
      {isLoading && <Notice>Loading settings…</Notice>}
      {saved && <Notice variant="success">Settings saved to the active config file.</Notice>}
      {(error || saveMutation.error) && (
        <Notice variant="error">{(error || saveMutation.error)?.message}</Notice>
      )}

      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Panel>
          <PanelHead>
            <h3 className="m-0 text-sm font-semibold">Identity</h3>
          </PanelHead>
          <label className="mb-2 block text-sm">Author Emails (one per line)</label>
          <Textarea
            rows={4}
            value={form.authors}
            onChange={(e) => updateField("authors", e.target.value)}
          />
        </Panel>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHead>
              <h3 className="m-0 text-sm font-semibold">Goals</h3>
            </PanelHead>
            <label className="mb-2 block text-sm">Changed Lines Per Day</label>
            <Input
              type="number"
              value={form.changed_lines_per_day}
              onChange={(e) => updateField("changed_lines_per_day", Number(e.target.value))}
            />
            <label className="mb-2 mt-4 block text-sm">Commits Per Day</label>
            <Input
              type="number"
              value={form.commits_per_day}
              onChange={(e) => updateField("commits_per_day", Number(e.target.value))}
            />
            <label className="mb-2 mt-4 block text-sm">Focus Minutes Per Day</label>
            <Input
              type="number"
              value={form.focus_minutes_per_day}
              onChange={(e) => updateField("focus_minutes_per_day", Number(e.target.value))}
            />
          </Panel>

          <Panel>
            <PanelHead>
              <h3 className="m-0 text-sm font-semibold">Time and Sessions</h3>
            </PanelHead>
            <label className="mb-2 block text-sm">Timezone (IANA format)</label>
            <Input
              type="text"
              value={form.timezone}
              onChange={(e) => updateField("timezone", e.target.value)}
            />
            <label className="mb-2 mt-4 block text-sm">Day Boundary Minutes</label>
            <Input
              type="number"
              value={form.day_boundary_minutes}
              onChange={(e) => updateField("day_boundary_minutes", Number(e.target.value))}
            />
            <label className="mb-2 mt-4 block text-sm">Session Gap Minutes</label>
            <Input
              type="number"
              value={form.session_gap_minutes}
              onChange={(e) => updateField("session_gap_minutes", Number(e.target.value))}
            />
            <label className="mb-2 mt-4 block text-sm">Import Window Days</label>
            <Input
              type="number"
              value={form.import_days}
              onChange={(e) => updateField("import_days", Number(e.target.value))}
            />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHead>
              <h3 className="m-0 text-sm font-semibold">Patterns</h3>
            </PanelHead>
            <label className="mb-2 block text-sm">Global Include Patterns (one per line)</label>
            <Textarea
              rows={5}
              value={form.include_patterns}
              onChange={(e) => updateField("include_patterns", e.target.value)}
            />
            <label className="mb-2 mt-4 block text-sm">
              Global Exclude Patterns (one per line)
            </label>
            <Textarea
              rows={8}
              value={form.exclude_patterns}
              onChange={(e) => updateField("exclude_patterns", e.target.value)}
            />
          </Panel>

          <Panel>
            <PanelHead>
              <h3 className="m-0 text-sm font-semibold">GitHub Verification</h3>
            </PanelHead>
            <label className="mb-3 flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.github_enabled}
                onChange={(e) => updateField("github_enabled", e.target.checked)}
                className="size-4"
              />
              <span className="text-sm">Enable GitHub metadata lookups</span>
            </label>
            <label className="mb-3 flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.github_verify_remote_pushes}
                onChange={(e) => updateField("github_verify_remote_pushes", e.target.checked)}
                className="size-4"
              />
              <span className="text-sm">Confirm pushes remotely when possible</span>
            </label>
            <label className="mb-2 block text-sm">GitHub Token</label>
            <Input
              type="password"
              placeholder="Leave blank to keep the current token"
              autoComplete="new-password"
              value={form.github_token}
              onChange={(e) => updateField("github_token", e.target.value)}
            />
            {data?.paths && (
              <div className="mt-4 grid gap-1 text-xs text-muted">
                <span>Config File: {data.paths.config_file}</span>
                <span>Config Dir: {data.paths.config_dir}</span>
                <span>Data: {data.paths.data_dir}</span>
              </div>
            )}
            <p className="mt-4 text-xs text-muted">
              Environment overrides still win on the next process start.
            </p>
          </Panel>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit">Save Settings</Button>
        </div>
      </form>
    </AppLayout>
  );
}
