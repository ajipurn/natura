import { useQuery } from "@tanstack/react-query";
import { Printer, TriangleAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { QrSvg } from "@/components/qr-svg";
import { QueryState } from "@/components/query-state";
import { PageHeader, buttonClass, cx } from "@/components/ui";
import { compareHouses } from "@/lib/houses";
import { houseUrl } from "@/lib/qr";
import { housesQuery } from "../queries";

export function CetakPage() {
  const query = useQuery(housesQuery);
  const [params] = useSearchParams();

  return (
    <QueryState query={query}>
      {({ houses: allHouses, communityName, origin, fromEnv }) => {
        const blocks = [...new Set(allHouses.map((h) => h.block))];
        const blok = params.get("blok");
        const selected = blok && blocks.includes(blok) ? blok : null;
        const houses = (selected ? allHouses.filter((h) => h.block === selected) : allHouses).sort(compareHouses);
        const isLocal = /\/\/(localhost|127\.|192\.168\.|10\.)/.test(origin);

        return (
          <>
            <style>{`@page { size: A4; margin: 10mm; }`}</style>
            <div className="print:hidden">
              <PageHeader
                title="Cetak stiker QR"
                subtitle={`${houses.length} stiker`}
                action={
                  <button type="button" onClick={() => window.print()} className={buttonClass("primary", "sm")}>
                    <Printer className="size-4" /> Cetak
                  </button>
                }
              />

              <div className="mb-4 flex flex-wrap gap-2">
                <BlockChip to="/admin/rumah/cetak" active={!selected} label="Semua blok" />
                {blocks.map((b) => (
                  <BlockChip key={b} to={`/admin/rumah/cetak?blok=${encodeURIComponent(b)}`} active={selected === b} label={`Blok ${b}`} />
                ))}
              </div>

              <p className="text-sm text-muted">
                QR berisi alamat <code className="rounded bg-idle-soft px-1">{origin}/r/…</code>
              </p>
              {(isLocal || !fromEnv) && (
                <p className="mt-2 flex gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
                  <TriangleAlert className="size-5 shrink-0" />
                  <span>
                    {isLocal
                      ? "Alamat ini hanya bisa dibuka di jaringan lokal. Cetak dari alamat publik aplikasi, atau isi APP_URL."
                      : "Pastikan alamat di atas adalah alamat tetap aplikasi (isi APP_URL supaya pasti). Stiker yang sudah ditempel tidak bisa diubah."}
                  </span>
                </p>
              )}
              <p className="mb-6 mt-2 text-sm text-muted">
                Saran: cetak di kertas stiker vinyl atau laminasi supaya tahan hujan. Tempel dekat wadah jimpitan.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 print:grid-cols-3 print:gap-0">
              {houses.map((house) => (
                <div
                  key={house.id}
                  className="flex break-inside-avoid flex-col items-center rounded-2xl border border-line bg-white p-4 text-center text-black print:h-[68mm] print:justify-center print:rounded-none print:border-dashed print:border-gray-400 print:p-[4mm]"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Jimpitan {communityName}</p>
                  <QrSvg text={houseUrl(origin, house.token)} className="my-2 w-full max-w-44 print:w-[42mm] print:max-w-none" />
                  <p className="text-2xl font-black leading-tight">
                    Blok {house.block} · No. {house.number}
                  </p>
                  <p className="text-[10px] text-gray-500">Scan untuk lihat riwayat jimpitan</p>
                </div>
              ))}
            </div>
          </>
        );
      }}
    </QueryState>
  );
}

function BlockChip({ to, active, label }: { to: string; active: boolean; label: string }) {
  return (
    <Link
      to={to}
      className={cx(
        "rounded-full border px-3 py-1 text-sm",
        active ? "border-primary bg-primary text-primary-fg" : "border-line text-muted",
      )}
    >
      {label}
    </Link>
  );
}
