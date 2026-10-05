import { queryOptions } from "@tanstack/react-query";
import { api, call } from "@/client/api";

export const scheduleQuery = queryOptions({ queryKey: ["jadwal"], queryFn: () => call(api.jadwal.$get()) });
