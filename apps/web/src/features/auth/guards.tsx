import { Navigate, Outlet, useLocation } from "react-router";

import { FullPageSpinner } from "@/components/FullPageSpinner";
import { useSession } from "@/lib/services";

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.status === "loading") return <FullPageSpinner />;
  if (session.status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export function GuestOnly() {
  const session = useSession();
  if (session.status === "loading") return <FullPageSpinner />;
  if (session.status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}
