import { createBrowserRouter, Link, Navigate, Outlet, useSearchParams } from "react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { usePermission } from "@/client/permissions";
import { Card, buttonClass } from "@/components/ui";
import type { Resource } from "@/lib/permissions";
import { NotFound } from "@/components/not-found";
import { LoginPage } from "@/features/auth/login-page";
import { RequireAuth } from "@/features/auth/require-auth";
import { LoadingCards } from "@/components/query-state";
import { AdminLayout } from "./layout";
import { adminPath } from "@/lib/app-paths";

// Halaman baru dimuat setelah login dan pemeriksaan akses, saat benar-benar dibuka.
const PatrolDetail = lazy(() => import("@/features/riwayat/patrol-detail").then((m) => ({ default: m.PatrolDetail })));
const PatrolList = lazy(() => import("@/features/riwayat/patrol-list").then((m) => ({ default: m.PatrolList })));
const DenahPage = lazy(() => import("./denah/denah-page").then((m) => ({ default: m.DenahPage })));
const InfoPage = lazy(() => import("./info-page").then((m) => ({ default: m.InfoPage })));
const JadwalPage = lazy(() => import("./jadwal/jadwal-page").then((m) => ({ default: m.JadwalPage })));
const KasPage = lazy(() => import("./kas/kas-page").then((m) => ({ default: m.KasPage })));
const PengaturanPage = lazy(() => import("./pengaturan/pengaturan-page").then((m) => ({ default: m.PengaturanPage })));
const RekapPage = lazy(() => import("./rekap").then((m) => ({ default: m.RekapPage })));
const AuditRedirect = lazy(() => import("./riwayat/night-log").then((m) => ({ default: m.AuditRedirect })));
const NightLog = lazy(() => import("./riwayat/night-log").then((m) => ({ default: m.NightLog })));
const NightLogAlerts = lazy(() => import("./riwayat/night-log").then((m) => ({ default: m.NightLogAlerts })));
const RingkasanPage = lazy(() => import("./ringkasan-page").then((m) => ({ default: m.RingkasanPage })));
const CetakPage = lazy(() => import("./rumah/cetak").then((m) => ({ default: m.CetakPage })));
const RumahPage = lazy(() => import("./rumah/rumah-page").then((m) => ({ default: m.RumahPage })));
const SetupPage = lazy(() => import("./setup").then((m) => ({ default: m.SetupPage })));
const WargaPage = lazy(() => import("./warga/warga-page").then((m) => ({ default: m.WargaPage })));
const IuranPage = lazy(() => import("./iuran/iuran-page").then((m) => ({ default: m.IuranPage })));

const NIGHT_LOG = { Alerts: NightLogAlerts, Log: NightLog };

function Access({ resource, write = false, children }: { resource: Resource; write?: boolean; children: ReactNode }) {
  const allowed = usePermission(resource, write);
  return allowed ? children : <Card className="space-y-3 p-6"><h1 className="text-lg font-semibold">Akses terbatas</h1><p className="text-sm text-muted">Peran akunmu belum memiliki akses ke halaman ini.</p><Link to={adminPath()} className={buttonClass("secondary", "sm")}>Kembali ke ringkasan</Link></Card>;
}

function AdminPatrolDetail() {
  const canCorrect = usePermission("patrols", true);
  return <PatrolDetail basePath={adminPath("/riwayat")} canCorrect={canCorrect} log={NIGHT_LOG} />;
}

function DashboardHome() {
  const canOverview = usePermission("overview");
  return canOverview ? <RingkasanPage /> : <Navigate to={adminPath("/info")} replace />;
}

function WargaAccess() {
  const [params] = useSearchParams();
  const canReadResidents = usePermission("residents");
  const tab = params.get("tab");
  const resource = tab === "akun" || (!tab && !canReadResidents) ? "accounts" : "residents";
  return <Access resource={resource}><WargaPage /></Access>;
}

function AccountsRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("tab", "akun");
  return <Navigate to={adminPath(`/warga?${next}`)} replace />;
}

export const router = createBrowserRouter([
  { path: adminPath("/masuk"), element: <LoginPage title="Masuk dashboard" homePath={adminPath()} setupPath={adminPath("/setup")} /> },
  { path: adminPath("/setup"), element: <Suspense fallback={<LoadingCards />}><SetupPage /></Suspense> },
  {
    path: adminPath(),
    element: (
      <RequireAuth loginPath={adminPath("/masuk")} adminOnly>
        {(user) => (
          <AdminLayout user={user}>
            <Suspense fallback={<LoadingCards />}><Outlet /></Suspense>
          </AdminLayout>
        )}
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardHome /> },
      { path: "riwayat", element: <Access resource="patrols"><PatrolList basePath={adminPath("/riwayat")} /></Access> },
      { path: "riwayat/:tanggal", element: <Access resource="patrols"><AdminPatrolDetail /></Access> },
      // Audit catatan sekarang tab "Log catatan" di detail malam Riwayat.
      { path: "audit", element: <Access resource="patrols"><AuditRedirect /></Access> },
      { path: "rekap", element: <Access resource="patrols"><RekapPage /></Access> },
      { path: "kas", element: <Access resource="finance"><KasPage /></Access> },
      { path: "iuran", element: <Access resource="finance"><IuranPage /></Access> },
      { path: "jadwal", element: <Access resource="schedule"><JadwalPage /></Access> },
      { path: "rumah", element: <Access resource="houses"><RumahPage /></Access> },
      { path: "rumah/cetak", element: <Access resource="houses"><CetakPage /></Access> },
      { path: "denah", element: <Access resource="patrols"><DenahPage /></Access> },
      { path: "petugas", element: <Access resource="accounts"><AccountsRedirect /></Access> },
      { path: "warga", element: <WargaAccess /> },
      { path: "keluarga", element: <Navigate to={adminPath("/warga?tab=keluarga")} replace /> },
      { path: "info", element: <Access resource="info"><InfoPage /></Access> },
      { path: "pengaturan", element: <Access resource="settings" write><PengaturanPage /></Access> },
      { path: "*", element: <NotFound home={adminPath()} /> },
    ],
  },
]);
