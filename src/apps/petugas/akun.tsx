import { useMutation } from "@tanstack/react-query";
import { LayoutDashboard, LogOut, Smartphone } from "lucide-react";
import { useNavigate } from "react-router";
import { api, call } from "@/client/api";
import { useAuth } from "@/client/auth";
import { clearCache } from "@/client/query";
import { ChangePinForm } from "@/features/auth/change-pin-form";
import { MySchedule } from "./my-schedule";
import { Button, Card, PageHeader, SectionTitle } from "@/components/ui";

export function AkunPage() {
  const user = useAuth().data?.user;
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => call(api.auth.logout.$post()),
    onSuccess: () => {
      clearCache();
      try {
        localStorage.removeItem("jimpitan:auth");
      } catch {}
      navigate("/petugas/masuk", { replace: true });
    },
  });
  if (!user) return null;

  return (
    <>
      <PageHeader title={user.name} subtitle={user.role === "admin" ? "Admin" : "Petugas ronda"} />

      {user.role === "admin" && (
        <a
          href="/admin/"
          className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 font-medium active:bg-idle-soft"
        >
          <LayoutDashboard className="size-5 text-primary" />
          <span className="flex-1">Buka dashboard admin</span>
        </a>
      )}

      <SectionTitle>Jadwal jagamu</SectionTitle>
      <MySchedule />

      <SectionTitle>Pasang di layar utama</SectionTitle>
      <Card className="flex gap-3 text-sm">
        <Smartphone className="size-5 shrink-0 text-primary" />
        <p>
          Supaya terasa seperti aplikasi dan bisa dibuka offline: buka menu browser lalu pilih{" "}
          <strong>Tambahkan ke layar utama</strong> (Chrome) atau <strong>Bagikan → Tambah ke Layar Utama</strong>{" "}
          (Safari).
        </p>
      </Card>

      <SectionTitle>Ganti PIN</SectionTitle>
      <Card>
        <ChangePinForm />
      </Card>

      <Button variant="danger" disabled={logout.isPending} onClick={() => logout.mutate()} className="mt-6 w-full">
        <LogOut className="size-5" /> {logout.isPending ? "Keluar…" : "Keluar"}
      </Button>
      {logout.isError && <p className="mt-2 text-center text-sm text-empty">{logout.error.message}</p>}
    </>
  );
}
