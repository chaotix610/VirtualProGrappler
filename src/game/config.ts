/**
 * Central configuration for the game: animation clip names, the playable
 * character roster, and the movement tuning constants.
 */

/**
 * Names of the animation clips as they are exported from Blender onto each
 * character rig. These must match the Blender export exactly.
 */
export const Anim = {
  IDLE: "Idle_Loop",
  WALK: "Walk_Loop",
  RUN: "Sprint_Loop",
  JUMP_START: "Jump_Start",
  JUMP_LOOP: "Jump_Loop",
  JUMP_LAND: "Jump_Land",
  PUNCH: "Punch_Cross",
  // The Quaternius library ships no kick clip. Sword_Attack stands in as a
  // placeholder: swap this single value once a real kick is authored.
  KICK: "Sword_Attack",
  ROLL: "Roll",
  /**
   * Played during the beat against the ropes. The wrestler has turned so his
   * back takes them, and this clip throws the torso backwards - which reads
   * as absorbing the ropes before they throw him off.
   */
  ROPE_HIT: "Hit_Chest",
  /** Scaling the corner to the top turnbuckle. */
  CLIMB: "ClimbUp_1m",
  /** Crouched on the top rope, waiting. */
  PERCH: "Crouch_Idle_Loop",
  /** Launching off the top rope, flying, and landing. */
  DIVE_START: "NinjaJump_Start",
  DIVE_AIR: "NinjaJump_Idle_Loop",
  DIVE_LAND: "NinjaJump_Land",
  // A real block, from the second animation library. Played once and held on
  // its final frame for as long as the guard key is down.
  BLOCK: "Sword_Block",
} as const;

/** Every clip the game needs baked into each character GLB. */
export const REQUIRED_CLIPS: string[] = Object.values(Anim);

export type SkinTone = "light" | "dark";

export interface CharacterDefinition {
  /** Stable id used by the selection UI. */
  id: string;
  /** Display name on the selection screen. */
  label: string;
  /** GLB file holding the rigged mesh plus every clip in REQUIRED_CLIPS. */
  file: string;
  /** Material whose albedo texture gets swapped for the skin tone. */
  bodyMaterial: string;
  /**
   * Albedo texture file for this variant, resolved against TEXTURE_ROOT.
   * Omitted for
   * models that already ship the right texture.
   */
  bodyTexture?: string;
  tone: SkinTone;
  /**
   * Albedo multiplier applied over the texture, as [r, g, b].
   *
   * Quaternius ships "Light" and "Dark" body textures, but measured against
   * each other they differ on only ~10% of texels and are near-identical
   * across the skin itself, so the two variants render almost the same. This
   * tint is what actually separates them on screen. Set to [1, 1, 1] to see
   * the untouched source textures.
   */
  tint?: [number, number, number];
  /** Colour shown on the selection card; kept in step with the tint. */
  swatch: string;
}

const LIGHT_TINT: [number, number, number] = [1.08, 1.02, 0.96];
const DARK_TINT: [number, number, number] = [0.62, 0.5, 0.42];

/**
 * Runtime asset roots. These are URLs from the web root: everything under
 * assets/runtime is served there by Vite, while assets/source holds the
 * Blender originals and is never shipped.
 */
export const MODEL_ROOT = "models/";
export const TEXTURE_ROOT = "textures/";

/**
 * Four roster entries built from two meshes. Light and dark variants share a
 * GLB and differ only by the albedo texture swapped in at load time.
 */
export const CHARACTERS: CharacterDefinition[] = [
  {
    id: "male-light",
    label: "Ranger",
    file: "Superhero_Male.glb",
    bodyMaterial: "MI_Superhero_Male",
    bodyTexture: "T_Superhero_Male_Light.png",
    tone: "light",
    tint: LIGHT_TINT,
    swatch: "#c98f66",
  },
  {
    id: "male-dark",
    label: "Sentinel",
    file: "Superhero_Male.glb",
    bodyMaterial: "MI_Superhero_Male",
    bodyTexture: "T_Superhero_Male_Dark.png",
    tone: "dark",
    tint: DARK_TINT,
    swatch: "#6b452e",
  },
  {
    id: "female-light",
    label: "Scout",
    file: "Superhero_Female.glb",
    bodyMaterial: "MI_Superhero_Female",
    bodyTexture: "T_Superhero_Female_Light.png",
    tone: "light",
    tint: LIGHT_TINT,
    swatch: "#cb9269",
  },
  {
    id: "female-dark",
    label: "Vanguard",
    file: "Superhero_Female.glb",
    bodyMaterial: "MI_Superhero_Female",
    bodyTexture: "T_Superhero_Female_Dark.png",
    tone: "dark",
    tint: DARK_TINT,
    swatch: "#6d4830",
  },
];

/**
 * Picks who the player faces off against. A different model is preferred so
 * the two are easy to tell apart at a glance.
 */
export function opponentFor(player: CharacterDefinition): CharacterDefinition {
  return CHARACTERS.find((c) => c.file !== player.file) ?? CHARACTERS[0];
}

