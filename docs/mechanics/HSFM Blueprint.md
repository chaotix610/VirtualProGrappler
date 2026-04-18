### 1. TOP-LEVEL STATE REGIONS (Orthogonal + Exclusive)

The engine utilizes a hybrid model: one **Exclusive** region for core combat states and two **Orthogonal** regions for parallel, non-interfering subsystems.

|Region|Type|Responsibility|
|---|---|---|
|**Combat Region**|**Exclusive**|The core HFSM. Manages all combat states: Neutral, Engagement, Damage, Grounded. A character can only be in one Combat state at a time.|
|**Special Meter Region**|**Orthogonal**|Manages special meter accumulation, the "Special Active" flag, and finisher availability. Runs in parallel to all Combat states.|
|**Interaction Region**|**Orthogonal**|Continuously tracks spatial relationships (distance, facing angle) to the target. Provides deterministic boolean flags to the Combat Region's transition guards.|

**Justification:**

- **Exclusive Combat Region:** Ensures the character's core posture (e.g., standing, grappling, downed) is always singular and well-defined, preventing contradictory states.
- **Orthogonal Regions:** Separates persistent, context-providing logic from the core state machine. This prevents the Combat states from being cluttered with proximity checks or meter logic, making them purer and more deterministic. The `InteractionRegion` is the sole source of truth for spatial context, eliminating polling from within states.

---

### 2. PRIMARY STATE TREE (Hierarchical Layout)

The **Combat Region** hierarchy is designed to enforce strict transition boundaries and isolate specific combat phases.

```text
CharacterCombatRegion (Exclusive)
│
├── Neutral
│   ├── Idle
│   ├── Moving
│   ├── Running
│   └── Evading                 (Active only on evade input, returns to previous state)
│
├── Engagement
│   ├── GrappleInitiation       (Transient: validates proximity, facing, and meter for finishers)
│   ├── GrappleHold             (Persistent "Tie-Up" state for move selection)
│   │   ├── FrontWeak
│   │   ├── FrontStrong
│   │   ├── BackWeak
│   │   └── BackStrong
│   └── ExecutingMove           (Universal move execution: strikes, grapples, submissions)
│
├── Damage
│   ├── HitStun                 (Reaction to strikes/grapple damage)
│   ├── Knockdown               (Forced transition to Grounded)
│   └── Rising
│       └── RecoveringAttack    (Special rising strike with reversal window)
│
└── Grounded
    ├── Prone                   (Face-up/face-down, limited movement)
    ├── Submission              (Active submission hold, escape minigame)
    └── Pinning                 (Pin attempt, kick-out minigame)
```

**Structural Justifications (Synthesis from Blueprints 1 & 3):**

- **`GrappleInitiation` as a Transient State:** This is a critical improvement over Blueprint 1. It acts as a dedicated "gateway" that validates all grapple pre-conditions (range, facing, special meter) in a single frame. This prevents the `Neutral` state from being overloaded with grapple logic and provides a clean entry point for the finisher override.
- **`GrappleHold` Substates:** Explicitly representing `FrontWeak`, `FrontStrong`, etc., isolates the move selection logic. This makes it impossible for a "Back" move to be accidentally selected from a "Front" tie-up, enforcing the authenticity of the original AKI games.
- **Universal `ExecutingMove`:** This flat state, as in Blueprint 3, is more pragmatic than Blueprint 1's separate `MoveExecution` and `MoveReceiving` states. The attacker/defender relationship is managed by the execution engine via the `MoveInstance` object, not by two separate states. It simplifies the state tree while maintaining a deterministic pipeline.
- **`RecoveringAttack` as Substate:** Correctly nests the recovery attack inside the `Rising` state, respecting the hierarchical rule that a character cannot be rising and performing a recovery attack simultaneously without a parent-child relationship.

---

### 3. STATE RESPONSIBILITY RULES & TRANSITION GUARDS

