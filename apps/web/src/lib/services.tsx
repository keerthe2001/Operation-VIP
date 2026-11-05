import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import { createApiClient } from "@/lib/api/client";
import { AuthService } from "@/lib/auth/auth-service";
import { SessionStore, type SessionState } from "@/lib/auth/session";

export interface Services {
  session: SessionStore;
  auth: Pick<AuthService, "login" | "register" | "logout" | "restore">;
}

export function createServices(origin: string = window.location.origin): Services {
  const session = new SessionStore();
  const { client, refresh } = createApiClient(session, origin);
  return { session, auth: new AuthService(client, session, refresh, origin) };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside <ServicesProvider>");
  return services;
}

export function useSession(): SessionState {
  const { session } = useServices();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
