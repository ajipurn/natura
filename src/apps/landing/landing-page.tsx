import { ArrowUpRight, Leaf, ScanLine } from "lucide-react";
import { APP_DOMAINS } from "@/lib/app-paths";

export function LandingPage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col px-6 sm:px-10">
      <header className="flex items-center gap-3 py-7 sm:py-9">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-fg">
          <Leaf className="size-6" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight">Cluster Natura</span>
      </header>

      <main className="flex flex-1 items-center py-12 sm:py-20">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Under maintenance
            </p>
            <h1 className="mt-6 max-w-xl text-balance text-4xl font-semibold leading-[1.12] tracking-tight sm:text-6xl">
              Ruang bersama,<br /><span className="text-primary">sedang disiapkan.</span>
            </h1>
            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Website Cluster Natura sedang dikembangkan menjadi pusat informasi dan layanan perumahan kita.
            </p>
            <p className="mt-8 text-sm text-muted">Layanan warga tetap bisa diakses:</p>
            <nav aria-label="Layanan Cluster Natura" className="mt-3 flex flex-wrap gap-3">
              <a href={`https://${APP_DOMAINS.warga}/`} className="inline-flex min-h-12 items-center gap-3 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg transition-[background-color,scale] hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary active:scale-[0.96] motion-reduce:transform-none">
                Buka info warga <ArrowUpRight className="size-4" aria-hidden />
              </a>
              <a href={`https://${APP_DOMAINS.petugas}/`} className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-line bg-card px-5 text-sm font-semibold transition-[background-color,scale] hover:bg-idle-soft/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary active:scale-[0.96] motion-reduce:transform-none">
                <ScanLine className="size-4 text-primary" aria-hidden /> Buka app petugas
              </a>
            </nav>
            <a href={`https://${APP_DOMAINS.admin}/`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
              Dashboard pengurus <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </div>

          <div className="rounded-[2rem] bg-primary/5 p-7 sm:p-10" aria-hidden>
            <svg viewBox="0 0 360 300" fill="none" className="w-full text-primary">
              <circle cx="265" cy="64" r="27" fill="currentColor" opacity=".1" />
              <path d="M22 238C77 214 126 221 178 235C229 249 278 249 338 225" stroke="currentColor" strokeWidth="2" opacity=".25" />
              <path d="M73 138L126 96L179 138V223H73V138Z" fill="var(--card)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M60 142L126 89L192 142" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M115 223V181H139V223" fill="currentColor" opacity=".15" />
              <path d="M92 148H112V166H92V148ZM141 148H161V166H141V148Z" fill="currentColor" opacity=".15" />
              <path d="M204 166L245 132L286 166V229H204V166Z" fill="var(--card)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M194 170L245 128L297 170" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M235 229V193H255V229" fill="currentColor" opacity=".15" />
              <path d="M44 231V174M313 226V181" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M44 127C22 148 16 171 27 181C35 189 44 186 44 186C44 186 53 189 61 181C72 171 66 148 44 127ZM313 142C293 163 289 181 299 189C305 195 313 193 313 193C313 193 321 195 327 189C337 181 333 163 313 142Z" fill="currentColor" opacity=".2" />
              <path d="M109 254C145 249 189 254 218 263" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".2" />
            </svg>
            <p className="mt-3 text-center text-sm font-medium text-primary">Satu lingkungan. Saling terhubung.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-line py-6 text-xs text-muted sm:flex sm:justify-between">
        <p>Cluster Natura · Informasi dan layanan warga</p>
        <p className="mt-2 sm:mt-0">clusternatura.com</p>
      </footer>
    </div>
  );
}
