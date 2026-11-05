import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SavedAnswerInput } from "@/lib/answers/answer-service";
import { useServices } from "@/lib/services";

export const answerKeys = { all: ["answers"] as const, templates: ["answer-templates"] as const, placeholders: ["answer-placeholders"] as const };

export function useAnswers() {
  const { answers } = useServices();
  return useQuery({ queryKey: answerKeys.all, queryFn: () => answers.list() });
}

export function useTemplates() {
  const { answers } = useServices();
  return useQuery({ queryKey: answerKeys.templates, queryFn: () => answers.templates(), staleTime: Infinity });
}

export function usePlaceholders() {
  const { answers } = useServices();
  return useQuery({ queryKey: answerKeys.placeholders, queryFn: () => answers.placeholders(), staleTime: Infinity });
}

export function useSaveAnswer() {
  const { answers } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SavedAnswerInput }) => (id ? answers.update(id, input) : answers.create(input)),
    onSuccess: () => client.invalidateQueries({ queryKey: answerKeys.all }),
  });
}

export function useDeleteAnswer() {
  const { answers } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => answers.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: answerKeys.all }),
  });
}
