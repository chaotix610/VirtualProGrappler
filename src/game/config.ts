/**
 * Central configuration for the game: animation clip names, the playable
 * character roster, and the movement tuning constants.
 */

/**
 * The clip each game state plays, by `animation_id` - the snake_case name
 * tools/prepare-character-glb.mjs gives the AKI clips.
 *
 * Locomotion, guard, the rope beat and the climb are clips the pipeline adds
 * from outside his own export (`extraClips` in tools/promote-assets.mjs).
 */
export const Anim = {
  IDLE: "idle",
  /**
   * Walks by direction relative to his facing: he squares up to his opponent
   * and walks in any direction without turning his back.
   */
  WALK: "walk_forward",
  WALK_BACKWARD: "walk_backward",
  WALK_LEFT: "walk_left",
  WALK_RIGHT: "walk_right",
  RUN: "run",
  PUNCH: "austin_punch",
  KICK: "front_kick_01",
  ROLL: "roll",
  /** The beat against the ropes; the turn and the give are code-driven. */
  ROPE_HIT: "rope_hit",
  /**
   * Scaling the corner onto the top turnbuckle, from a root on the mat. It
   * lifts him and turns him to face the ring itself, and its final frame -
   * crouched on the top rope - is held as the perch.
   */
  CLIMB: "climb",
  /**
   * The whole dive off the top rope, played once: launch, flight and fall.
   * It starts with his feet at top-rope height over a root on the mat, so the
   * clip supplies the drop and the code only carries him across the ring.
   */
  DIVE: "body_splash",
  /** Played once and held on its final frame while the guard key is down. */
  BLOCK: "guard",
} as const;

/** Every clip the game needs baked into each character GLB. */
export const REQUIRED_CLIPS: string[] = [...new Set(Object.values(Anim))];

export interface CharacterDefinition {
  /** Stable id used by the selection UI. */
  id: string;
  /** Display name on the selection screen. */
  label: string;
  /** GLB file holding the rigged mesh plus every clip in REQUIRED_CLIPS. */
  file: string;
  /** Colour shown on the selection card. */
  swatch: string;
}

/**
 * Where the character GLBs live, as a repository path. Resolve a full path
 * with `requireAsset()` from src/data/assets.ts to get a fetchable URL;
 * assets/source holds the Blender originals and is never shipped.
 */
export const CHARACTER_MODEL_DIR = "assets/characters/models/";

/**
 * The playable roster. Austin is modelled and textured as himself; his
 * shading is painted into the texture and his material is marked unlit, which
 * is what gives the low-poly roster its flat look.
 */
export const CHARACTERS: CharacterDefinition[] = [
  {
    id: "steve-austin",
    label: "Austin",
    file: "steve_austin.glb",
    swatch: "#2b2b2e",
  },
  {
    // A stock model rebound to the AKI rig in Blender; she shares Austin's
    // clips, baked into her own export.
    id: "female-rigged",
    label: "Female",
    file: "female_rigged.glb",
    swatch: "#c9a27e",
  },
];

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
  /** Seconds spent scaling the corner, when the climb clip is not loaded. */
  climbDuration: 2.67,
  /**
   * How far in from where the ropes meet his feet land when perched, along
   * the diagonal into the ring. Zero would stand him on the post itself.
   */
  perchInset: 0.1,
  /** Seconds in the air, when the dive clip is not loaded to time it. */
  diveDuration: 0.8,
  /** How far into the ring the dive carries him, in world units. */
  diveDistance: 2.3,
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
  /** Repository path; resolve it with `requireAsset()` before loading. */
  file: "assets/environments/arenas/shared/ring/models/ring-standard.glb",
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
