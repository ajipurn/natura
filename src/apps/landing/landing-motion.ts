import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(ScrollTrigger, CustomEase);

export function mountLandingMotion(page: HTMLElement): () => void {
  const curve = getComputedStyle(page).getPropertyValue("--ease-out").trim();
  const ease = CustomEase.create("natura-out", curve.startsWith("cubic-bezier(") ? curve.slice(13, -1) : "0.23,1,0.32,1");
  const context = gsap.context(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.timeline({ defaults: { ease } })
        .from(".landing-masthead__letter", { yPercent: 105, rotate: 4, duration: 1.25, stagger: 0.055 })
        .from("[data-intro]", { y: 24, opacity: 0, duration: 0.85, stagger: 0.1 }, 0.35);

      for (const section of page.querySelectorAll<HTMLElement>("[data-chapter]")) {
        gsap.from(section.querySelectorAll("[data-reveal]"), {
          y: 42, opacity: 0, duration: 0.95, stagger: 0.1, ease,
          scrollTrigger: { trigger: section, start: "top 78%", once: true },
        });
      }
      gsap.from(".landing-story__line > span", {
        yPercent: 105, rotate: 2, duration: 1.1, stagger: 0.12, ease,
        scrollTrigger: { trigger: ".landing-story__heading", start: "top 85%", once: true },
      });
      gsap.from(".landing-service", {
        y: 48, opacity: 0, duration: 0.95, stagger: 0.11, ease,
        scrollTrigger: { trigger: ".landing-service-grid", start: "top 80%", once: true },
      });
      gsap.to(".landing-story__arch", {
        y: -60, ease: "none",
        scrollTrigger: { trigger: ".landing-story", start: "top bottom", end: "bottom top", scrub: 0.8 },
      });
    }, page);
    return () => media.revert();
  }, page);
  return () => context.revert();
}
