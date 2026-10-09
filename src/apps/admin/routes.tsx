import { createBrowserRouter, Link, Navigate, Outlet } from "react-router";
import type { ReactNode } from "react";
import { usePermission } from "@/client/permissions";
import { Card, buttonClass } from "@/components/ui";
import type { Resource } from "@/lib/permissions";
import { NotFound } from "@/components/not-found";
import { LoginPage } from "@/features/auth/login-page";
import { RequireAuth } from "@/features/auth/require-auth";
import { PatrolDetail } from "@/features/riwayat/patrol-detail";
import { PatrolList } from "@/features/riwayat/patrol-list";
import { DenahPage } from "./denah/denah-page";
import { InfoPage } from "./info-page";
import { JadwalPage } from "./jadwal/jadwal-page";
import { KasPage } from "./kas/kas-page";
import { AdminLayout } from "./layout";
import { PengaturanPage } from "./pengaturan/pengaturan-page";
import { PetugasPage } from "./petugas/petugas-page";
import { RekapPage } from "./rekap";
import { AuditRedirect, NightLog, NightLogAlerts } from "./riwayat/night-log";
import { RingkasanPage } from "./ringkasan-page";
import { CetakPage } from "./rumah/cetak";
import { RumahPage } from "./rumah/rumah-page";
import { SetupPage } from "./setup";
import { WargaPage } from "./warga/warga-page";
import { IuranPage } from "./iuran/iuran-page";
import { adminPath } from "@/lib/app-paths";

const NIGHT_LOG = { Alerts: NightLogAlerts, Log: NightLog };

function Access({ resource, write = false, children }: { resource: Resource; write?: boolean; children: ReactNode }) {
  const allowed = usePermission(resource, write);
  return allowed ? children : <Card className="space-y-3 p-6"><h1 className="text-lg font-semibold">Akses terbatas</h1><p className="text-sm text-muted">Peran akunmu belum memiliki akses ke halaman ini.</p><Link to={adminPath()} className={buttonClass("secondary", "sm")}>Kembali ke ringkasan</Link></Card>;
}

function AdminPatrolDetail() {
  const canCorrect = usePermission("patrols", true);
  return <PatrolDetail basePath={adminPath("/riwayat")} canCorrect={canCorrect} log={NIGHT_LOG} />;
}

export const router = createBrowserRouter([
  { path: adminPath("/masuk"), element: <LoginPage title="Masuk dashboard" homePath={adminPath()} setupPath={adminPath("/setup")} /> },
  { path: adminPath("/setup"), element: <SetupPage /> },
  {
    path: adminPath(),
    element: (
      <RequireAuth loginPath={adminPath("/masuk")} adminOnly>
        {(user) => (
          <AdminLayout user={user}>
            <Outlet />
          </AdminLayout>
        )}
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RingkasanPage /> },
      { path: "riwayat", element: <PatrolList basePath={adminPath("/riwayat")} /> },
      { path: "riwayat/:tanggal", element: <AdminPatrolDetail /> },
      // Audit catatan sekarang tab "Log catatan" di detail malam Riwayat.
      { path: "audit", element: <AuditRedirect /> },
      { path: "rekap", element: <RekapPage /> },
      { path: "kas", element: <Access resource="finance"><KasPage /></Access> },
      { path: "iuran", element: <Access resource="finance"><IuranPage /></Access> },
      { path: "jadwal", element: <Access resource="schedule"><JadwalPage /></Access> },
      { path: "rumah", element: <RumahPage /> },
      { path: "rumah/cetak", element: <CetakPage /> },
      { path: "denah", element: <DenahPage /> },
      { path: "petugas", element: <Access resource="accounts" write><PetugasPage /></Access> },
      { path: "warga", element: <Access resource="residents"><WargaPage /></Access> },
      { path: "keluarga", element: <Navigate to={adminPath("/warga?tab=keluarga")} replace /> },
      { path: "info", element: <Access resource="info"><InfoPage /></Access> },
      { path: "pengaturan", element: <Access resource="settings" write><PengaturanPage /></Access> },
      { path: "*", element: <NotFound home={adminPath()} /> },
    ],
  },
]);
