const numberFormat = new Intl.NumberFormat("id-ID");

/** "Rp 23.500" */
export function formatRupiah(amount: number): string {
  return `Rp ${numberFormat.format(amount)}`;
}

/** Versi ringkas untuk kotak kecil: "500", "1rb", "2,5rb". */
export function formatAmountShort(amount: number): string {
  return amount < 1000 ? numberFormat.format(amount) : `${numberFormat.format(amount / 1000)}rb`;
}
