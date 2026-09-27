// The Mystery Dungeon (MD) export format is byte-for-byte the same shape the game's
// analyzer produces for a Hunt (Session/Damage/Supplies/Drops/Experience/
// Enemies Defeated with identical field names) - so the Zod schema is
// reused as-is instead of being redefined here.
import { huntExportSchema, type HuntExport } from './huntValidation.js';

export const mdExportSchema = huntExportSchema;
export type MdExport = HuntExport;

export function validateMdExport(payload: unknown) {
  return mdExportSchema.safeParse(payload);
}