/** Where the two wrestlers start, facing each other down the z axis. */
export const SPAWN = {
  player: { x: 0, z: -1.6 },
  opponent: { x: 0, z: 1.6 },
};

/** Movement and animation tuning, all in world units per second. */
export const Tuning = {
  walkSpeed: 2.2,
  runSpeed: 5.4,
  /** How fast the character turns to face the direction of travel (rad/s). */
  turnSpeed: 12,
  /** How quickly speed ramps toward its target, as a per-second rate. */
  acceleration: 12,
  jumpVelocity: 6.2,
  gravity: -18,
  /** Forward speed carried through a roll. Slightly above a sprint so the
   *  dodge feels like it gains ground. */
  rollSpeed: 6.6,
  /** Fraction of the roll spent still moving; the tail is the recovery. */
  rollDriveFraction: 0.72,
  /** Ropes throw the wrestler back faster than they arrived. */
  reboundSpeed: 7.4,
  /**
   * Seconds spent against the ropes before being thrown off: the wrestler
   * turns his back into them, they load up, then they launch him. Without
   * this beat the reversal is instantaneous and reads as a bounce off a wall.
   */
  ropeHitDuration: 0.33,
  /**
   * How fast he spins to put his back to the ropes, in rad/s. Fast enough to
   * finish the half-turn inside the first part of the beat - a wrestler never
   * takes the ropes chest first.
   */
  ropeTurnSpeed: 26,
  /** How far the ropes carry him outward as they stretch, in world units. */
  ropeGive: 0.28,

  /**
   * How close to a corner post a running contact has to be to become a climb
   * rather than a rope rebound. Roughly the width of a turnbuckle pad, so
   * running along a rope still bounces normally.
   */
  cornerRadius: 1.15,
  /** Seconds spent scaling the corner to the top rope. */
  climbDuration: 0.62,
  /** Where his feet sit relative to the top rope, so he stands on it. */
  perchFootOffset: 0.06,
  /** Seconds from leaving the top rope to touching the mat. */
  diveDuration: 0.75,
  /** How far into the ring the dive carries him, in world units. */
  diveDistance: 2.3,
  /**
   * Amplitude of the dive's arc. This competes with the ~1.5 unit fall from
   * the top rope, so it has to exceed it noticeably for him to actually rise
   * off the rope before dropping; at 0.55 the hop was cancelled out entirely.
   */
  diveArcHeight: 0.95,
  /**
   * Safety cap on a rope run, in seconds. The run normally ends by reaching
   * the opposite ropes and bouncing again, or by the player throwing a move;
   * this only catches the case where neither happens.
   */
  reboundMaxDuration: 3,
  /** Keeps the wrestler's body inside the ropes rather than clipping them. */
  bodyRadius: 0.35,
  /** How far a standing strike reaches, in world units. */
  strikeRange: 1.35,
  /** Half-angle the target must fall inside for a strike to connect. */
  strikeArc: Math.PI / 3,
  /**
   * Rope spring. Stiffness sets the snap-back rate and damping how quickly it
   * settles; together they give roughly a 0.45s wobble that dies out over
   * about a second - underdamped enough to visibly oscillate.
   */
  ropeStiffness: 200,
  ropeDamping: 6,
  /** Outward stretch per unit of impact speed. */
  ropeImpulseScale: 0.85,
  /** Ropes stretch, they do not travel; caps the bow in world units. */
  ropeMaxBow: 0.5,
  /** Seconds to crossfade between animation clips. */
  blendDuration: 0.18,
  /** Arena floor the ring stands on. */
  groundSize: 40,
};

/** The wrestling ring the match takes place in. */
export const RING = {
  /** Full URL from the web root. */
  file: MODEL_ROOT + "ring-standard.glb",
  /** Mesh name holding the mat; used to find the standing surface. */
  canvasMesh: "canvas",
  /** Prefix of the rope meshes; used to derive the rebound boundary. */
  ropePrefix: "rope",
};

/** Fixed ringside camera framing. */
export const RING_VIEW = {
  /**
   * Elevation of the camera. Babylon measures beta from straight up, so this
   * sits roughly 30 degrees above the horizon - high enough to see the mat,
   * low enough to keep the wrestlers upright rather than foreshortened.
   */
  beta: Math.PI / 2 - 0.52,
  /**
   * Height above the ring's centre that the camera aims at.
   *
   * Because the camera orbits its target, lowering this drops the whole rig
   * and lifts the ring up the frame. That is what keeps the near ropes - and
   * a wrestler standing against them - clear of the HUD along the bottom.
   */
  lookHeight: 0.34,
  /**
   * Slack around the ring so it is not flush against the viewport edges.
   * The framing is solved against the ring's full width, so extra here shows
   * up as dead sky above the posts.
   */
  margin: 1.1,
};

/** Axis-aligned play area, derived from the ring at load time. */
export interface RingBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height of the top rope above the mat, i.e. what a wrestler perches on. */
  topRopeY: number;
}
