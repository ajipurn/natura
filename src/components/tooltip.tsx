import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { useId, type ReactElement } from "react";

/** Petunjuk tombol ikon, terlihat saat hover dan fokus keyboard. */
export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  const id = useId();
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} aria-describedby={id} data-ui-tooltip={id} delay={400} />
      <BaseTooltip.Portal keepMounted>
        <BaseTooltip.Positioner sideOffset={8} className="z-70">
          <BaseTooltip.Popup
            id={id}
            role="tooltip"
            className="max-w-60 rounded-lg bg-fg px-3 py-2 text-pretty text-xs font-medium text-bg shadow-lg transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
