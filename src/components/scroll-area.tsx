import { OverlayScrollbarsComponent, type OverlayScrollbarsComponentProps } from "overlayscrollbars-react";
import type { ElementType } from "react";

/**
 * Wadah scroll dengan scrollbar aplikasi (OverlayScrollbars, lihat src/client/scrollbars.ts).
 * `className` untuk wadahnya: ukuran, plus kelas `overflow-*` sebagai cadangan di HP (di sana
 * scrollbar bawaan yang dipakai). Isinya dibungkus elemen dari OverlayScrollbars yang paddingnya
 * dinolkan, jadi padding/flex/role taruh di elemen anak.
 */
export function ScrollArea<T extends ElementType = "div">(props: OverlayScrollbarsComponentProps<T>) {
  return <OverlayScrollbarsComponent defer {...props} />;
}
