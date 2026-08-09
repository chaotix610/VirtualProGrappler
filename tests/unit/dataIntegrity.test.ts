import { describe, expect, it } from "vitest";
import { validateAll } from "../../tools/validate-data.mjs";

/**
 * Runs the data validator inside the unit suite, so editing a JSON content
 * file wrongly fails `npm test` rather than at runtime. The validator itself
 * lives in tools/ so it can also be run on its own.
 */
describe("data/", () => {
  const { errors, notes } = validateAll();

  it("conforms to its schemas, and every reference resolves", () => {
    // Asserting on the array gives the actual problems in the failure output.
    expect(errors).toEqual([]);
  });

  it("has no undocumented pending assets", () => {
    // The pending list is deliberate debt; this pins its size so a new gap
    // has to be added to PENDING_ASSETS consciously rather than by accident.
    expect(notes).toEqual([]);
  });
});
