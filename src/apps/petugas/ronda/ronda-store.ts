import { createContext, useContext } from "react";
import type { useRondaStoreState } from "./use-ronda-store";

export const RondaStoreContext = createContext<ReturnType<typeof useRondaStoreState> | null>(null);

export function useOptionalRondaStore() {
  return useContext(RondaStoreContext);
}

export function useRondaStore() {
  const store = useOptionalRondaStore();
  if (!store) throw new Error("RondaStoreProvider diperlukan untuk pencatatan.");
  return store;
}
