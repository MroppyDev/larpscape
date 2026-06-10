// Static types inferred from the shared zod schemas (single source of truth).
import { z } from 'zod';
import {
  ItemDefSchema, NpcDefSchema, ObjDefSchema, SkillObjSchema,
  RecipesSchema, ShopsSchema, MagicSchema, SpawnsSchema,
} from '../../../../shared/schema';

export type ItemDef = z.infer<typeof ItemDefSchema>;
export type NpcDef = z.infer<typeof NpcDefSchema>;
export type ObjDef = z.infer<typeof ObjDefSchema>;
export type SkillObj = z.infer<typeof SkillObjSchema>;
export type RecipesFile = z.infer<typeof RecipesSchema>;
export type ShopsFile = z.infer<typeof ShopsSchema>;
export type MagicFile = z.infer<typeof MagicSchema>;
export type SpawnsFile = z.infer<typeof SpawnsSchema>;

export type ItemsFile = Record<string, ItemDef>;
export type NpcsFile = Record<string, NpcDef>;
export interface ObjectsFile {
  objs: Record<string, ObjDef>;
  skillObjs: Record<string, SkillObj>;
}
