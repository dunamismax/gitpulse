export function shortSha(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return value.slice(0, 7);
}

export function sumLines(additions: number, deletions: number): number {
  return additions + deletions;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`;
}

export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDate(
  value: string | Date | null | undefined,
): string {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function heatmapClass(score: number): string {
  if (score >= 80) {
    return "heat-strong";
  }
  if (score >= 40) {
    return "heat-medium";
  }
  if (score > 0) {
    return "heat-light";
  }
  return "heat-empty";
}

export function pushKindLabel(kind: string): string {
  switch (kind) {
    case "push_detected_local":
      return "Detected locally";
    case "push_remote_confirmed":
      return "Remote confirmed";
    default:
      return kind.replaceAll("_", " ");
  }
}
