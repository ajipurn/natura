import { createBrowserRouter, Outlet } from "react-router";
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
import { adminPath } from "@/lib/app-paths";

const NIGHT_LOG = { Alerts: NightLogAlerts, Log: NightLog };

export const router = createBrowserRouter([
  { path: adminPath("/masuk"), element: <LoginPage title="Masuk admin" homePath={adminPath()} setupPath={adminPath("/setup")} /> },
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
      { path: "riwayat/:tanggal", element: <PatrolDetail basePath={adminPath("/riwayat")} canCorrect log={NIGHT_LOG} /> },
      // Audit catatan sekarang tab "Log catatan" di detail malam Riwayat.
      { path: "audit", element: <AuditRedirect /> },
      { path: "rekap", element: <RekapPage /> },
      { path: "kas", element: <KasPage /> },
      { path: "jadwal", element: <JadwalPage /> },
      { path: "rumah", element: <RumahPage /> },
      { path: "rumah/cetak", element: <CetakPage /> },
      { path: "denah", element: <DenahPage /> },
      { path: "petugas", element: <PetugasPage /> },
      { path: "warga", element: <WargaPage /> },
      { path: "info", element: <InfoPage /> },
      { path: "pengaturan", element: <PengaturanPage /> },
      { path: "*", element: <NotFound home={adminPath()} /> },
    ],
  },
]);
