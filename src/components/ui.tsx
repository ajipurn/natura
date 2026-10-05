import { Button as BaseButton } from "@base-ui/react/button";
import { Field as BaseField } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** Gabung kelas Tailwind. Kelas yang bertabrakan diselesaikan oleh yang belakangan (tailwind-merge), jadi `className` dari pemanggil menang. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
/** `icon`/`icon-sm` = tombol persegi berisi ikon saja (wajib `aria-label`). */
type ButtonSize = "md" | "lg" | "sm" | "icon" | "icon-sm";

/**
 * Tampilan tombol. Untuk tombol pakai `Button`; kelas ini untuk `<Link>`/`<a>` yang tampil seperti
 * tombol (Base UI tidak merender tautan sebagai Button supaya semantik tautannya tetap).
 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  const icon = size === "icon" || size === "icon-sm";
  return cx(
    "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
    size === "lg" && "h-14 px-6 text-lg",
    size === "md" && "h-11 px-4 text-base",
    size === "sm" && "h-9 px-3 text-sm",
    size === "icon" && "size-10 shrink-0 rounded-lg",
    size === "icon-sm" && "size-8 shrink-0 rounded-lg",
    variant === "primary" && "bg-primary text-primary-fg shadow-sm",
    variant === "secondary" && "border border-line bg-card text-fg",
    variant === "danger" && "border border-empty/40 bg-empty-soft text-empty",
    variant === "ghost" && "text-muted hover:text-fg",
    variant === "ghost" && icon && "hover:bg-idle-soft",
  );
}

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
  /** `plain` = tanpa tampilan bawaan, hanya `className` (untuk kartu/sel yang bisa diketuk). */
  variant?: ButtonVariant | "plain";
  size?: ButtonSize;
  className?: string;
};

/** Tombol (Base UI Button). Untuk mengirim form tulis `type="submit"`; bawaannya `type="button"`. */
export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <BaseButton className={variant === "plain" ? className : cx(buttonClass(variant, size), className)} {...props} />;
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-fg placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50";

/** Kolom isian (Base UI Input). Di dalam `Field`, label dan keterangannya otomatis tersambung. */
export function Input({ className, ...props }: Omit<ComponentProps<typeof BaseInput>, "className"> & { className?: string }) {
  return <BaseInput className={cx(inputClass, className)} {...props} />;
}

/** Isian beberapa baris (Base UI Field.Control sebagai `<textarea>`). */
export function Textarea({ className, ...props }: Omit<ComponentProps<"textarea">, "className"> & { className?: string }) {
  return <BaseField.Control render={<textarea {...props} />} className={cx(inputClass, "h-auto py-2", className)} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl border border-line bg-card p-4", className)} {...props} />;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <PageTitle title={title} />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Label + kontrol + keterangan (Base UI Field). Kontrolnya harus kontrol Base UI (`Input`,
 * `Textarea`, `NumberField`, `Switch`, `Checkbox`) supaya label dan keterangan tersambung.
 */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseField.Root className={cx("block", className)}>
      <BaseField.Label className="mb-1 block text-sm font-medium">{label}</BaseField.Label>
      {children}
      {hint && <BaseField.Description className="mt-1 block text-xs text-muted">{hint}</BaseField.Description>}
    </BaseField.Root>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-xl px-3 py-2 text-sm",
        tone === "error" && "bg-empty-soft text-empty",
        tone === "success" && "bg-filled-soft text-filled",
        tone === "info" && "bg-warn-soft text-warn",
      )}
    >
      {children}
    </p>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>;
}

/** Judul tab browser (React memindahkan <title> ke <head>). */
export function PageTitle({ title }: { title: string }) {
  return <title>{`${title} · Jimpitan`}</title>;
}
