import { useAuth } from "@/client/auth";
import { SchedulePage } from "@/features/jadwal/schedule-page";
import { MySchedule } from "./my-schedule";

export function JadwalPetugas() {
  const user = useAuth().data?.user;
  return (
    <SchedulePage
      emptyHint="Minta admin untuk mengisinya."
      currentUserId={user?.id}
      intro={
        <div className="mb-4">
          <MySchedule />
        </div>
      }
    />
  );
}
