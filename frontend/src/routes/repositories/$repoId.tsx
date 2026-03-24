import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Panel, PanelHead } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { refreshRepo, saveRepoPatterns } from "@/lib/api";
import { repoDetailQuery } from "@/lib/queries";
import { formatTime, shortSha, splitLines } from "@/lib/utils";

export const Route = createFileRoute("/repositories/$repoId")({
  component: RepoDetailPage,
});

function RepoDetailPage() {
  const { repoId } = Route.useParams();
  const { data: view, error, isLoading } = useQuery(repoDetailQuery(repoId));
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [includePatterns, setIncludePatterns] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");

  useEffect(() => {
    if (view) {
      setIncludePatterns(view.include_patterns.join("\n"));
      setExcludePatterns(view.exclude_patterns.join("\n"));
    }
  }, [view]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["repositories", repoId] });

  const patternMutation = useMutation({
    mutationFn: () =>
      saveRepoPatterns(repoId, splitLines(includePatterns), splitLines(excludePatterns)),
    onSuccess: () => {
      setMessage("Repository patterns saved.");
      invalidate();
    },
  });

  const liveLines =
    (view?.card.snapshot?.live_additions ?? 0) + (view?.card.snapshot?.live_deletions ?? 0);
  const stagedLines =
    (view?.card.snapshot?.staged_additions ?? 0) + (view?.card.snapshot?.staged_deletions ?? 0);

  return (
    <AppLayout
      eyebrow="Repository Detail"
      heading="Repository detail"
      description="Repository-specific filters, health, sessions, and imported history."
    >
      {isLoading && <Notice>Loading repository…</Notice>}
      {message && <Notice variant="success">{message}</Notice>}
      {(error || patternMutation.error) && (
        <Notice variant="error">{(error || patternMutation.error)?.message}</Notice>
      )}

      {view && (
        <>
          <Panel tight>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-accent">
                  Tracked repository
                </p>
                <h3 className="m-0 text-base font-semibold">{view.card.repo.name}</h3>
                <p className="mt-1 text-xs text-muted">{view.card.repo.root_path}</p>
              </div>
              <Button
                onClick={async () => {
                  await refreshRepo(repoId);
                  setMessage("Repository rescanned.");
                  invalidate();
                }}
              >
                Rescan
              </Button>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StatCard
              label="Branch"
              value={view.card.snapshot?.branch ?? "(detached)"}
              detail={view.card.snapshot?.upstream_ref ?? "no upstream"}
            />
            <StatCard
              label="Live / Staged"
              value={`${liveLines} / ${stagedLines}`}
              detail="Changed lines"
            />
            <StatCard
              label="Health"
              value={view.card.health}
              detail={`Score: ${view.card.metrics?.score ?? 0}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead>
                <div>
                  <h3 className="m-0 text-sm font-semibold">Pattern Overrides</h3>
                  <p className="mt-1 text-xs text-muted">
                    These patterns apply only to this repository. Excludes always win over includes.
                  </p>
                </div>
              </PanelHead>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  patternMutation.mutate();
                }}
              >
                <label className="mb-2 block text-sm">Repo Include Patterns</label>
                <Textarea
                  rows={5}
                  placeholder={"src/**\ndocs/**"}
                  value={includePatterns}
                  onChange={(e) => setIncludePatterns(e.target.value)}
                />
                <label className="mb-2 mt-4 block text-sm">Repo Exclude Patterns</label>
                <Textarea
                  rows={7}
                  placeholder={"generated/**\nfixtures/**"}
                  value={excludePatterns}
                  onChange={(e) => setExcludePatterns(e.target.value)}
                />
                <p className="mb-4 mt-2 text-xs text-muted">
                  Saving applies new filters to future refreshes for this repository.
                </p>
                <Button type="submit">Save Repo Patterns</Button>
              </form>
            </Panel>

            <Panel>
              <PanelHead>
                <h3 className="m-0 text-sm font-semibold">Language Breakdown</h3>
              </PanelHead>
              {view.language_breakdown.length > 0 ? (
                <div className="grid gap-3">
                  {view.language_breakdown.map((lang) => (
                    <div key={lang.language} className="flex items-center justify-between">
                      <span className="text-sm">{lang.language}</span>
                      <strong className="text-sm">{lang.code} lines</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No language data available.</p>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead>
                <h3 className="m-0 text-sm font-semibold">Recent Commits</h3>
              </PanelHead>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-line text-left text-sm">
                      <th className="py-2.5">SHA</th>
                      <th className="py-2.5">Summary</th>
                      <th className="py-2.5">Lines</th>
                      <th className="py-2.5">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.recent_commits.length > 0 ? (
                      view.recent_commits.map((commit) => (
                        <tr key={commit.id} className="border-b border-line text-sm">
                          <td className="py-2.5">
                            <code className="text-accent">{shortSha(commit.commit_sha)}</code>
                          </td>
                          <td className="py-2.5">{commit.summary}</td>
                          <td className="py-2.5">{commit.additions + commit.deletions}</td>
                          <td className="py-2.5 text-muted">{formatTime(commit.authored_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-2.5 text-sm text-muted">
                          No commits imported yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <PanelHead>
                <h3 className="m-0 text-sm font-semibold">Recent Sessions</h3>
              </PanelHead>
              {view.recent_sessions.length > 0 ? (
                <div className="grid gap-3">
                  {view.recent_sessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between gap-3">
                      <div>
                        <strong className="text-sm">{session.active_minutes} min</strong>
                        <span className="ml-2 text-xs text-muted">
                          {formatTime(session.started_at)}
                        </span>
                      </div>
                      <Chip>{session.total_changed_lines} lines</Chip>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No sessions recorded for this repository.</p>
              )}
            </Panel>
          </div>

          <Panel>
            <PanelHead>
              <h3 className="m-0 text-sm font-semibold">Top Files Touched</h3>
            </PanelHead>
            {view.top_files.length > 0 ? (
              <div className="grid gap-3">
                {view.top_files.map((file) => (
                  <div key={file} className="rounded-2xl border border-line bg-bg/50 px-4 py-3.5">
                    <code className="text-accent">{file}</code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No file activity recorded.</p>
            )}
          </Panel>
        </>
      )}
    </AppLayout>
  );
}
