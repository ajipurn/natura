import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router";
import { LoginPage } from "@/features/auth/login-page";
import { RequireAuth } from "@/features/auth/require-auth";
import { PatrolDetail } from "@/features/riwayat/patrol-detail";
import { PatrolList } from "@/features/riwayat/patrol-list";
import { NotFound } from "@/components/not-found";
import { AkunPage } from "./akun";
import { PetugasLayout } from "./layout";
import { JadwalPetugas } from "./jadwal";
import { RondaPage } from "./ronda/ronda-page";
import { BerandaPage } from "../warga/beranda";
import { adminPath, petugasPath } from "@/lib/app-paths";

function LegacyAppRedirect() {
  const { pathname, search, hash } = useLocation();
  const suffix = pathname.replace(/^\/(?:app|petugas)(?=\/|$)/, "");
  const target = suffix === "/info" || suffix === "/info/" ? "" : suffix;
  return <Navigate to={petugasPath(target) + search + hash} replace />;
}

const atAppRoot = petugasPath() === "/";
const legacyPaths = ["/petugas/*", "/info", ...(atAppRoot ? ["/app/*"] : ["/", "/masuk", "/ronda", "/riwayat/*", "/jadwal", "/akun"])];

export const router = createBrowserRouter([
  ...legacyPaths.map((path) => ({ path, element: <LegacyAppRedirect /> })),
  { path: petugasPath("/masuk"), element: <LoginPage title="Masuk" homePath={petugasPath()} setupPath={adminPath("/setup")} /> },
  {
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
      { path: petugasPath(), element: <BerandaPage /> },
      { path: petugasPath("/ronda"), element: <RondaPage /> },
      ...(atAppRoot ? [] : [{ path: petugasPath("/info"), element: <Navigate to={petugasPath()} replace /> }]),
      { path: petugasPath("/riwayat"), element: <PatrolList basePath={petugasPath("/riwayat")} /> },
      { path: petugasPath("/riwayat/:tanggal"), element: <PatrolDetail basePath={petugasPath("/riwayat")} canCorrect={false} /> },
      { path: petugasPath("/jadwal"), element: <JadwalPetugas /> },
      { path: petugasPath("/akun"), element: <AkunPage /> },
      { path: petugasPath("/*"), element: <NotFound home={petugasPath()} /> },
    ],
  },
]);
