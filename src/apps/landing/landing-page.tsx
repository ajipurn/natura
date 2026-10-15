import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Menu, Plus } from "lucide-react";
import { adminPath, petugasPath, wargaPath } from "@/lib/app-paths";
import { NaturaMark } from "./landing-brand";
import { mountLandingMotion } from "./landing-motion";
import { LandingScene } from "./landing-scene";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToMotionPreference(onChange: () => void) {
  const preference = window.matchMedia(motionQuery);
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
}
const reducedMotionSnapshot = () => window.matchMedia(motionQuery).matches;
const navigation = [
  { href: "#tentang", label: "Tentang" },
  { href: "#layanan", label: "Layanan" },
  { href: "#akses", label: "Akses warga" },
];
const services = [
  {
    title: "Kabar lingkungan",
    description: "Pengumuman lingkungan, informasi warga, dan kontak pengurus.",
    action: "Buka beranda",
    href: wargaPath(),
    symbol: "kabar",
  },
  {
    title: "Ronda & jimpitan",
    description:
      "Lihat petugas malam ini dan catat jimpitan dengan memindai QR rumah.",
    action: "Buka ronda",
    href: petugasPath("/ronda"),
    symbol: "ronda",
  },
  {
    title: "Jadwal ronda",
    description:
      "Cek giliran jaga dan ajukan perubahan jadwal lewat akun warga.",
    action: "Lihat jadwal",
    href: petugasPath("/akun/jadwal"),
    symbol: "jadwal",
  },
  {
    title: "Kas lingkungan",
    description: "Ringkasan pemasukan dan pengeluaran kas lingkungan.",
    action: "Lihat informasi kas",
    href: wargaPath(),
    symbol: "kas",
  },
];

