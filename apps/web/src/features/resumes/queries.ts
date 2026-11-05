import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { isProcessing, type Resume } from "@/lib/resumes/resume-service";
import { useServices } from "@/lib/services";

export const resumeKeys = {
  all: ["resumes"] as const,
  detail: (id: string) => ["resumes", id] as const,
};

export function useResumes() {
  const { resumes } = useServices();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: resumeKeys.all,
    queryFn: () => resumes.list(),
    // Poll while anything is still being processed.
    refetchInterval: (q) => (q.state.data?.some((r) => isProcessing(r.status)) ? 1500 : false),
  });

  // When processing finishes, the profile may have been created from the resume.
  const processing = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!query.data) return;
    const now = new Set(query.data.filter((r) => isProcessing(r.status)).map((r) => r.id));
    const finished = [...processing.current].some((id) => !now.has(id));
    processing.current = now;
    if (finished) void client.invalidateQueries({ queryKey: ["profile"] });
  }, [query.data, client]);

  return query;
}

export function useResumeDetail(id: string | null) {
  const { resumes } = useServices();
  return useQuery({
    queryKey: resumeKeys.detail(id ?? ""),
    queryFn: () => resumes.get(id!),
    enabled: !!id,
  });
}

export function useUploadResume() {
  const { resumes } = useServices();
  const client = useQueryClient();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: (file: File) => {
      setProgress(0);
      return resumes.upload(file, setProgress);
    },
    onSuccess: (resume) => {
      client.setQueryData<Resume[]>(resumeKeys.all, (old) => [
        resume,
        ...(old ?? []).map((r) => ({ ...r, is_primary: false })),
      ]);
      void client.invalidateQueries({ queryKey: resumeKeys.all });
    },
  });
  return { ...mutation, progress };
}

export function useReprocessResume() {
  const { resumes } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resumes.reprocess(id),
    onSuccess: () => client.invalidateQueries({ queryKey: resumeKeys.all }),
  });
}

export function useDeleteResume() {
  const { resumes } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resumes.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: resumeKeys.all });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