- **`Neutral`:** Handles movement, blocking, and _initiating_ strikes or grapples. **Exit:** `Ev_InitiateGrapple` (to `GrappleInitiation`), `Ev_InitiateStrike` (to `ExecutingMove`).
- **`GrappleInitiation`:** Validates `InteractionRegion.InGrappleRange` and `InteractionRegion.FacingAngle`. If `SpecialMeterRegion.IsActive`, it overrides the slot. It then transitions to `GrappleHold` (with the correct substate) or directly to `ExecutingMove` (for finishers). **Exit:** `Ev_GrappleHoldEnter`, `Ev_FinisherExec`.
- **`GrappleHold`:** Polls the `InputRegion` for directional input. On valid input, it calls the `SlotResolver`, fetches move data, and transitions to `ExecutingMove`. **Exit:** `Ev_MoveSelected`.
- **`ExecutingMove`:** The heart of deterministic combat. Owns a `MoveInstance` object (attacker) or references the opponent's `MoveInstance` (defender). Advances a frame counter, checks hitboxes, polls for reversals, and applies damage. **Exit:** `Ev_MoveComplete`, `Ev_MoveReversed`.
- **`Damage` Branch:** States where the player has no agency. `HitStun` leads back to `Neutral`. `Knockdown` forces entry into `Grounded.Prone`. `Rising` leads back to `Neutral`.
- **`Grounded` Branch:** Handles ground-specific interactions (`Prone`, `Submission`, `Pinning`). All exits lead back to `Neutral` upon completion or escape.

**Critical Transition Guards (From Blueprint 2):**

- **Single Active Move Token:** An atomic `activeMoveToken` is assigned to a character when they enter `ExecutingMove`. A second `ExecutingMove` cannot be entered until this token is released. This prevents double execution and race conditions.
- **Deadlock Prevention:** `GrappleHold` has a `maxFrames` timer. If it expires without a move selection, a forced `Ev_HoldBroken` event is dispatched, returning both characters to `Neutral`.
- **Mutual Grapple Resolution:** If both characters initiate a grapple on the same frame, a deterministic tie-breaker (e.g., `playerId % 2`) decides the attacker. The loser receives a `Ev_GrappleFailed` event and is forced into a brief `HitStun` state.

---

### 4. MOVE RESOLUTION PIPELINE (Deterministic)

This pipeline executes within a single frame or across a few frames, ensuring deterministic move selection.

1. **Raw Input:** Hardware inputs are polled and timestamped with the current `FrameIndex`.
2. **Input Buffer:** Inputs are stored in a fixed-size buffer with their frame timestamps. The buffer differentiates between Tap (Weak) and Hold (Strong).
3. **Context Resolver:** The **active state** queries the `InteractionRegion` and `SpecialMeterRegion` to get the current context (e.g., `isInGrappleRange`, `isFacingBack`, `isSpecialActive`).
4. **Slot Resolver:** Based on the state (e.g., `GrappleHold.FrontWeak`), the buffered input, and the context, the resolver maps to a specific move slot ID (e.g., `front_weak_grapple_slot_03`). **Finisher Override:** If `isSpecialActive` is true, the resolver replaces the standard slot ID with a finisher slot ID.
5. **Move Data Lookup:** The engine retrieves the move's JSON data using the slot ID. This data contains all frame data, hitboxes, damage values, and reversal windows.
6. **State Transition:** The source state (`GrappleHold` or `Neutral`) dispatches the `Ev_MoveSelected` event, transitioning the character to the `ExecutingMove` state. The move data is passed to the new state.
7. **Atomic Token Acquisition:** The `ExecutingMove` state attempts to acquire the `activeMoveToken`. If it fails (due to a race condition), the transition is aborted, and the character is forced back to `Neutral`.
8. **Frame Step Execution:** The `ExecutingMove` state's `update()` method increments its internal frame counter and consults the move's JSON for that frame to apply hitboxes, position deltas, etc.
9. **Hit Evaluation & Reversal Check:** On a frame designated for hit evaluation, the engine checks for collisions. On a frame within the `reversalWindow`, the engine polls the opponent's input buffer for the specific reversal input.
10. **Recovery & Exit:** After the move's `totalFrames` are completed, a recovery timer begins. Once recovery is complete, the `activeMoveToken` is released, and the state machine transitions back to `Neutral` or into the `Damage` branch based on the outcome.

---

### 5. REVERSAL & TIMING ARCHITECTURE (Polled, Frame-Perfect)

