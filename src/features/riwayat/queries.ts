import { queryOptions } from "@tanstack/react-query";
import { api, call } from "@/client/api";

export const patrolsQuery = queryOptions({
  queryKey: ["riwayat"],
  queryFn: () => call(api.riwayat.$get()),
});

export const patrolQuery = (date: string) =>
  queryOptions({
    queryKey: ["riwayat", date],
    queryFn: () => call(api.riwayat[":date"].$get({ param: { date } })),
  });
