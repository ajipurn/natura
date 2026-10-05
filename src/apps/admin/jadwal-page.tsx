import { useQuery } from "@tanstack/react-query";
import { Collapsible } from "@/components/collapsible";
import { ScheduleImportForm } from "@/features/jadwal/import-form";
import { SchedulePage } from "@/features/jadwal/schedule-page";
import { houseKey } from "@/lib/site-plan";
import { housesQuery } from "./queries";

export function JadwalPage() {
  const houses = useQuery(housesQuery);
  return (
    <SchedulePage
      emptyHint="Tempel jadwal di bagian Impor jadwal di atas."
      admin={(hasSchedule) => (
        <Collapsible className="mb-4" title={hasSchedule ? "Impor ulang jadwal" : "Impor jadwal"} defaultOpen={!hasSchedule}>
          <ScheduleImportForm houseKeys={(houses.data?.houses ?? []).map(houseKey)} hasSchedule={hasSchedule} />
        </Collapsible>
      )}
    />
  );
}
