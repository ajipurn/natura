import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "lg" | "sm" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
    size === "lg" && "h-14 px-6 text-lg",
    size === "md" && "h-11 px-4 text-base",
    size === "sm" && "h-9 px-3 text-sm",
    variant === "primary" && "bg-primary text-primary-fg shadow-sm",
    variant === "secondary" && "border border-line bg-card text-fg",
    variant === "danger" && "border border-empty/40 bg-empty-soft text-empty",
    variant === "ghost" && "text-muted hover:text-fg",
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-fg placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

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

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
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
