import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "@/client/auth";
import { SchedulePage } from "@/features/jadwal/schedule-page";
import { MySchedule } from "./my-schedule";
import { canRonda } from "@/lib/permissions";
import { petugasPath } from "@/lib/app-paths";
import { SectionTitle } from "@/components/ui";

export function JadwalPetugas() {
  const user = useAuth().data?.user;
  return (
    <>
      <Link
        to={petugasPath("/akun")}
        className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke Akun
      </Link>
      <SchedulePage
        emptyHint="Minta admin untuk mengisinya."
        currentUserId={user?.id}
        intro={user && canRonda(user.role) && (
          <div className="mb-4">
            <SectionTitle>Jadwal jagamu</SectionTitle>
            <MySchedule />
          </div>
        )}
      />
    </>
  );
}
