import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { LandingSceneController } from "./landing-scene-3d";

gsap.registerPlugin(ScrollTrigger);

export function LandingScene({ paused }: { paused: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<LandingSceneController | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
    controllerRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;
    let requested = false;
    const media = gsap.matchMedia();
    const load = async () => {
      try {
        const { mountLandingScene } = await import("./landing-scene-3d");
        if (cancelled) return;
        const controller = mountLandingScene(stage, pausedRef.current);
        controllerRef.current = controller;
        media.add("(prefers-reduced-motion: no-preference)", () => {
          const pose = { progress: 0 };
          gsap.to(pose, {
            progress: 1,
            ease: "none",
            onUpdate: () => controller.setProgress(pose.progress),
            scrollTrigger: { trigger: stage.closest(".landing-hero"), start: "top top", end: "bottom top", scrub: 0.8 },
          });
        });
      } catch {
        // Geometri CSS dan seluruh konten tetap tersedia jika WebGL gagal dimuat.
      }
    };
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
      media.revert();
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  return (
    <div className="landing-scene" aria-hidden="true">
      <div ref={stageRef} className="landing-scene__stage">
        <div className="landing-scene__fallback">
          <span className="landing-fallback-arch" />
          <span className="landing-fallback-arch" />
          <span className="landing-fallback-arch" />
          <span className="landing-fallback-ground" />
        </div>
      </div>
    </div>
  );
}
