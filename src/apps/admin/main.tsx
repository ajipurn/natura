import { mount } from "@/client/mount";
import { router } from "./routes";
import { appSurface } from "@/lib/app-paths";

mount(router, "admin");

if (import.meta.env.PROD && appSurface(location.hostname, location.pathname) === "admin") {
  document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href = "/admin-domain.webmanifest";
}
