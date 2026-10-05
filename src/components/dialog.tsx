import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * Dialog modal (elemen <dialog> bawaan browser: fokus terkunci di dalam, Esc menutup).
 * Di HP tampil sebagai lembar dari bawah. Isinya hanya dirender saat terbuka, jadi form selalu mulai bersih.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Tombol-tombol di bawah, tetap terlihat walau isinya digulir. */
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // Klik di luar kotak dialog (di latar gelap) menutup dialog.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cx(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none flex-col overflow-hidden rounded-t-3xl bg-card p-0 text-fg shadow-2xl backdrop:bg-black/45 open:flex",
        "sm:m-auto sm:max-h-[85dvh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl",
        className,
      )}
    >
      {open && (
        <>
          <header className="flex items-start gap-3 border-b border-line px-5 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-bold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-idle-soft"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
              {footer}
            </footer>
          )}
        </>
      )}
    </dialog>
  );
}
