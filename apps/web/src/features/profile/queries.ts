import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ProfileWrite } from "@/lib/profile/profile-service";
import { useServices } from "@/lib/services";

export const profileKey = ["profile"] as const;

export function useProfile() {
  const { profile } = useServices();
  return useQuery({ queryKey: profileKey, queryFn: () => profile.get() });
}

export function useSaveProfile() {
  const { profile } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: ProfileWrite) => profile.save(values),
    onSuccess: (data) => client.setQueryData(profileKey, data),
  });
}
