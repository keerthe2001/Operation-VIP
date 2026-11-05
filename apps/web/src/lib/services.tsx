import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import { AnswerService } from "@/lib/answers/answer-service";
import { createApiClient } from "@/lib/api/client";
import { ApplicationService } from "@/lib/applications/application-service";
import { AuthService } from "@/lib/auth/auth-service";
import { SessionStore, type SessionState } from "@/lib/auth/session";
import { chromeBridge, type ExtensionBridge } from "@/lib/extension/bridge";
import { ExtensionService } from "@/lib/extension/extension-service";
import { ProfileService } from "@/lib/profile/profile-service";
import { ResumeService } from "@/lib/resumes/resume-service";

type PublicMethods<T> = { [K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never]: T[K] };

export interface Services {
  session: SessionStore;
  auth: Pick<AuthService, "login" | "register" | "logout" | "restore">;
  resumes: PublicMethods<ResumeService>;
  profile: PublicMethods<ProfileService>;
  extension: PublicMethods<ExtensionService>;
  answers: PublicMethods<AnswerService>;
  applications: PublicMethods<ApplicationService>;
  extensionBridge: ExtensionBridge;
}

export function createServices(origin: string = window.location.origin): Services {
  const session = new SessionStore();
  const { client, refresh } = createApiClient(session, origin);
  return {
    session,
    auth: new AuthService(client, session, refresh, origin),
    resumes: new ResumeService(client, session, refresh, origin),
    profile: new ProfileService(client),
    extension: new ExtensionService(client),
    answers: new AnswerService(client),
    applications: new ApplicationService(client),
    extensionBridge: chromeBridge,
  };
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
