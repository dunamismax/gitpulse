import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { Panel, PanelHead } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { sessionsQuery } from "@/lib/queries";
import { formatTime } from "@/lib/utils";

export const Route = createFileRoute("/sessions/")({
  component: SessionsPage,
});

function SessionsPage() {
  const { data: summary, error, isLoading } = useQuery(sessionsQuery());

  return (
    <AppLayout
      eyebrow="Focus Sessions"
      heading="Session rhythm"
      description="Sessions are built from activity windows separated by inactivity gaps."
    >
      {isLoading && <Notice>Loading sessions…</Notice>}
      {error && <Notice variant="error">{error.message}</Notice>}

      {summary && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StatCard label="Total Minutes" value={summary.total_minutes} />
            <StatCard label="Average Session" value={`${summary.average_length_minutes} min`} />
            <StatCard label="Longest Session" value={`${summary.longest_session_minutes} min`} />
          </div>

          <Panel>
            <PanelHead>
              <h3 className="m-0 text-sm font-semibold">Recent Sessions</h3>
            </PanelHead>
            {summary.sessions.length > 0 ? (
              <div className="grid gap-3">
                {summary.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center"
                  >
                    <div>
                      <strong className="text-sm">{session.active_minutes} min</strong>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatTime(session.started_at)} to {formatTime(session.ended_at)}
                      </p>
                    </div>
                    <Chip>{session.total_changed_lines} changed lines</Chip>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                No sessions recorded yet. Start coding to generate sessions.
              </p>
            )}
          </Panel>
        </>
      )}
    </AppLayout>
  );
}
