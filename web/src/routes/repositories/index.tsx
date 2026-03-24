import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { RepoCard } from "@/components/repo-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Panel, PanelHead } from "@/components/ui/panel";
import { addTarget, refreshRepo, removeRepo, toggleRepo } from "@/lib/api";
import { repositoriesQuery } from "@/lib/queries";

export const Route = createFileRoute("/repositories/")({
  component: RepositoriesPage,
});

function RepositoriesPage() {
  const { data: cards, error, isLoading } = useQuery(repositoriesQuery());
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const [message, setMessage] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["repositories"] });

  const addMutation = useMutation({
    mutationFn: (p: string) => addTarget(p),
    onSuccess: () => {
      setPath("");
      setMessage("Target added.");
      invalidate();
    },
  });

  return (
    <AppLayout
      eyebrow="Tracked Targets"
      heading="Repositories"
      description="Add a single repo or a parent folder. Nested repos are discovered and tracked individually."
    >
      {isLoading && <Notice>Loading repositories…</Notice>}
      {message && <Notice variant="success">{message}</Notice>}
      {(error || addMutation.error) && (
        <Notice variant="error">{(error || addMutation.error)?.message}</Notice>
      )}

      <Panel tight>
        <form
          className="flex items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (path.trim()) addMutation.mutate(path.trim());
          }}
        >
          <Input
            type="text"
            placeholder="/Users/you/code"
            required
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <Button type="submit">Add Target</Button>
        </form>
      </Panel>

      <Panel>
        <PanelHead>
          <h3 className="m-0 text-sm font-semibold">All Repositories</h3>
          <Chip>{cards?.length ?? 0} total</Chip>
        </PanelHead>

        {cards && cards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <RepoCard
                key={card.repo.id}
                card={card}
                onRefresh={async (id) => {
                  await refreshRepo(id);
                  setMessage("Repository rescanned.");
                  invalidate();
                }}
                onToggle={async (id) => {
                  await toggleRepo(id);
                  setMessage("Monitoring state updated.");
                  invalidate();
                }}
                onRemove={async (id, name) => {
                  if (!window.confirm(`Remove ${name} from GitPulse tracking?`)) return;
                  await removeRepo(id);
                  setMessage("Repository removed.");
                  invalidate();
                }}
              />
            ))}
          </div>
        ) : (
          !isLoading && (
            <p className="text-sm text-muted">
              No repositories tracked yet. Add a path above to get started.
            </p>
          )
        )}
      </Panel>
    </AppLayout>
  );
}
