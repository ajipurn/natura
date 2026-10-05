const numberFormat = new Intl.NumberFormat("id-ID");

/** "Rp 23.500" */
export function formatRupiah(amount: number): string {
  return `Rp ${numberFormat.format(amount)}`;
}

/** Versi ringkas untuk kotak kecil: "500", "1rb", "2,5rb". */
export function formatAmountShort(amount: number): string {
  return amount < 1000 ? numberFormat.format(amount) : `${numberFormat.format(amount / 1000)}rb`;
}

/** Nomor untuk wa.me: hanya angka, 0 di depan diganti 62. "0812-3456 7890" → "6281234567890" */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

/** Nomor untuk tautan tel:, hanya angka dan +. */
export function phoneDigits(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}
