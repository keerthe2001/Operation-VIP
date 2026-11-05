import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApplicationCreate, ApplicationStatus, ApplicationUpdate } from "@/lib/applications/application-service";
import { useServices } from "@/lib/services";

export function useApplications(filters: { status?: ApplicationStatus; q?: string }) {
  const { applications } = useServices();
  return useQuery({
    queryKey: ["applications", filters],
    queryFn: () => applications.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useApplicationStats() {
  const { applications } = useServices();
  return useQuery({ queryKey: ["applications", "stats"], queryFn: () => applications.stats() });
}

export function useApplicationDetail(id: string | null) {
  const { applications } = useServices();
  return useQuery({ queryKey: ["applications", "detail", id], queryFn: () => applications.get(id!), enabled: !!id });
}

export function useUpdateApplication() {
  const { applications } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApplicationUpdate }) => applications.update(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["applications"] }),
  });
}

export function useCreateApplication() {
  const { applications } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationCreate) => applications.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["applications"] }),
  });
}

export function useDeleteApplication() {
  const { applications } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applications.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["applications"] }),
  });
}