- **Window-Polled, Not Interrupt-Driven:** Reversals are evaluated by the active `ExecutingMove` state during its `update()` call. For each frame, it checks if the current `frameCount` falls within the move's `reversalWindow` (startFrame, endFrame).
- **Frame-Perfect Timing:** Reversal success is determined by comparing the opponent's input frame timestamp with the move's current frame. If the input frame is within the window, the reversal is successful. This is a purely arithmetic comparison, guaranteeing deterministic outcomes.
- **Strike Reversal (Perfect Block):** When a strike's hit frame is active, the system checks the defender's input buffer for a block input pressed within a 4-frame window ending on the hit frame. If found, the strike is negated, and the defender enters a `Reversing` state (a specialized form of `ExecutingMove` for counter-strikes).
- **Grapple Reversal:** Evaluated during the `reversalWindow` of a grapple move in `ExecutingMove`. The defender's input buffer is checked for a specific reversal input (e.g., a direction + button). Success results in the defender becoming the new attacker for a reversal move.

---

### 6. SPECIAL / FINISHER OVERRIDE MODEL (Orthogonal Injection)

- **Mechanism:** The `SpecialMeterRegion` acts as a context provider. It maintains a simple `isSpecialActive` boolean.
- **Injection Point:** During the **Slot Resolver** stage of the pipeline, specifically when in the `GrappleInitiation` state, the resolver checks `SpecialMeterRegion.isSpecialActive`.
- **Override:** If true, the resolver bypasses the standard weak/strong grapple slot selection and directly returns the character's pre-defined finisher slot ID (e.g., `finisher_front`).
- **Result:** The finisher is treated as a standard move, flowing through the same `ExecutingMove` state and pipeline. This elegantly avoids a separate `FinisherState` and ensures all moves share the same deterministic logic for hit evaluation and reversal windows.

---

### 7. DETERMINISTIC ENGINE LOOP (Vanilla JS Skeleton)

This skeleton demonstrates the core, deterministic update loop that guarantees reproducibility.

