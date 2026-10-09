export const HOUSING_LABEL = {
  unknown: "Belum ditentukan",
  owner: "Pemilik",
  tenant: "Penyewa",
  family: "Anggota keluarga",
  other: "Lainnya",
} as const;
export const RELATION_LABEL = {
  head: "Kepala keluarga",
  spouse: "Pasangan",
  child: "Anak",
  parent: "Orang tua",
  other: "Anggota lainnya",
} as const;
export type HousingStatus = keyof typeof HOUSING_LABEL;
export type FamilyRelation = keyof typeof RELATION_LABEL;
export const MAX_PROOF_BYTES = 750 * 1024;
export const MAX_PROOF_DATA_URL = Math.ceil(MAX_PROOF_BYTES / 3) * 4 + 64;
