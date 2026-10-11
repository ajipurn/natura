import type { ReactNode } from "react";
import { RondaStoreContext } from "./ronda-store";
import { useRondaStoreState } from "./use-ronda-store";

/** Satu antrean bersama untuk tombol scan dan halaman Ronda. */
export function RondaStoreProvider({ userId, enabled, children }: { userId: number; enabled: boolean; children: ReactNode }) {
  const store = useRondaStoreState(userId, enabled);
  return <RondaStoreContext.Provider value={store}>{children}</RondaStoreContext.Provider>;
}
