import { ArrowUpRight, ScanLine } from "lucide-react";
import { APP_BASE_PATHS, APP_DOMAINS } from "@/lib/app-paths";
import { DEFAULT_LOGO_URL } from "@/lib/branding";
import { LandingScene } from "./landing-scene";

export function LandingPage() {
  return (
    <div className="landing-page mx-auto flex min-h-svh max-w-6xl flex-col px-6 sm:px-10">
      <header className="flex items-center gap-3 py-7 sm:py-9">
        <img
          src={DEFAULT_LOGO_URL}
          alt=""
          className="h-10 w-14 shrink-0 object-contain"
        />
        <span className="text-lg font-semibold tracking-tight">
          Cluster Natura
        </span>
      </header>

      <main className="flex flex-1 items-center py-10 sm:py-20">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              Portal warga
            </p>
            <h1 className="mt-6 max-w-xl text-balance text-4xl font-semibold leading-[1.12] tracking-tight sm:text-6xl">
              Dari warga,
              <br />
              <span className="text-primary">untuk kita semua.</span>
            </h1>
            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Akses informasi lingkungan dan pencatatan jimpitan Cluster Natura.
            </p>
            <nav
              aria-label="Layanan Cluster Natura"
              className="mt-8 flex flex-wrap gap-3"
            >
              <a
                href={`https://${APP_DOMAINS.warga}${APP_BASE_PATHS.warga}`}
                className="landing-service-link inline-flex min-h-12 items-center gap-3 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Info warga <ArrowUpRight className="size-4" aria-hidden />
              </a>
              <a
                href={`https://${APP_DOMAINS.petugas}/`}
                className="landing-service-link inline-flex min-h-12 items-center gap-3 rounded-xl border border-line bg-card px-5 text-sm font-semibold hover:bg-idle-soft/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <ScanLine className="size-4 text-primary" aria-hidden /> App
                petugas
              </a>
            </nav>
          </div>

          <LandingScene />
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line py-5 sm:gap-x-6 sm:py-6">
        <div className="space-y-1">
          <p className="text-sm font-semibold tracking-tight">Cluster Natura</p>
        </div>
        <p className="text-xs text-muted">
          © {new Date().getFullYear()} · Portal warga
        </p>
      </footer>
    </div>
  );
}
