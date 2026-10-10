import { createBrowserRouter } from "react-router";
import { NotFound } from "@/components/not-found";
import { useEffect } from "react";
import { HousePage } from "./rumah";
import { APP_BASE_PATHS, appSurface, wargaPath } from "@/lib/app-paths";

function InfoRedirect() {
  const target = wargaPath();
  useEffect(() => { window.location.replace(target); }, [target]);
  return null;
}

export const router = createBrowserRouter([
  { path: appSurface(location.hostname) ? APP_BASE_PATHS.warga : "/", element: <InfoRedirect /> },
  { path: wargaPath("/r/:token"), element: <HousePage /> },
  {
    path: "*",
    element: (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <NotFound home={appSurface(location.hostname) ? APP_BASE_PATHS.warga : "/"} />
      </main>
    ),
  },
]);
