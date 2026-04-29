## PROJECT CONTEXT

(Assume this is always true unless explicitly overridden)

- Renderer: Babylon.js 9.x
- Runtime: ES2022 modules (no frameworks)
- Assets: GLB (named meshes + AnimationGroups)
- Materials: StandardMaterial ONLY (N64 aesthetic)
- Data: JSON validated via AJV
- Audio: Howler.js
- Dev: Vite
- Testing: Vitest

---

## ARCHITECTURE AWARENESS

You are working inside THIS structure:

- engine/ → Game loop, input, frame clock, RNG
- renderer/ → SceneManager, CharacterRenderer, ArenaRenderer
- fsm/ → HFSM + states + regions
- combat/ → MoveInstance, DamageCalculator, ReversalSystem
- characters/ → Fighter, CharacterLoader
- match/ → MatchController, rules, win conditions
- ui/ → HUD + menus
- data/ → loaders + registries
- utils/ → math + RNG + debug

You MUST integrate with these systems directly.

---

## DOMAIN-SPECIFIC RULES

### Animation
- All animations come from GLB AnimationGroups
- Animation triggering must be tied to MoveInstance frames
- No time-based blending — only frame-based control

### FSM
- All gameplay actions must be expressed as state transitions
- No “side logic” outside FSM + regions
- Must respect hierarchical and orthogonal regions

### Combat
- Moves are executed via MoveInstance ONLY
- Frame windows (hitFrames, reversalWindow) are authoritative
- Damage must go through DamageCalculator (AKI formula)

### Data
- Moves, characters, arenas must remain JSON-driven
- If new behavior is needed → extend schema, not code hacks

---

## REQUIRED RESPONSE FORMAT

You MUST structure every answer as:

1. **Understanding of Task**
   - What the system needs to do in engine terms

2. **Design Decision**
   - Why this approach fits VPG constraints
   - Tradeoffs if relevant

3. **Implementation**
   - Exact file paths
   - Complete, ready-to-drop code
   - ES module imports included

4. **Integration Notes**
   - How this connects to existing systems
   - What calls what, and when

5. **Assumptions**
   - Any inferred details

6. **Validation**
   - Confirm:
     - Uses real Babylon.js 9.x APIs
     - Is frame-deterministic
     - Respects FSM + MoveInstance architecture

---

## FAILURE MODES TO AVOID

Never:

- Introduce delta time
- Use async animation timing
- Bypass MoveInstance for gameplay logic
- Hardcode gameplay values that belong in JSON
- Invent fake Babylon.js APIs
- Collapse FSM logic into “if statements”

---

## TASK INPUT

TASK:
[User describes feature or bug]

CONSTRAINTS:
[Optional]

FILES INVOLVED:
[Optional]

GOAL:
[Definition of done]