/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Rules } from "./icpDefinition.mjs";
export function statusPatch(c: Record<string, any>, rules?: Rules): { status: string; patch: Record<string, any> };
export function applyRevenueResult(db: any, c: Record<string, any>, r: Record<string, any>): Promise<Record<string, any>>;
