import type { UseQueryResult } from "@tanstack/react-query";
import { CloudOff, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "@/client/api";
import { Button, Card } from "./ui";

/**
 * Tampilkan data query; selama memuat pertama kali tampil kerangka, kalau gagal tampil pesan
 * dan tombol coba lagi. Data lama tetap tampil saat diperbarui di belakang layar.
 */
export function QueryState<T>({
  query,
  children,
  loading,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) return <ErrorCard message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return <>{loading ?? <LoadingCards />}</>;
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="text-center">
      <CloudOff className="mx-auto size-10 text-muted" />
      <p className="mt-2 font-semibold">Gagal memuat</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary" className="mt-4">
          <RefreshCw className="size-5" /> Coba lagi
        </Button>
      )}
    </Card>
  );
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">Memuat…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="animate-pulse rounded-2xl border border-line bg-card p-4">
          <div className="h-5 w-2/5 rounded bg-line" />
          <div className="mt-3 h-4 w-full rounded bg-line" />
          <div className="mt-2 h-4 w-3/4 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}
