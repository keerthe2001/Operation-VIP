import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";

import { AppLayout, Loading, PublicLayout, RequireAuth } from "@/components/Layout";
import { SessionProvider, useSession } from "@/lib/session";
import { Dashboard, Diagnostic, Missions, MyCertificate, PracticeHub, Profile, ProjectPage, Roadmap } from "@/pages/AppPages";
import { AuthPage, ForgotPassword, Onboarding, ResetPassword } from "@/pages/Auth";
import { Home } from "@/pages/Home";
import { GuidePage, Guides, LearnCatalogue, Legal, NotFound, PricingPage, Verify } from "@/pages/PublicPages";

// Lessons, labs and admin pull in the editor and scene engines, so they load on demand.
const TopicPage = lazy(() => import("@/pages/TopicPage").then((m) => ({ default: m.TopicPage })));
const LabPage = lazy(() => import("@/pages/LabPage").then((m) => ({ default: m.LabPage })));
const admin = () => import("@/pages/Admin");
const AdminOverview = lazy(() => admin().then((m) => ({ default: m.AdminOverview })));
const AdminContent = lazy(() => admin().then((m) => ({ default: m.AdminContent })));
const AdminEdit = lazy(() => admin().then((m) => ({ default: m.AdminEdit })));
const AdminReviews = lazy(() => admin().then((m) => ({ default: m.AdminReviews })));
const AdminAds = lazy(() => admin().then((m) => ({ default: m.AdminAds })));
const AdminUsers = lazy(() => admin().then((m) => ({ default: m.AdminUsers })));
const AdminAudit = lazy(() => admin().then((m) => ({ default: m.AdminAudit })));
/** Signed-in, onboarded learners see pages like the roadmap inside the app shell. */
function Shell() {
  const { user } = useSession();
  return user?.profile.onboarded ? <AppLayout /> : <PublicLayout />;
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="learn" element={<LearnCatalogue />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="guides" element={<Guides />} />
            <Route path="guides/:slug" element={<GuidePage />} />
            <Route path="verify" element={<Verify />} />
            <Route path="verify/:code" element={<Verify />} />
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="signup" element={<AuthPage mode="signup" />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="about" element={<Legal kind="about" />} />
            <Route path="privacy" element={<Legal kind="privacy" />} />
            <Route path="terms" element={<Legal kind="terms" />} />
          </Route>
          <Route element={<Shell />}>
            <Route path="roadmap" element={<Roadmap />} />
          </Route>
          <Route element={<AppLayout />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="practice" element={<PracticeHub />} />
            <Route path="missions" element={<Missions />} />
            <Route path="missions/:slug" element={<ProjectPage />} />
            <Route path="profile" element={<Profile />} />
            <Route path="certificate" element={<MyCertificate />} />
            <Route path="admin" element={<RequireAuth admin><AdminOverview /></RequireAuth>} />
            <Route path="admin/content/:kind" element={<RequireAuth admin><AdminContent /></RequireAuth>} />
            <Route path="admin/edit/:kind/:id" element={<RequireAuth admin><AdminEdit /></RequireAuth>} />
            <Route path="admin/reviews" element={<RequireAuth admin><AdminReviews /></RequireAuth>} />
            <Route path="admin/ads" element={<RequireAuth admin><AdminAds /></RequireAuth>} />
            <Route path="admin/users" element={<RequireAuth admin><AdminUsers /></RequireAuth>} />
            <Route path="admin/audit" element={<RequireAuth admin><AdminAudit /></RequireAuth>} />
          </Route>
          {/* Focus screens: no site chrome, so nothing competes with the lesson. */}
          <Route path="learn/:slug" element={<TopicPage />} />
          <Route path="lab/:slug" element={<LabPage />} />
          <Route path="diagnostic/:slug" element={<RequireAuth><Diagnostic /></RequireAuth>} />
          <Route element={<PublicLayout />}><Route path="*" element={<NotFound />} /></Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionProvider>
  );
}
