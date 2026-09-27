import { z } from 'zod';

const itemLineSchema = z.object({
  Item: z.string(),
  'Total price': z.number(),
  Ignored: z.union([z.boolean(), z.null()]).optional(),
  Count: z.number(),
  Player: z.string(),
  'Unit price': z.number(),
});

const damageLineSchema = z.object({
  Enemy: z.string(),
  'Damage dealt': z.number(),
  Element: z.string(),
  'Damage taken': z.number(),
  Player: z.string(),
});

const experienceLineSchema = z.object({
  Player: z.string(),
  Experience: z.number(),
});

const enemyDefeatedLineSchema = z.object({
  Enemy: z.string(),
  Ignored: z.union([z.boolean(), z.null()]).optional(),
  Count: z.number(),
  Rare: z.boolean(),
  Player: z.string(),
});

const sessionSchema = z.object({
  'Duration seconds': z.number(),
  'Supplies per hour': z.number(),
  Duration: z.string(),
  'Damage taken': z.number(),
  'Rare kills': z.number(),
  'Damage dealt': z.number(),
  'Rare kills per hour': z.number(),
  'Experience per hour': z.number(),
  'Damage dealt per second': z.number(),
  'Damage taken per second': z.number(),
  // The analyzer emits null here (instead of 0) when Kills is 0.
  'Kills per hour': z.number().nullable().transform((v) => v ?? 0),
  'Time to next level': z.string().nullable().optional(),
  'Paused seconds': z.number().optional().default(0),
  'Raw gains': z.number(),
  Experience: z.number(),
  Kills: z.number(),
  Status: z.string().optional(),
  'Raw gains per hour': z.number(),
  'Profit per hour': z.number(),
  'Session type': z.enum(['player', 'party']),
  Supplies: z.number(),
  'Session ID': z.number().optional(),
  'Time to next level seconds': z.number().nullable().optional(),
  Profit: z.number(),
  Start: z.string(),
});

export const huntExportSchema = z.object({
  Damage: z.array(damageLineSchema).default([]),
  Supplies: z.array(itemLineSchema).default([]),
  Session: sessionSchema,
  Drops: z.array(itemLineSchema).default([]),
  Experience: z.array(experienceLineSchema).default([]),
  // The analyzer emits {} (instead of []) when there are no entries.
  'Enemies Defeated': z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(enemyDefeatedLineSchema)
  ),
});

export type HuntExport = z.infer<typeof huntExportSchema>;

export function validateHuntExport(payload: unknown) {
  return huntExportSchema.safeParse(payload);
}
