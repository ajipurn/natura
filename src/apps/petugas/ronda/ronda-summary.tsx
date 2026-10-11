import { useQuery } from "@tanstack/react-query";
import { api, call } from "@/client/api";
import { QueryState } from "@/components/query-state";
import { PageTitle } from "@/components/ui";
import { PatrolSummary } from "@/features/riwayat/patrol-detail";
import { TonightGuards } from "./tonight-guards";

/** Ringkasan untuk warga; tanggal malam dan petugasnya mengikuti data server. */
export function RondaSummary() {
  const info = useQuery({
    queryKey: ["warga", "info"],
    queryFn: () => call(api.warga.$get()),
    refetchInterval: 60_000,
  });

  return (
    <main>
      <PageTitle title="Ronda" />
      <QueryState query={info}>
        {({ date, schedule }) => (
          <PatrolSummary
            date={date}
            intro={<TonightGuards schedule={schedule} date={date} />}
          />
        )}
      </QueryState>
    </main>
  );
}