```javascript
// --- Move Data (JSON) ---
class MoveData {
    constructor(json) {
        Object.assign(this, json); // id, totalFrames, reversalWindow, hitFrames, etc.
    }
}

// --- Atomic Token Manager ---
class AtomicTokenManager {
    constructor() {
        this.token = null;
    }
    acquire(ownerId) {
        if (this.token !== null) return false;
        this.token = ownerId;
        return true;
    }
    release(ownerId) {
        if (this.token !== ownerId) return false;
        this.token = null;
        return true;
    }
}

// --- Move Instance (Created by ExecutingMove state) ---
class MoveInstance {
    constructor(moveData, owner, target) {
        this.data = moveData;
        this.owner = owner;
        this.target = target;
        this.frame = 0;
    }
    update() {
        this.frame++;
        // Check hit frames, reversal windows, etc.
        if (this.data.reversalWindow.start <= this.frame && this.frame <= this.data.reversalWindow.end) {
            if (this.target.inputBuffer.hasReversalInput(this.data.reversalWindow.input)) {
                this.owner.dispatchEvent('Ev_MoveReversed', { reverser: this.target });
                return false; // Move ended
            }
        }
        // ... hit detection, damage application ...
        if (this.frame >= this.data.totalFrames) {
            return false; // Move completed
        }
        return true; // Move continues
    }
}

// --- HFSM State ---
class State {
    constructor(name, fsm) {
        this.name = name;
        this.fsm = fsm;
        this.frameCount = 0;
    }
    onEnter(context) { this.frameCount = 0; }
    onUpdate(context) { this.frameCount++; }
    onExit(context) {}
    handleEvent(event, context) { return false; }
}

// --- HFSM ---
class HFSM {
    constructor(context, ownerId) {
        this.context = context;
        this.ownerId = ownerId;
        this.currentState = null;
        this.states = new Map();
        this.transitionMatrix = new Map(); // fromStateName -> Set(toStateName)
    }
    registerState(state) { this.states.set(state.name, state); }
    setState(newStateName, eventContext = {}) {
        const newState = this.states.get(newStateName);
        if (!newState) return false;
        if (this.currentState && !this.transitionMatrix.get(this.currentState.name)?.has(newStateName)) {
            console.warn(`Illegal transition: ${this.currentState.name} -> ${newStateName}`);
            return false;
        }
        if (this.currentState) this.currentState.onExit(this.context);
        this.currentState = newState;
        this.currentState.onEnter({ ...this.context, ...eventContext });
        return true;
    }
    update() { if (this.currentState) this.currentState.onUpdate(this.context); }
    dispatchEvent(eventName, eventContext) {
        if (this.currentState) this.currentState.handleEvent(eventName, { ...this.context, ...eventContext });
    }
}

// --- Specific State: ExecutingMove ---
class ExecutingMoveState extends State {
    constructor(fsm, tokenManager) {
        super('ExecutingMove', fsm);
        this.tokenManager = tokenManager;
        this.moveInstance = null;
    }
    onEnter(context) {
        super.onEnter(context);
        if (!this.tokenManager.acquire(this.fsm.ownerId)) {
            this.fsm.dispatchEvent('Ev_StateCorruption', { reason: 'Failed to acquire move token' });
            this.fsm.setState('Neutral');
            return;
        }
        this.moveInstance = new MoveInstance(context.selectedMove, context.owner, context.target);
    }
    onUpdate(context) {
        super.onUpdate(context);
        if (!this.moveInstance) return;
        const moveActive = this.moveInstance.update();
        if (!moveActive) {
            this.fsm.dispatchEvent('Ev_MoveComplete');
        }
    }
    onExit(context) {
        this.tokenManager.release(this.fsm.ownerId);
        this.moveInstance = null;
        super.onExit(context);
    }
    handleEvent(event, context) {
        if (event === 'Ev_MoveComplete') {
            this.fsm.setState('Neutral', context);
            return true;
        }
        if (event === 'Ev_MoveReversed') {
            // Switch roles: the reverser becomes the attacker for a new move.
            context.owner = context.reverser;
            context.selectedMove = context.reversalMoveData;
            this.fsm.setState('ExecutingMove', context);
            return true;
        }
        return false;
    }
}

// --- Deterministic Game Engine ---
class VPGEngine {
    constructor() {
        this.frameIndex = 0;
        this.players = [new Fighter(0), new Fighter(1)];
        this.tokenManager = new AtomicTokenManager(); // Shared for mutual exclusion? No, per-character. This is a placeholder for concept.
        // In practice, each fighter has its own token manager.
    }
    update() {
        // 1. Poll and store inputs in buffers
        this.players.forEach(p => p.inputBuffer.update(this.frameIndex));

        // 2. Update orthogonal regions (these don't change state, only provide context)
        this.players.forEach(p => p.interactionRegion.update(this.players.find(o => o !== p)));

        // 3. Update exclusive HFSMs (this is where state changes happen)
        this.players.forEach(p => p.combatFSM.update());

        // 4. Evaluate combat interactions (cross-player)
        this.evaluateCombat();

        this.frameIndex++;
    }
    evaluateCombat() {
        // This would handle things like applying damage, etc., based on state.
        // It ensures that for a given frame index, the outcome is deterministic.
    }
}
```

---

### 8. SCALABILITY & AUTHENTICITY JUSTIFICATION

- **100+ Wrestlers & Modded Moves:** The system is entirely data-driven. A wrestler is defined by a JSON payload of stats and move set IDs. Adding a new move requires only a new JSON entry with its frame data, hitboxes, and reversal windows. The `ExecutingMove` state and the `MoveInstance` class are universal.
    
- **Deterministic Behavior:** By using a fixed `frameIndex`, frame-timestamped input buffers, a polled reversal model, and atomic token acquisition, the engine guarantees that for any given input sequence, the state of the game at frame `N` is perfectly reproducible. This is the foundation for rollback netcode and replay systems.
    
- **No Mercy Authenticity:** This architecture perfectly emulates the core AKI loop:
	- **Tie-Up → Input → Execute:** The `GrappleInitiation` -> `GrappleHold` -> `ExecutingMove` flow is a direct implementation of this classic pattern.
    - **Weak/Strong & Front/Back:** These are explicitly modeled as substates within `GrappleHold` and as parameters in the `SlotResolver`.
    - **Frame-Window Reversals:** The reversal system is frame-precise and polled, mirroring the timing-based gameplay of the original games, avoiding the floaty, interrupt-driven feel of modern engines.

