import { useEffect, useRef } from "react";

export function LandingScene() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;
    let requested = false;
    let dispose: (() => void) | undefined;

    const load = async () => {
      try {
        const { mountLandingScene } = await import("./landing-scene-3d");
        if (!cancelled) dispose = mountLandingScene(stage);
      } catch {
        // Ilustrasi SVG tetap tampil jika WebGL atau modul 3D tidak tersedia.
      }
    };

    // Di HP ilustrasi berada di bawah teks; Three.js dimuat saat mendekati layar.
    const observer = new IntersectionObserver((entries) => {
      if (!requested && entries.some((entry) => entry.isIntersecting)) {
        requested = true;
        observer.disconnect();
        void load();
      }
    }, { rootMargin: "120px" });
    observer.observe(stage);

    return () => {
      cancelled = true;
      observer.disconnect();
      dispose?.();
    };
  }, []);

  return (
    <div className="landing-scene rounded-[2rem] p-5 sm:p-7" aria-hidden="true">
      <div ref={stageRef} className="landing-scene__stage relative aspect-[6/5]">
        <svg viewBox="0 0 360 300" fill="none" className="landing-scene__fallback absolute inset-0 h-full w-full text-primary" focusable="false">
          <circle cx="265" cy="64" r="40" fill="currentColor" opacity=".025" />
          <circle cx="265" cy="64" r="27" fill="currentColor" opacity=".09" />
          <path d="M70 71H113M83 60H132M175 92H201" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".12" />

          <path d="M22 238C77 214 126 221 178 235C229 249 278 249 338 225V270C278 286 83 285 22 260V238Z" fill="currentColor" opacity=".04" />
          <path d="M22 238C77 214 126 221 178 235C229 249 278 249 338 225" stroke="currentColor" strokeWidth="2" opacity=".25" />
          <ellipse cx="126" cy="225" rx="59" ry="5" fill="currentColor" opacity=".045" />
          <ellipse cx="245" cy="230" rx="46" ry="4" fill="currentColor" opacity=".045" />

          <path d="M73 138L126 96L179 138V223H73V138Z" fill="var(--card)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M60 142L126 89L192 142" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M115 223V181H139V223" fill="currentColor" opacity=".12" />
          <path d="M92 148H112V166H92V148ZM141 148H161V166H141V148Z" fill="currentColor" opacity=".12" />
          <path d="M102 149V165M151 149V165" stroke="var(--card)" strokeWidth="2" />
          <circle cx="133" cy="204" r="1.5" fill="currentColor" opacity=".5" />

          <path d="M204 166L245 132L286 166V229H204V166Z" fill="var(--card)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M194 170L245 128L297 170" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M235 229V193H255V229" fill="currentColor" opacity=".12" />
          <circle cx="250" cy="214" r="1.5" fill="currentColor" opacity=".5" />

          <g>
            <path d="M44 231V173M44 199L34 185" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".7" />
            <g>
              <path d="M44 127C22 148 16 171 27 181C35 189 44 186 44 186C44 186 53 189 61 181C72 171 66 148 44 127Z" fill="currentColor" opacity=".25" />
              <path d="M44 186V153M44 172L35 164M44 165L52 158" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".3" />
            </g>
          </g>
          <g>
            <path d="M313 226V181" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".7" />
            <g>
              <path d="M313 142C293 163 289 181 299 189C305 195 313 193 313 193C313 193 321 195 327 189C337 181 333 163 313 142Z" fill="currentColor" opacity=".25" />
              <path d="M313 193V165M313 182L305 175M313 176L320 169" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".3" />
            </g>
          </g>

          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".3">
            <path d="M64 242C64 236 62 232 59 229M64 242C65 237 68 235 71 234M64 242V231" />
          </g>
          <path d="M295 244C295 239 293 236 291 234M295 244C296 240 298 239 301 237" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".2" />
          <path d="M109 254C145 249 189 254 218 263" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".2" />
        </svg>
      </div>
    </div>
  );
}
