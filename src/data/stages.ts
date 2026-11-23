/**
 * The stages an arena can be built on, loaded from data/stages.json.
 *
 * A stage is the entrance set - ramp, screens, curtain, whatever the GLB
 * carries - and it decides more than its own look: the floor, barricade and
 * outer bowl are modelled to meet it at specific edges, so a RAW floor inside
 * the Royal Rumble bowl leaves visible gaps. Rather than let an arena name any
 * four GLBs and hope, each stage declares the pieces that fit it, and the
 * editor offers only those.
 *
 * Imported rather than fetched, for the same reason as the arenas: `data/` sits
 * outside Vite's publicDir.
 */

import stagesFile from "../../data/stages.json";

export interface StageData {
  id: string;
  displayName: string;
  glb: string;
  floors: string[];
  barricades: string[];
  outers: string[];
  /**
   * The floor each barricade is built to stand on, keyed by barricade path.
   *
   * Barricades do not all hide the same edges: the padded wall covers the step
   * at the rim of the raised ringside mats, while the open metal barricade
   * shows straight through to whatever it stands on and needs the flat
   * concrete floor. A barricade listed here brings its floor with it - in the
   * editor, and when an arena names the barricade but no floor.
   */
  barricadeFloors?: Record<string, string>;
  /**
   * Where the stage GLB is placed, for a GLB not authored in arena space.
   *
   * Same convention as an `arenaParts` placement: a position in scene units
   * and Euler radians [x, y, z], applied to the GLB's root after it loads.
   * Floors, barricades and outers are modelled in place and take none.
   */
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Uniform scale for a stage GLB authored at a different size. */
  scale?: number;
}

/** The piece categories a stage constrains. */
export type PieceKind = "floor" | "barricade" | "outer";

const PIECE_LISTS: Record<PieceKind, keyof StageData> = {
  floor: "floors",
  barricade: "barricades",
  outer: "outers",
};

const stages: StageData[] = (stagesFile as { stages: StageData[] }).stages;
const byId = new Map(stages.map((stage) => [stage.id, stage]));

/** Every stage, in the order the file lists them. */
export function availableStages(): StageData[] {
  return stages;
}

export function stageById(id: string): StageData | null {
  return byId.get(id) ?? null;
}

/**
 * The pieces of one kind that fit a stage.
 *
 * An unknown stage yields nothing rather than everything: offering pieces that
 * are known not to fit would be worse than offering none.
 */
export function piecesFor(stageId: string, kind: PieceKind): string[] {
  const stage = byId.get(stageId);
  if (!stage) return [];
  return (stage[PIECE_LISTS[kind]] as string[]) ?? [];
}

/**
 * The piece a stage uses unless told otherwise - the first one it lists.
 *
 * Selecting a stage fills all three categories from this, so choosing "Royal
 * Rumble" is one action rather than four.
 */
export function defaultPiece(stageId: string, kind: PieceKind): string {
  return piecesFor(stageId, kind)[0] ?? "";
}

/**
 * The floor a barricade is built to stand on, or null when the stage pairs it
 * with nothing.
 *
 * A pairing that names a floor the stage does not list is ignored rather than
 * obeyed, for the same reason an unknown stage yields no pieces: handing back a
 * floor known not to fit would be worse than falling back to the default.
 */
export function floorForBarricade(
  stageId: string,
  barricade: string
): string | null {
  const floor = byId.get(stageId)?.barricadeFloors?.[barricade];
  return floor && pieceFitsStage(stageId, "floor", floor) ? floor : null;
}

/** Whether a piece is one the stage actually lists. */
export function pieceFitsStage(
  stageId: string,
  kind: PieceKind,
  glb: string
): boolean {
  return piecesFor(stageId, kind).includes(glb);
}
