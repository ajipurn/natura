import { createBrowserRouter } from "react-router";
import { NotFound } from "@/components/not-found";
import { BerandaPage } from "./beranda";
import { HousePage } from "./rumah";

export const router = createBrowserRouter([
  { path: "/", element: <BerandaPage /> },
  { path: "/r/:token", element: <HousePage /> },
  {
    path: "*",
    element: (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <NotFound home="/" />
      </main>
    ),
  },
]);
