import { queryOptions } from "@tanstack/react-query";
import {
  fetchAchievements,
  fetchDashboard,
  fetchRepoDetail,
  fetchRepositories,
  fetchSessions,
  fetchSettings,
} from "./api";

export const dashboardQuery = () =>
  queryOptions({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 5000,
  });

export const repositoriesQuery = () =>
  queryOptions({
    queryKey: ["repositories"],
    queryFn: fetchRepositories,
  });

export const repoDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ["repositories", id],
    queryFn: () => fetchRepoDetail(id),
    enabled: !!id,
  });

export const sessionsQuery = () =>
  queryOptions({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
  });

export const achievementsQuery = () =>
  queryOptions({
    queryKey: ["achievements"],
    queryFn: fetchAchievements,
  });

export const settingsQuery = () =>
  queryOptions({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });
