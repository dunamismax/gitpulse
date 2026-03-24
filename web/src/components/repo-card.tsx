import { Link } from "@tanstack/react-router";
import type { RepositoryCard } from "@/lib/api";
import { Button } from "./ui/button";
import { Chip } from "./ui/chip";

interface RepoCardProps {
  card: RepositoryCard;
  onRefresh: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string, name: string) => void;
}

export function RepoCard({ card, onRefresh, onToggle, onRemove }: RepoCardProps) {
  return (
    <article className="rounded-panel border border-line bg-gradient-to-b from-panel to-panel-alt p-5 shadow-panel">
      <header className="flex justify-between gap-4">
        <div>
          <h4 className="m-0 text-sm font-semibold">
            <Link
              to="/repositories/$repoId"
              params={{ repoId: card.repo.id }}
              className="text-inherit no-underline hover:text-accent"
            >
              {card.repo.name}
            </Link>
          </h4>
          <p className="mt-1 text-xs text-muted">{card.repo.root_path}</p>
        </div>
        <Chip>{card.health}</Chip>
      </header>

      {card.metrics ? (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span>{card.metrics.commits} commits</span>
          <span>{card.metrics.pushes} pushes</span>
          <span>{card.metrics.files_touched} files</span>
          <span>{card.metrics.score} score</span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No data yet.</p>
      )}

      <div className="my-4 flex h-[60px] items-end gap-1.5 overflow-hidden">
        {card.sparkline.map((bar, i) => (
          <span
            key={`${card.repo.id}-${i}`}
            className="min-w-0 flex-1 rounded-t-full bg-gradient-to-t from-accent-strong to-accent"
            style={{ height: `${Math.max(bar, 4)}px` }}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => onRefresh(card.repo.id)}>Rescan</Button>
        <Button variant="secondary" onClick={() => onToggle(card.repo.id)}>
          {card.repo.is_monitored ? "Disable" : "Enable"}
        </Button>
        <Button variant="danger" onClick={() => onRemove(card.repo.id, card.repo.name)}>
          Remove
        </Button>
      </div>
    </article>
  );
}
