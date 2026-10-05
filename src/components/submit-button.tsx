import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./ui";

/** Tombol kirim form (Base UI Button); tetap bisa difokus selama form diproses. */
export function SubmitButton({
  children,
  pendingText = "Menyimpan…",
  variant = "primary",
  size = "md",
  className,
  confirm,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: Parameters<typeof Button>[0]["variant"];
  size?: Parameters<typeof Button>[0]["size"];
  className?: string;
  /** Tampilkan konfirmasi sebelum mengirim form. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      focusableWhenDisabled
      className={className}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
