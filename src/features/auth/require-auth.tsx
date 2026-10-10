import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { errorMessage } from "@/client/api";
import { useAuth } from "@/client/auth";
import type { SessionUser } from "@/server/auth";
import { ErrorCard, LoadingCards } from "@/components/query-state";
import { Card, buttonClass, cx } from "@/components/ui";
import { adminPath, petugasPath } from "@/lib/app-paths";
import { isManager, ROLE_LABEL } from "@/lib/permissions";

/**
 * Halaman yang perlu login. Belum login → layar masuk (lalu kembali ke sini);
 * aplikasi belum disiapkan → halaman setup admin.
 */
export function RequireAuth({
  loginPath,
  adminOnly = false,
  children,
}: {
  loginPath: string;
  adminOnly?: boolean;
  children: (user: SessionUser) => ReactNode;
}) {
  const auth = useAuth();
  const location = useLocation();

  if (!auth.data) {
    if (auth.isError) return <Centered><ErrorCard message={errorMessage(auth.error)} onRetry={() => void auth.refetch()} /></Centered>;
    return <Centered><LoadingCards count={2} /></Centered>;
  }
  if (auth.data.setupNeeded) {
    return adminOnly ? (
      <Navigate to={adminPath("/setup")} replace />
    ) : (
      <Centered>
        <Card className="text-center">
          <p className="font-semibold">Aplikasi belum disiapkan</p>
          <p className="mt-1 text-sm text-muted">Admin perlu menyiapkan aplikasi dulu.</p>
          <a href={adminPath("/setup")} className={cx(buttonClass("primary"), "mt-4")}>
            Siapkan sebagai admin
          </a>
        </Card>
      </Centered>
    );
  }
  const user = auth.data.user;
  if (!user) {
    const next = location.pathname + location.search + location.hash;
    return <Navigate to={`${loginPath}?next=${encodeURIComponent(next)}`} replace />;
  }
  if (adminOnly && !isManager(user.role)) {
    return (
      <Centered>
        <Card className="text-center">
          <ShieldAlert className="mx-auto size-10 text-warn" />
          <p className="mt-2 font-semibold">Khusus pengurus</p>
          <p className="mt-1 text-sm text-muted">Peran akun {user.name}: {ROLE_LABEL[user.role]}.</p>
          <a href={petugasPath("/")} className={cx(buttonClass("primary"), "mt-4")}>
            Buka app
          </a>
        </Card>
      </Centered>
    );
  }
  return <>{children(user)}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">{children}</main>;
}
