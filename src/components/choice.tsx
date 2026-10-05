import { Checkbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Switch } from "@base-ui/react/switch";
import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { cx } from "./ui";

/**
 * Kontrol Base UI tidak ikut kembali ke nilai awalnya saat form-nya di-reset (React mereset form
 * sesudah aksi form selesai). Kunci ini berganti saat itu, jadi kontrolnya dipasang ulang dan
 * tampilannya sama dengan nilai yang akan terkirim.
 */
function useFormResetKey(ref: RefObject<HTMLElement | null>) {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onReset = () => setKey((k) => k + 1);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [ref]);
  return key;
}

/**
 * Sakelar nyala/mati dalam kotak berlabel (Base UI Switch). Terkontrol (`checked`) atau tidak
 * (`defaultChecked` + `name`, nilainya "on" saat form dikirim).
 */
export function SwitchField({
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  name,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const resetKey = useFormResetKey(ref);
  return (
    <Field.Root
      ref={ref}
      disabled={disabled}
      className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 data-disabled:opacity-60"
    >
      <div className="min-w-0">
        <Field.Label className="block text-sm font-medium">{label}</Field.Label>
        {description && <Field.Description className="block text-xs text-muted">{description}</Field.Description>}
      </div>
      <Switch.Root
        key={resetKey}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        name={name}
        className="relative flex h-6 w-10 shrink-0 items-center rounded-full bg-idle-soft p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-checked:bg-primary"
      >
        <Switch.Thumb className="size-5 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-4 motion-reduce:transition-none" />
      </Switch.Root>
    </Field.Root>
  );
}

/** Kotak centang berlabel (Base UI Checkbox). Dengan `name`, nilainya "on" saat form dikirim. */
export function CheckboxField({
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  name,
  disabled,
  className,
}: {
  label: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const resetKey = useFormResetKey(ref);
  return (
    <Field.Root ref={ref} disabled={disabled} className={className}>
      <Field.Label className="flex cursor-pointer items-start gap-2 text-sm data-disabled:opacity-60">
        <Checkbox.Root
          key={resetKey}
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={onCheckedChange}
          name={name}
          className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-md border border-line bg-card text-primary-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-checked:border-primary data-checked:bg-primary"
        >
          <Checkbox.Indicator>
            <Check className="size-3.5" strokeWidth={3} />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span>{label}</span>
      </Field.Label>
    </Field.Root>
  );
}

export type RadioCardOption<T extends string> = { value: T; label: ReactNode; hint?: ReactNode };

/**
 * Satu pilihan dari beberapa kartu (Base UI RadioGroup), mis. status rumah atau peran akun.
 * Panah kiri/kanan berpindah pilihan.
 */
export function RadioCards<T extends string>({
  legend,
  value,
  onValueChange,
  options,
  disabled,
  className,
}: {
  legend: ReactNode;
  value: T;
  onValueChange: (value: T) => void;
  options: RadioCardOption<T>[];
  disabled?: boolean;
  className?: string;
}) {
  const legendId = useId();
  return (
    <div>
      <div id={legendId} className="mb-1.5 text-sm font-medium">
        {legend}
      </div>
      <RadioGroup
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        disabled={disabled}
        aria-labelledby={legendId}
        className={cx("grid grid-cols-2 gap-2", className)}
      >
        {options.map((o) => (
          <Radio.Root
            key={o.value}
            value={o.value}
            // Label = nama pilihan, keterangan = deskripsinya (tidak digabung jadi satu kalimat).
            aria-labelledby={`${legendId}-${o.value}`}
            aria-describedby={o.hint ? `${legendId}-${o.value}-hint` : undefined}
            className="group flex cursor-pointer flex-col rounded-xl border border-line bg-card px-3 py-2.5 text-left transition hover:bg-idle-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 data-checked:border-primary data-checked:bg-primary/10 data-checked:hover:bg-primary/10 data-disabled:cursor-default data-disabled:opacity-60"
          >
            <span id={`${legendId}-${o.value}`} className="text-sm font-semibold group-data-checked:text-primary">
              {o.label}
            </span>
            {o.hint && (
              <span id={`${legendId}-${o.value}-hint`} className="text-xs text-muted">
                {o.hint}
              </span>
            )}
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  );
}
