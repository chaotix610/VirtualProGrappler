import { BODY_PARTS, ParameterSet, WrestlerProfile } from "./types";

/**
 * Wrestler parameter profiles, following Parameters.md.
 *
 * Ten values on a 1-5 scale sharing a 30 point budget, so raising one area
 * means lowering another. Leaving points unspent is legitimate and marks a
 * wrestler with real weaknesses.
 */

export const PARAMETER_BUDGET = 30;
export const PARAMETER_MIN = 1;
export const PARAMETER_MAX = 5;

export interface ProfileValidation {
  valid: boolean;
  total: number;
  errors: string[];
}

/** Checks a profile against the allocation rules in Parameters.md. */
export function validateProfile(profile: WrestlerProfile): ProfileValidation {
  const errors: string[] = [];
  let total = 0;

  for (const set of ["offense", "defense"] as const) {
    for (const part of BODY_PARTS) {
      const value = profile[set][part];
      total += value;
      if (!Number.isInteger(value)) {
        errors.push(`${set}.${part} must be a whole number, got ${value}`);
      }
      if (value < PARAMETER_MIN || value > PARAMETER_MAX) {
        errors.push(
          `${set}.${part} must be ${PARAMETER_MIN}-${PARAMETER_MAX}, got ${value}`
        );
      }
    }
  }

  if (total > PARAMETER_BUDGET) {
    errors.push(`total ${total} exceeds the ${PARAMETER_BUDGET} point budget`);
  }
  if (profile.weightFactor < 0 || profile.weightFactor > 7) {
    errors.push(`weightFactor must be 0-7, got ${profile.weightFactor}`);
  }

  return { valid: errors.length === 0, total, errors };
}

const params = (
  head: number,
  body: number,
  arms: number,
  legs: number,
  flying: number
): ParameterSet => ({ head, body, arms, legs, flying });

/**
 * Profiles for the current roster, one per selectable character. Archetypes
 * follow the designer guidance in Parameters.md: powerhouses buy body and
 * arms, high-flyers buy flying at the cost of durability.
 */
export const PROFILES: Record<string, WrestlerProfile> = {
  // Brawler: solid all round, hits hardest with the arms.
  "male-light": {
    id: "male-light",
    name: "Ranger",
    offense: params(3, 3, 4, 2, 2),
    defense: params(3, 3, 2, 2, 2),
    weightFactor: 5,
    submissionSkill: "normal",
  },
  // Powerhouse: heavy, durable, no aerial game at all.
  "male-dark": {
    id: "male-dark",
    name: "Sentinel",
    offense: params(2, 4, 4, 2, 1),
    defense: params(3, 4, 3, 3, 1),
    weightFactor: 6,
    submissionSkill: "normal",
  },
  // High-flyer: light, exceptional off the top, fragile on the mat.
  "female-light": {
    id: "female-light",
    name: "Scout",
    offense: params(2, 2, 2, 3, 5),
    defense: params(2, 2, 2, 2, 4),
    weightFactor: 3,
    submissionSkill: "normal",
  },
  // Technician: limb work and submissions.
  "female-dark": {
    id: "female-dark",
    name: "Vanguard",
    offense: params(2, 3, 4, 4, 2),
    defense: params(2, 3, 3, 3, 2),
    weightFactor: 4,
    submissionSkill: "expert",
  },
};

/** Falls back to a balanced profile for any id without one. */
export function profileFor(characterId: string): WrestlerProfile {
  return (
    PROFILES[characterId] ?? {
      id: characterId,
      name: characterId,
      offense: params(3, 3, 3, 3, 3),
      defense: params(3, 3, 3, 3, 3),
      weightFactor: 5,
      submissionSkill: "normal",
    }
  );
}
