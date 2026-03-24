import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Notice } from "@/components/ui/notice";
import { StatCard } from "@/components/ui/stat-card";
import { achievementsQuery } from "@/lib/queries";

export const Route = createFileRoute("/achievements/")({
  component: AchievementsPage,
});

function AchievementsPage() {
  const { data, error, isLoading } = useQuery(achievementsQuery());

  return (
    <AppLayout
      eyebrow="Achievements"
      heading="Consistency, not gimmicks"
      description="Score is separate from raw stats and the badge set stays intentionally grounded."
    >
      {isLoading && <Notice>Loading achievements…</Notice>}
      {error && <Notice variant="error">{error.message}</Notice>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StatCard label="Current Streak" value={`${data.streaks.current_days} days`} />
            <StatCard label="Best Streak" value={`${data.streaks.best_days} days`} />
            <StatCard label="Today's Score" value={data.today_score} />
          </div>

          {data.achievements.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.achievements.map((achievement) => (
                <article
                  key={`${achievement.kind}-${achievement.unlocked_at}`}
                  className="rounded-2xl border border-line bg-bg/50 p-4"
                >
                  <h3 className="m-0 text-sm font-semibold">{achievement.kind}</h3>
                  <p className="mt-2 text-sm text-muted">{achievement.reason}</p>
                  <small className="mt-2 block text-xs text-muted">
                    {achievement.day ? `Unlocked on ${achievement.day}` : "Unlocked recently"}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No achievements unlocked yet. Keep coding.</p>
          )}
        </>
      )}
    </AppLayout>
  );
}