function ServiceSymbol({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 180 150"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className="landing-service__symbol"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "kabar" && (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M${38 + i * 10} 120V${65 - i * 5}a${52 - i * 10} ${52 - i * 10} 0 0 1 ${104 - i * 20} 0V120`}
            />
          ))}
          <path d="M28 120h124" />
        </>
      )}
      {kind === "ronda" && (
        <>
          <circle cx="90" cy="75" r="48" />
          <circle cx="90" cy="75" r="37" />
          <path d="M90 27v96M42 75h96M56 41l68 68M56 109l68-68" />
          <circle cx="90" cy="75" r="13" fill="var(--landing-paper)" />
        </>
      )}
      {kind === "jadwal" && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M${36 + i * 10} ${50 - i * 7}l60-20 48 30-60 20Z M${36 + i * 10} ${50 - i * 7}v55l48 30 60-20V${60 - i * 7} M${84 + i * 10} ${80 - i * 7}v55`}
            />
          ))}
        </>
      )}
      {kind === "kas" && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <ellipse cx="90" cy={48 + i * 17} rx="49" ry="16" />
              <path
                d={`M41 ${48 + i * 17}v10c0 9 22 16 49 16s49-7 49-16v-10`}
              />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

export function LandingPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    reducedMotionSnapshot,
    () => true,
  );
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!pageRef.current) return;
    return mountLandingMotion(pageRef.current);
  }, []);
  const appUrl = wargaPath();

  return (
    <div
      ref={pageRef}
      className="landing-page"
      id="atas"
      data-motion={paused || reducedMotion ? "paused" : "running"}
    >
      <a className="landing-skip-link" href="#konten">
        Langsung ke konten
      </a>
      <header className="landing-header landing-container">
        <a
          className="landing-brand"
          href="#atas"
          aria-label="Cluster Natura, beranda"
        >
          <NaturaMark className="landing-brand__mark" />
          <span>
            Cluster
            <br />
            <strong>Natura</strong>
          </span>
        </a>
        <nav className="landing-desktop-nav" aria-label="Navigasi utama">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="landing-header__login" href={appUrl}>
          Portal warga{" "}
          <ArrowUpRight size={17} strokeWidth={1.5} aria-hidden="true" />
        </a>
        <details
          className="landing-mobile-nav"
          onKeyDown={(event) => {
            if (event.key === "Escape" && event.currentTarget.open) {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary>
            Menu <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
          </summary>
          <nav aria-label="Navigasi utama di HP">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(event) =>
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open")
                }
              >
                {item.label}
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            ))}
            <a href={appUrl}>
              Portal warga
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </nav>
        </details>
      </header>

      <main id="konten" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero__meta landing-container" data-intro>
            <span className="landing-eyebrow">
              Portal lingkungan Cluster Natura
            </span>
            <span className="landing-eyebrow landing-hero__edition">
              Informasi · Jadwal · Kas
            </span>
          </div>
          <h1
            id="landing-title"
            className="landing-masthead"
            aria-label="Natura"
          >
            {"natura".split("").map((letter, index) => (
              <span
                className="landing-masthead__mask"
                key={index}
                aria-hidden="true"
              >
                <span className="landing-masthead__letter">{letter}</span>
              </span>
            ))}
          </h1>
          <LandingScene paused={paused || reducedMotion} />
          <div className="landing-hero__intro landing-container">
            <div className="landing-hero__copy" data-intro>
              <p className="landing-eyebrow">Informasi & layanan warga</p>
              <h2>
                Kabar dan layanan
                <br />
                <em>warga Natura.</em>
              </h2>
              <p className="landing-hero__description">
                Pengumuman, jadwal ronda, jimpitan, dan kas lingkungan dalam
                satu portal.
              </p>
              <a className="landing-link" href={appUrl}>
                Masuk ke portal warga{" "}
                <span className="landing-link__arrow">
                  <ArrowUpRight
                    size={20}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
              </a>
            </div>
            <button
              type="button"
              className="landing-motion-toggle"
              disabled={reducedMotion}
              aria-pressed={paused || reducedMotion}
              onClick={() => setPaused((value) => !value)}
            >
              {reducedMotion ? "Gerakan dikurangi" : paused ? "Putar animasi" : "Jeda animasi"}
            </button>
          </div>
        </section>

        <section
          className="landing-story"
          id="tentang"
          aria-labelledby="story-title"
          data-chapter
        >
          <div className="landing-story__arch" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="landing-container">
            <div className="landing-section-meta" data-reveal>
              <span className="landing-eyebrow">01 — Tentang portal</span>
              <NaturaMark />
            </div>
            <div className="landing-story__layout">
              <div>
                <h2 id="story-title" className="landing-story__heading">
                  <span className="landing-story__line">
                    <span>Untuk warga.</span>
                  </span>
                  <span className="landing-story__line">
                    <span>Untuk petugas.</span>
                  </span>
                  <span className="landing-story__line">
                    <span>
                      <em>Untuk pengurus.</em>
                    </span>
                  </span>
                </h2>
                <p className="landing-story__description" data-reveal>
                  Portal Natura menyediakan informasi dan layanan lingkungan.
                  Warga, petugas ronda, dan pengurus mendapat akses sesuai
                  perannya.
                </p>
              </div>
              <div className="landing-story__values" data-reveal>
                <div>
                  <span>01</span>
                  <h3>Warga</h3>
                  <p>
                    Lihat pengumuman, informasi kas, dan jadwal ronda melalui
                    akun warga.
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <h3>Petugas ronda</h3>
                  <p>
                    Lihat penugasan dan catat jimpitan melalui QR rumah saat
                    bertugas.
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <h3>Pengurus</h3>
                  <p>
                    Kelola data warga, jadwal, dan laporan melalui dashboard
                    pengurus.
                  </p>
                </div>
              </div>
            </div>
            <div className="landing-story__foot" data-reveal>
              <span>Portal lingkungan Cluster Natura.</span>
              <a href="#layanan">
                Lihat layanan{" "}
                <ArrowDown size={17} strokeWidth={1.5} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section
          className="landing-services landing-container"
          id="layanan"
          aria-labelledby="services-title"
          data-chapter
        >
          <div className="landing-section-meta" data-reveal>
            <span className="landing-eyebrow">02 — Layanan warga</span>
            <span className="landing-eyebrow">
              Informasi & kegiatan lingkungan
            </span>
          </div>
          <div className="landing-services__heading" data-reveal>
            <h2 id="services-title">
              Layanan warga.
              <br />
              <em>Dalam satu portal.</em>
            </h2>
            <p>
              Akses informasi dan urus kegiatan lingkungan melalui akun warga.
            </p>
          </div>
          <div className="landing-service-grid">
            {services.map((service, index) => (
              <a
                className="landing-service"
                href={service.href}
                key={service.title}
              >
                <div className="landing-service__top">
                  <span className="landing-eyebrow">0{index + 1}</span>
                  <ArrowUpRight
                    size={20}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </div>
                <ServiceSymbol kind={service.symbol} />
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <span className="landing-service__action">
                  {service.action}
                  <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
          <p className="landing-services__note" data-reveal>
            Masuk dengan nama dan PIN akun warga untuk menggunakan layanan.
          </p>
        </section>

        <section
          className="landing-access"
          id="akses"
          aria-labelledby="access-title"
          data-chapter
        >
          <div className="landing-container">
            <div className="landing-section-meta" data-reveal>
              <span className="landing-eyebrow">03 — Akses portal</span>
              <span className="landing-eyebrow">Portal Cluster Natura</span>
            </div>
            <div className="landing-access__layout">
              <div className="landing-access__copy" data-reveal>
                <h2 id="access-title">
                  Masuk ke
                  <br />
                  <em>portal warga.</em>
                </h2>
                <p>
                  Gunakan nama dan PIN akun warga. Jika belum terdaftar, hubungi
                  pengurus lingkungan.
                </p>
                <a className="landing-access__cta" href={appUrl}>
                  <span>Buka portal warga</span>
                  <span className="landing-access__cta-arrow">
                    <ArrowUpRight
                      size={33}
                      strokeWidth={1.25}
                      aria-hidden="true"
                    />
                  </span>
                </a>
                <a className="landing-access__admin" href={adminPath()}>
                  Akses dashboard pengurus
                  <ArrowUpRight
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </a>
              </div>
              <div className="landing-access__details" data-reveal>
                <p className="landing-eyebrow">Sebelum masuk</p>
                <details>
                  <summary>
                    Belum punya akun?
                    <Plus size={20} strokeWidth={1.5} aria-hidden="true" />
                  </summary>
                  <p>
                    Hubungi pengurus lingkungan untuk mendapatkan akun warga.
                    Setelah terdaftar, kamu bisa masuk menggunakan nama dan PIN.
                  </p>
                </details>
                <details>
                  <summary>
                    Bagaimana dengan QR rumah?
                    <Plus size={20} strokeWidth={1.5} aria-hidden="true" />
                  </summary>
                  <p>
                    Informasi pada QR rumah tetap bisa dibuka tanpa login.
                    Pindai QR yang terpasang di rumah untuk melihat
                    informasinya.
                  </p>
                </details>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer landing-container">
        <div className="landing-footer__top">
          <a
            className="landing-brand"
            href="#atas"
            aria-label="Cluster Natura, kembali ke atas"
          >
            <NaturaMark className="landing-brand__mark" />
            <span>
              Cluster
              <br />
              <strong>Natura</strong>
            </span>
          </a>
          <p>
            Informasi dan layanan
            <br />
            warga Cluster Natura.
          </p>
          <a className="landing-footer__up" href="#atas">
            Kembali ke atas
            <ArrowUpRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </a>
        </div>
        <div className="landing-footer__wordmark" aria-hidden="true">
          natura
        </div>
        <div className="landing-footer__bottom">
          <span>© {new Date().getFullYear()} Cluster Natura</span>
          <span>Dikelola pengurus lingkungan.</span>
          <a href={appUrl}>
            Portal warga <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}
