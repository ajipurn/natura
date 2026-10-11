import { TextMorph } from "torph/react";
import { cx } from "@/components/ui";

/** Nominal dan statistik bergulir hanya ketika nilainya berubah. */
export function NumberTicker({ value, className }: { value: number | string; className?: string }) {
  const classes = cx("number-ticker tabular-nums", className);
  const text = typeof value === "number" ? value.toLocaleString("id-ID") : value;
  const suffix = /^[\d.,]+rb$/.test(text) ? "rb" : "";
  const digits = suffix ? text.slice(0, -suffix.length) : text;
  const canAnimate = typeof Element !== "undefined" && typeof Element.prototype.animate === "function" && typeof Element.prototype.getAnimations === "function";
  // WebView lama tetap menampilkan nilai utuh tanpa memerlukan Web Animations API.
  if (!canAnimate) {
    return <span className={classes}>{text}</span>;
  }
  return (
    <span className={classes}>
      {/* Pembaca layar menerima nilai tujuan langsung selama animasi. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        <TextMorph
          className="number-ticker-visual"
          locale="id-ID"
          numbers
          duration={600}
          ease="cubic-bezier(0.19, 1, 0.22, 1)"
          scale={false}
          respectReducedMotion
        >
          {digits}
        </TextMorph>
        {suffix}
      </span>
    </span>
  );
}
