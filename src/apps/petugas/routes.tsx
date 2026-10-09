import { createBrowserRouter, Outlet } from "react-router";
import { LoginPage } from "@/features/auth/login-page";
import { RequireAuth } from "@/features/auth/require-auth";
import { PatrolDetail } from "@/features/riwayat/patrol-detail";
import { PatrolList } from "@/features/riwayat/patrol-list";
import { NotFound } from "@/components/not-found";
import { AkunPage } from "./akun";
import { PetugasLayout } from "./layout";
import { JadwalPetugas } from "./jadwal";
import { RondaPage } from "./ronda/ronda-page";
import { adminPath, petugasPath } from "@/lib/app-paths";

export const router = createBrowserRouter([
  { path: petugasPath("/masuk"), element: <LoginPage title="Masuk petugas" homePath={petugasPath()} setupPath={adminPath("/setup")} /> },
  {
    path: petugasPath(),
    element: (
      <RequireAuth loginPath={petugasPath("/masuk")}>
        {() => (
          <PetugasLayout>
            <Outlet />
          </PetugasLayout>
        )}
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RondaPage /> },
      { path: "riwayat", element: <PatrolList basePath={petugasPath("/riwayat")} /> },
      { path: "riwayat/:tanggal", element: <PatrolDetail basePath={petugasPath("/riwayat")} canCorrect={false} /> },
      { path: "jadwal", element: <JadwalPetugas /> },
      { path: "akun", element: <AkunPage /> },
      { path: "*", element: <NotFound home={petugasPath()} /> },
    ],
  },
]);
