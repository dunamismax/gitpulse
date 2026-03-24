import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { RepoCard } from "@/components/repo-card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { Panel, PanelHead } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import type { TrendPoint } from "@/lib/api";
import { refreshRepo, removeRepo, toggleRepo } from "@/lib/api";
import { dashboardQuery } from "@/lib/queries";
import { formatTime } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function heatmapClass(score: number): string {
  if (score >= 80) return "bg-accent-strong/40";
  if (score >= 40) return "bg-success/20";
  if (score > 0) return "bg-accent/20";
  return "bg-white/5";
}

function DashboardPage() {
  const { data, error, isLoading } = useQuery(dashboardQuery());
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });

  if (isLoading)
    return (
      <DashboardShell>
        <Notice>Loading dashboard…</Notice>
      </DashboardShell>
    );
  if (error)
    return (
      <DashboardShell>
        <Notice variant="error">{error.message}</Notice>
      </DashboardShell>
    );
  if (!data) return null;

  const { summary, trend_points, heatmap_days, activity_feed, repo_cards } = data;

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Live Lines" value={summary.live_lines} />
        <StatCard label="Staged Lines" value={summary.staged_lines} />
        <StatCard label="Commits Today" value={summary.commits_today} />
        <StatCard label="Pushes Today" value={summary.pushes_today} />
        <StatCard label="Active Session" value={`${summary.active_session_minutes} min`} />
        <StatCard
          label="Streak / Score"
          value={`${summary.streak_days} / ${summary.today_score}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead>
            <h3 className="m-0 text-sm font-semibold">30 Day Trend</h3>
            <Chip>Changed lines + score</Chip>
          </PanelHead>
          <div className="flex min-h-[220px] items-end gap-1.5">
            {trend_points.map((point: TrendPoint) => (
              <div
                key={point.day}
                className="min-w-0 flex-1 rounded-t-full bg-gradient-to-t from-accent-strong to-accent"
                style={{ height: `${Math.max(point.score, 4)}px` }}
                title={`${point.day}: score ${point.score}, ${point.changed_lines} lines`}
              />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHead>
            <h3 className="m-0 text-sm font-semibold">12 Week Heatmap</h3>
            <Chip>Consistency</Chip>
          </PanelHead>
          <div className="grid grid-cols-14 gap-1.5">
            {heatmap_days.map((point: TrendPoint) => (
              <div
                key={point.day}
                className={`aspect-square rounded-[10px] border border-transparent ${heatmapClass(point.score)}`}
                title={`${point.day}: score ${point.score}`}
              />
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead>
            <h3 className="m-0 text-sm font-semibold">Activity Feed</h3>
            <Chip>Live</Chip>
          </PanelHead>
          {activity_feed.length > 0 ? (
            <div className="grid gap-3">
              {activity_feed.map((item) => (
                <div
                  key={`${item.timestamp}-${item.kind}-${item.repo_name}`}
                  className="flex items-center justify-between gap-3"
                >
                  <strong className="text-sm">{item.repo_name}</strong>
                  <span className="text-xs text-muted">{item.kind}</span>
                  <small className="text-xs text-muted">{formatTime(item.timestamp)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No recent activity.</p>
          )}
        </Panel>

        <Panel>
          <PanelHead>
            <h3 className="m-0 text-sm font-semibold">Goals</h3>
            <Chip>Transparent scoring</Chip>
          </PanelHead>
          {summary.goals.length > 0 ? (
            <div className="grid gap-3">
              {summary.goals.map((goal) => (
                <div key={goal.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm">{goal.label}</span>
                    <strong className="text-sm">
                      {goal.current}/{goal.target}
                    </strong>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-strong"
                      style={{ width: `${goal.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel>
        <PanelHead>
          <h3 className="m-0 text-sm font-semibold">Repository Pulse</h3>
          <Chip>{repo_cards.length} tracked</Chip>
        </PanelHead>
        {repo_cards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {repo_cards.map((card) => (
              <RepoCard
                key={card.repo.id}
                card={card}
                onRefresh={async (id) => {
                  await refreshRepo(id);
                  invalidate();
                }}
                onToggle={async (id) => {
                  await toggleRepo(id);
                  invalidate();
                }}
                onRemove={async (id, name) => {
                  if (!window.confirm(`Remove ${name} from GitPulse tracking?`)) return;
                  await removeRepo(id);
                  invalidate();
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No repositories tracked yet.</p>
        )}
      </Panel>
    </DashboardShell>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout
      eyebrow="Today"
      heading="What are you changing right now?"
      description="GitPulse keeps live work, committed work, and pushed work separate so the signal stays honest."
    >
      {children}
    </AppLayout>
  );
}
