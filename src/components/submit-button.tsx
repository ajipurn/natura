"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cx } from "./ui";

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
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  className?: string;
  /** Tampilkan konfirmasi sebelum mengirim form. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cx(buttonClass(variant, size), className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
