import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useRef, type ComponentProps, type ReactNode } from "react";
import { ScrollArea } from "./scroll-area";
import { Button, cx } from "./ui";

/**
 * Dialog modal (Base UI Dialog): fokus terkunci di dalam, Esc atau klik di luar menutup. Di HP tampil
 * sebagai lembar dari bawah. Isinya hanya dirender saat terbuka, jadi form selalu mulai bersih.
 * Fokus awal: elemen bertanda `data-autofocus`, atau elemen pertama yang bisa difokus. Di layar
 * sentuh dialognya sendiri yang difokus supaya keyboard tidak langsung muncul.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  finalFocus,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Tombol-tombol di bawah, tetap terlihat walau isinya digulir. */
  footer?: ReactNode;
  /** Tujuan fokus saat ditutup, misalnya tombol baris yang baru dipindahkan. */
  finalFocus?: ComponentProps<typeof BaseDialog.Popup>["finalFocus"];
  className?: string;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 max-sm:w-dvw bg-black/45 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <BaseDialog.Popup
          ref={popupRef}
          finalFocus={finalFocus}
          initialFocus={(type) =>
            type === "touch" ? true : (popupRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? true)
          }
          className={cx(
            "fixed z-50 flex max-h-[92dvh] w-full min-w-0 max-w-full flex-col overflow-hidden bg-card text-fg shadow-2xl outline-none transition duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
            // HP: lembar dari bawah yang meluncur naik.
            "inset-x-0 bottom-0 max-sm:w-dvw max-sm:max-w-dvw rounded-t-3xl max-sm:data-ending-style:translate-y-full max-sm:data-starting-style:translate-y-full",
            // Layar lebar: kotak di tengah.
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-ending-style:scale-95 sm:data-starting-style:scale-95",
            className,
          )}
        >
          <header className="relative border-b border-line px-5 pb-4 pt-5">
            <div className="min-w-0 pe-12">
              <BaseDialog.Title className="text-lg font-bold">{title}</BaseDialog.Title>
              {description && <BaseDialog.Description className="mt-0.5 text-sm text-muted">{description}</BaseDialog.Description>}
            </div>
            <BaseDialog.Close render={<Button variant="ghost" size="icon" className="absolute end-3 top-3 size-11" />} aria-label="Tutup">
              <X className="size-5" aria-hidden />
            </BaseDialog.Close>
          </header>
          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="min-w-0 px-5 py-4">{children}</div>
          </ScrollArea>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
              {footer}
            </footer>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
