import { useQuery } from "@tanstack/react-query";

import { useServices } from "@/lib/services";

export function useExtensionStatus() {
  const { extensionBridge } = useServices();
  return useQuery({ queryKey: ["extension-status"], queryFn: () => extensionBridge.status(), staleTime: 10_000 });
}
