// Server-owned world-progress state: farming patches, hunter snares, agility cooldowns.
// Stored in the owned save document (farmPatches, snares, trainCd).

import type { AuthState } from './state';

export interface FarmPatch {
  stage: 'raked' | 'seedling' | 'grown';
  seed?: string;
  produce?: string;
  plantedAt?: number;
}

export interface SnareState {
  laidAt: number;
  catchAt: number;
}

function tileKey(x: number, y: number): string {
  return `${Math.floor(x)},${Math.floor(y)}`;
}

function patchMap(state: AuthState): Record<string, FarmPatch> {
  const fp = state.farmPatches;
  return fp && typeof fp === 'object' ? fp as Record<string, FarmPatch> : {};
}

export function getFarmPatch(state: AuthState, x: number, y: number): FarmPatch | undefined {
  return patchMap(state)[tileKey(x, y)];
}

export function setFarmPatch(state: AuthState, x: number, y: number, patch: FarmPatch | null): void {
  const k = tileKey(x, y);
  const map = { ...patchMap(state) };
  if (patch === null) delete map[k];
  else map[k] = patch;
  state.farmPatches = map;
}

function snareMap(state: AuthState): Record<string, SnareState> {
  const s = state.snares;
  return s && typeof s === 'object' ? s as Record<string, SnareState> : {};
}

export function getSnare(state: AuthState, x: number, y: number): SnareState | undefined {
  return snareMap(state)[tileKey(x, y)];
}

export function setSnare(state: AuthState, x: number, y: number, snare: SnareState | null): void {
  const k = tileKey(x, y);
  const map = { ...snareMap(state) };
  if (snare === null) delete map[k];
  else map[k] = snare;
  state.snares = map;
}

function cdMap(state: AuthState): Record<string, number> {
  const t = state.trainCd;
  return t && typeof t === 'object' ? t as Record<string, number> : {};
}

export function getTrainCd(state: AuthState, key: string): number {
  return cdMap(state)[key] ?? 0;
}

export function setTrainCd(state: AuthState, key: string, tick: number): void {
  state.trainCd = { ...cdMap(state), [key]: tick };
}
