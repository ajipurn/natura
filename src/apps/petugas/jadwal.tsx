import { useAuth } from "@/client/auth";
import { SchedulePage } from "@/features/jadwal/schedule-page";
import { MySchedule } from "./my-schedule";
import { canRonda } from "@/lib/permissions";

export function JadwalPetugas() {
  const user = useAuth().data?.user;
  return (
    <SchedulePage
      emptyHint="Minta admin untuk mengisinya."
      currentUserId={user?.id}
      intro={user && canRonda(user.role) && (
        <div className="mb-4">
          <MySchedule />
        </div>
      )}
    />
  );
}
