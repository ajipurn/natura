import { Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { buttonClass, cx } from "./ui";

/** Bagikan teks rekap ke WhatsApp (atau aplikasi lain lewat menu bagikan HP). */
export function ShareRecap({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Salin teks rekap:", text);
    }
  }

  return (
    <div className={cx("flex gap-2", className)}>
      <button type="button" onClick={share} className={cx(buttonClass("secondary"), "flex-1")}>
        <Share2 className="size-5" /> Bagikan rekap
      </button>
      <button type="button" onClick={copy} className={buttonClass("secondary")} aria-label="Salin teks rekap">
        <Copy className="size-5" />
        <span className="sr-only sm:not-sr-only">{copied ? "Tersalin" : "Salin"}</span>
      </button>
      {copied && (
        <span role="status" className="sr-only">
          Teks rekap tersalin
        </span>
      )}
    </div>
  );
}
