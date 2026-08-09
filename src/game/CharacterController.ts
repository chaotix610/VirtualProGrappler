import { Camera, Scalar, TransformNode, Vector3 } from "@babylonjs/core";
import { AnimationController } from "../renderer/AnimationController";
import { InputController, RunMode } from "./InputController";
import { RingRopes, RopeSide } from "../renderer/RingRopes";
import { Anim, RingBounds, Tuning } from "./config";

type State =
  | "locomotion"
  | "attack"
  | "jump"
  | "block"
  | "roll"
  /** Pressed against the ropes, back turned, before they throw him off. */
  | "ropeHit"
  | "rebound"
  /** Scaling a corner post toward the top rope. */
  | "climbing"
  /** Balanced on the top rope, waiting for the player to let go. */
  | "perched"
  /** In the air after launching off the top rope. */
  | "diving";
type JumpPhase = "start" | "air" | "land";

/**
 * Drives one character: camera-relative WASD movement, a Shift run modifier,
 * and the punch / kick / jump one-shots. Movement is code-driven, so the
 * in-place (non root-motion) clips are the correct ones to pair with it.
 */
export class CharacterController {
  private state: State = "locomotion";
  private jumpPhase: JumpPhase = "start";
  /** Current horizontal speed, eased toward the target for smooth starts. */
  private speed = 0;
  private verticalVelocity = 0;
  /** Facing angle in radians, eased toward the direction of travel. */
  private yaw = 0;
  /** Seconds elapsed in the current roll, used to taper its momentum. */
  private rollElapsed = 0;
  /** Direction locked in when the roll began. */
  private readonly rollDirection = new Vector3();
  /**
   * Where the opponent is. This drives two rules:
   *  - the wrestler squares up to them whenever he is not running;
   *  - a run with no direction input heads straight at them.
   * Left unset, both fall back to whatever way he is already facing.
   */
  opponentPosition: (() => Vector3 | null) | null = null;

  /** Seconds elapsed since the ropes threw the wrestler back. */
  private reboundElapsed = 0;
  /** Direction the ropes threw the wrestler in. */
  private readonly reboundDirection = new Vector3();

  /** Seconds spent so far pressed against the ropes. */
  private ropeHitElapsed = 0;
  /** Facing to spin to, which puts his back into the ropes. */
  private ropeTargetYaw = 0;
  /** Unit vector pointing into the ropes he is leaning on. */
  private readonly ropeOutward = new Vector3();
  /** Where he met the ropes, before any give. */
  private readonly ropeAnchor = new Vector3();
  /** Which rope wall he is against, for reading its stretch. */
  private ropeSide: RopeSide | null = null;

  /** Seconds spent so far scaling the corner. */
  private climbElapsed = 0;
  private readonly climbFrom = new Vector3();
  /** Perch position on the top rope. */
  private readonly climbTo = new Vector3();
  /** Facing while perched: into the ring. */
  private perchYaw = 0;
  /** Seconds spent so far in the air off the top rope. */
  private diveElapsed = 0;
  /** Airborne, or on the mat playing out the landing. */
  private divePhase: "air" | "landing" = "air";
  private readonly diveFrom = new Vector3();
  private readonly diveTo = new Vector3();

  private readonly moveDirection = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  /** Scratch vector for facing maths, to avoid per-frame allocation. */
  private readonly facingScratch = new Vector3();
  /** Notified when a strike is thrown; wired to the combat simulation. */
  private strikeHandler: ((moveId: string) => void) | null = null;

  constructor(
    public readonly root: TransformNode,
    private animations: AnimationController,
    private input: InputController,
    private camera: Camera,
    private bounds: RingBounds | null = null,
    private ropes: RingRopes | null = null
  ) {
    this.yaw = root.rotation.y;
    this.animations.play(Anim.IDLE, { loop: true });
  }

  /** The ring loads asynchronously, so bounds can arrive after construction. */
  setBounds(bounds: RingBounds | null): void {
    this.bounds = bounds;
  }

  setRopes(ropes: RingRopes | null): void {
    this.ropes = ropes;
  }

  /**
   * Called with a move slot id whenever a strike is thrown, so the combat
   * simulation can schedule the hit. The controller stays unaware of damage.
   */
  setStrikeHandler(handler: ((moveId: string) => void) | null): void {
    this.strikeHandler = handler;
  }

  /**
   * Points the character at `yaw` radians. Facing is cached here, so setting
   * the node's rotation directly would be overwritten on the next frame.
   */
  setFacing(yaw: number): void {
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  /** Current facing in radians. */
  get facing(): number {
    return this.yaw;
  }

  /** Current horizontal speed in units per second. */
  get currentSpeed(): number {
    return this.speed;
  }

  /** Drops all momentum and returns the character to neutral. */
  resetMotion(): void {
    this.speed = 0;
    this.verticalVelocity = 0;
    this.state = "locomotion";
    this.moveDirection.set(0, 0, 0);
  }

  update(deltaSeconds: number): void {
    // Clamp the step so an alt-tab pause cannot teleport the character.
    const dt = Math.min(deltaSeconds, 0.1);

    this.input.update();
    this.handleActions();
    this.updateBlockHold();
    this.move(dt);
    this.updateAnimation();
    this.animations.update(dt);
  }

  /** Blocking is held, so it ends the moment the key comes up. */
  private updateBlockHold(): void {
    if (this.state === "block" && !this.input.guarding) {
      this.state = "locomotion";
    }
  }

  /** Consumes queued one-shot inputs, if the current state allows them. */
  private handleActions(): void {
    const action = this.input.consumeAction();
    if (!action) return;

    // Attacks, jumps and rolls do not interrupt each other. Blocking is
    // interruptible, and so is a rope run: throwing a move off the ropes is
    // how the chain of bounces is meant to be broken.
    if (
      this.state !== "locomotion" &&
      this.state !== "block" &&
      this.state !== "rebound"
    ) {
      return;
    }

    if (this.state === "rebound") this.endRebound();

    if (action === "guard") {
      // The same key rolls when sprinting and guards otherwise.
      if (this.input.isRunning) {
        this.startRoll();
      } else {
        this.state = "block";
        // Non-looping: the clip raises the guard and holds on its last frame
        // until the key comes up, rather than replaying the raise on a cycle.
        this.animations.play(Anim.BLOCK, { loop: false, restart: true });
      }
      return;
    }

    if (action === "jump") {
      this.state = "jump";
      this.jumpPhase = "start";
      this.verticalVelocity = Tuning.jumpVelocity;
      this.animations.play(Anim.JUMP_START, {
        loop: false,
        restart: true,
        onEnd: () => {
          if (this.state === "jump" && this.jumpPhase === "start") {
            this.jumpPhase = "air";
            this.animations.play(Anim.JUMP_LOOP, { loop: true });
          }
        },
      });
      return;
    }

    const clip = action === "punch" ? Anim.PUNCH : Anim.KICK;
    // Tell the combat simulation a strike was thrown. It schedules the hit on
    // the move's own frame rather than resolving it here.
    this.strikeHandler?.(
      action === "punch" ? "weak-arm-strike-1" : "weak-leg-strike-1"
    );
    this.state = "attack";
    this.animations.play(clip, {
      loop: false,
      restart: true,
      onEnd: () => {
        if (this.state === "attack") this.state = "locomotion";
      },
    });
  }

  /**
   * Begins a dodge roll in the direction the character is already facing.
   * The clip is in-place, so the displacement is driven here.
   */
  private startRoll(): void {
    this.state = "roll";
    this.rollElapsed = 0;
    // Lock direction at the moment of input; steering mid-roll would defeat
    // the point of a committed dodge.
    this.rollDirection.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.speed = 0;

    this.animations.play(Anim.ROLL, {
      loop: false,
      restart: true,
      onEnd: () => {
        if (this.state === "roll") this.state = "locomotion";
      },
    });
  }

  /** Carries the roll's momentum, tapering to a stop through the recovery. */
  private advanceRoll(dt: number): void {
    this.rollElapsed += dt;

    const clipLength = this.animations.durationOf(Anim.ROLL) ?? 1.5;
    const driveFor = clipLength * Tuning.rollDriveFraction;
    if (this.rollElapsed >= driveFor) return;

    // Ease out so the roll decelerates into its recovery rather than
    // stopping dead.
    const t = this.rollElapsed / driveFor;
    const speed = Tuning.rollSpeed * (1 - t * t);
    const stride = speed * dt;

    this.root.position.x += this.rollDirection.x * stride;
    this.root.position.z += this.rollDirection.z * stride;
  }

  /**
   * Carries the wrestler across the ring after a rope rebound.
   *
   * Steering is ignored for the whole run: the ropes threw them, so they run
   * to the far side and bounce again, which is what rope-running looks like.
   * The player breaks the chain by throwing a move, not by steering.
   */
  private advanceRebound(dt: number): void {
    // A rope run is still a run. The moment the player stops running - by
    // letting go of Shift, or of both keys in a directed run - the throw is
    // dropped and normal deceleration takes over.
    if (!this.input.isRunning) {
      this.endRebound();
      return;
    }

    this.reboundElapsed += dt;

    const stride = this.speed * dt;
    this.root.position.x += this.reboundDirection.x * stride;
    this.root.position.z += this.reboundDirection.z * stride;

    // Safety net only; the run normally ends at the opposite ropes or when
    // the player throws a move.
    if (this.reboundElapsed >= Tuning.reboundMaxDuration) {
      this.endRebound();
    }
  }

  /** Returns control after a rope run, preserving momentum. */
  private endRebound(): void {
    this.state = "locomotion";
    this.moveDirection.copyFrom(this.reboundDirection);
    // Speed is left as-is so control resumes mid-stride; normal acceleration
    // eases it to whatever the player is now asking for.
  }

  /**
   * Works out where the character is heading this frame, writing into
   * `moveDirection`. Returns false when they should stand still.
   *
   * A `default` run ignores direction input entirely and heads wherever the
   * character faces, which is also what keeps them going the other way after
   * the ropes turn them around.
   */
  private resolveDirection(runMode: RunMode): boolean {
    if (runMode === "default") {
      this.defaultRunDirection(this.moveDirection);
      return true;
    }

    if (this.input.hasMovement) {
      // A diagonal aims at that corner of the ring from wherever he stands,
      // rather than travelling on a fixed 45 degrees.
      if (this.diagonalToCorner(this.moveDirection)) return true;

      // Camera-relative, so "W" is always away from the camera.
      this.moveDirection.set(0, 0, 0);
      this.moveDirection.addInPlace(this.forward.scale(this.input.vertical));
      // `right` is Up x forward, which is screen-right, and `horizontal` is
      // +1 for D. No negation: that is what had left and right swapped.
      this.moveDirection.addInPlace(this.right.scale(this.input.horizontal));
      if (this.moveDirection.lengthSquared() > 1e-6) {
        this.moveDirection.normalize();
        return true;
      }
    }

    // A directed run outlives its direction key: Shift alone keeps them going
    // until both are released.
    if (runMode === "directed") {
      this.defaultRunDirection(this.moveDirection);
      return true;
    }

    this.moveDirection.set(0, 0, 0);
    return false;
  }

  /**
   * Resolves a diagonal press into a heading toward that corner of the ring.
   *
   * Up+Right aims at the northeast post, Down+Left at the southwest, and so
   * on, from wherever the wrestler currently stands - so a diagonal always
   * takes him to the corner rather than off at a fixed 45 degrees.
   *
   * Returns false for single-axis input, or when he is already on the corner.
   */
  private diagonalToCorner(out: Vector3): boolean {
    const h = this.input.horizontal;
    const v = this.input.vertical;
    if (h === 0 || v === 0 || !this.bounds) return false;

    // The camera is fixed and axis-aligned, so screen right is +x and screen
    // up is +z.
    const cornerX = h > 0 ? this.bounds.maxX : this.bounds.minX;
    const cornerZ = v > 0 ? this.bounds.maxZ : this.bounds.minZ;

    out.set(cornerX - this.root.position.x, 0, cornerZ - this.root.position.z);
    if (out.lengthSquared() < 1e-4) return false;
    out.normalize();
    return true;
  }

  /** Where a run with no direction input goes: straight at the opponent. */
  private defaultRunDirection(out: Vector3): void {
    if (this.directionToOpponent(out)) return;
    out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /**
   * Unit vector from here to the opponent. False when there is no opponent,
   * or the two are standing on top of each other.
   */
  private directionToOpponent(out: Vector3): boolean {
    const target = this.opponentPosition?.();
    if (!target) return false;

    out.set(
      target.x - this.root.position.x,
      0,
      target.z - this.root.position.z
    );
    if (out.lengthSquared() < 1e-6) return false;
    out.normalize();
    return true;
  }

  private move(dt: number): void {
    // Build a camera-relative basis flattened onto the ground plane, so "W"
    // always means "away from the camera" regardless of where it is orbiting.
    this.camera.getDirectionToRef(Vector3.Forward(), this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSquared() < 1e-6) {
      this.forward.set(0, 0, 1);
    }
    this.forward.normalize();
    Vector3.CrossToRef(Vector3.Up(), this.forward, this.right);
    this.right.normalize();

    // The top-rope sequence drives its own position in all three axes and is
    // deliberately not clamped or gravity-affected: he is off the mat.
    if (this.state === "climbing") {
      this.advanceClimb(dt);
      return;
    }
    if (this.state === "perched") {
      this.advancePerch();
      return;
    }
    if (this.state === "diving") {
      this.advanceDive(dt);
      return;
    }

    // Against the ropes: position is driven entirely by the rope give, and
    // deliberately not clamped, so he can lean out past the boundary with
    // them.
    if (this.state === "ropeHit") {
      this.advanceRopeHit(dt);
      this.applyGravity(dt);
      return;
    }

    // While the ropes are throwing them, the wrestler runs on rails.
    if (this.state === "rebound") {
      this.advanceRebound(dt);
      this.applyGravity(dt);
      this.clampToGround();
      return;
    }

    // Attacks and guards root the character; a roll drives itself.
    const canSteer =
      this.state !== "attack" && this.state !== "block" && this.state !== "roll";

    const runMode = this.input.runMode;
    const wantsMove = canSteer && this.resolveDirection(runMode);

    const targetSpeed = wantsMove
      ? runMode !== "none"
        ? Tuning.runSpeed
        : Tuning.walkSpeed
      : 0;

    this.speed = Scalar.MoveTowards(
      this.speed,
      targetSpeed,
      Tuning.acceleration * dt
    );

    this.updateFacing(runMode, wantsMove, dt);

    if (this.speed > 0) {
      const stride = this.speed * dt;
      this.root.position.x += this.moveDirection.x * stride;
      this.root.position.z += this.moveDirection.z * stride;
    }

    if (this.state === "roll") {
      this.advanceRoll(dt);
    }

    this.applyGravity(dt);
    this.clampToGround();
  }

  /**
   * Points the wrestler where he should be looking.
   *
   * Running is the only thing that turns him away from his opponent: then he
   * faces where he is going. Otherwise he squares up to them and stays that
   * way, walking in any direction while never turning his back - which is how
   * wrestlers circle each other.
   */
  private updateFacing(runMode: RunMode, wantsMove: boolean, dt: number): void {
    let targetYaw: number | null = null;

    if (runMode !== "none" && wantsMove) {
      targetYaw = Math.atan2(this.moveDirection.x, this.moveDirection.z);
    } else if (this.directionToOpponent(this.facingScratch)) {
      targetYaw = Math.atan2(this.facingScratch.x, this.facingScratch.z);
    } else if (wantsMove) {
      // No opponent in the ring: fall back to facing the way he travels.
      targetYaw = Math.atan2(this.moveDirection.x, this.moveDirection.z);
    }

    if (targetYaw === null) return;

    this.yaw = this.approachAngle(this.yaw, targetYaw, Tuning.turnSpeed * dt);
    this.root.rotation.y = this.yaw;
  }

  private applyGravity(dt: number): void {
    if (this.state === "jump" || this.root.position.y > 0) {
      this.verticalVelocity += Tuning.gravity * dt;
      this.root.position.y += this.verticalVelocity * dt;
    }

    // Touchdown.
    if (this.root.position.y <= 0) {
      this.root.position.y = 0;
      this.verticalVelocity = 0;

      if (this.state === "jump" && this.jumpPhase !== "land") {
        this.jumpPhase = "land";
        this.animations.play(Anim.JUMP_LAND, {
          loop: false,
          restart: true,
          onEnd: () => {
            if (this.state === "jump") this.state = "locomotion";
          },
        });
      }
    }
  }

  /**
   * Keeps the wrestler inside the ropes, and turns a running collision into a
   * rope rebound: the ropes throw them back across the ring.
   */
  private clampToGround(): void {
    if (!this.bounds) {
      const limit = Tuning.groundSize / 2 - 0.5;
      this.root.position.x = Scalar.Clamp(this.root.position.x, -limit, limit);
      this.root.position.z = Scalar.Clamp(this.root.position.z, -limit, limit);
      return;
    }

    const { minX, maxX, minZ, maxZ } = this.bounds;
    const pos = this.root.position;

    // Which rope, if any, was hit this frame.
    let hitX = 0;
    let hitZ = 0;
    if (pos.x < minX) hitX = 1;
    else if (pos.x > maxX) hitX = -1;
    if (pos.z < minZ) hitZ = 1;
    else if (pos.z > maxZ) hitZ = -1;

    pos.x = Scalar.Clamp(pos.x, minX, maxX);
    pos.z = Scalar.Clamp(pos.z, minZ, maxZ);

    if (!hitX && !hitZ) return;

    // Only a run touches the ropes at all. Walking leaves them completely
    // still - they are scenery until you run at them.
    const canRebound = this.state === "locomotion" || this.state === "rebound";
    if (!this.input.isRunning || !canRebound) return;

    // Arriving at a corner post means climbing it, not bouncing off it.
    const corner = this.cornerAt(pos.x, pos.z);
    if (corner) {
      this.startClimb(corner);
      return;
    }

    this.startRopeHit(hitX, hitZ);
  }

  /**
   * Returns the corner post being run into, or null if this is a plain rope
   * contact. A corner only counts when the wrestler is near it on both axes,
   * so running the length of a rope still rebounds normally.
   */
  private cornerAt(x: number, z: number): Vector3 | null {
    if (!this.bounds) return null;
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const r = Tuning.cornerRadius;

    const nearX = Math.abs(x - minX) < r ? minX : Math.abs(x - maxX) < r ? maxX : null;
    const nearZ = Math.abs(z - minZ) < r ? minZ : Math.abs(z - maxZ) < r ? maxZ : null;
    if (nearX === null || nearZ === null) return null;

    return new Vector3(nearX, 0, nearZ);
  }

  /**
   * Starts scaling the corner post. He is carried from wherever he met the
   * corner up onto the top rope, turning to face the ring as he goes.
   */
  private startClimb(corner: Vector3): void {
    this.state = "climbing";
    this.climbElapsed = 0;
    this.speed = 0;

    this.climbFrom.copyFrom(this.root.position);
    this.climbTo.set(
      corner.x,
      (this.bounds?.topRopeY ?? 1.4) + Tuning.perchFootOffset,
      corner.z
    );

    // Perched wrestlers face the ring, not the crowd.
    const inward = this.ringCentreDirection(corner);
    this.perchYaw = Math.atan2(inward.x, inward.z);

    this.animations.play(Anim.CLIMB, { loop: false, restart: true });
  }

  /** Carries him up the post, handing over to the perch at the top. */
  private advanceClimb(dt: number): void {
    this.climbElapsed += dt;
    const t = Math.min(this.climbElapsed / Tuning.climbDuration, 1);

    // Ease out so he settles onto the rope rather than snapping to it.
    const eased = 1 - (1 - t) * (1 - t);
    Vector3.LerpToRef(this.climbFrom, this.climbTo, eased, this.root.position);

    this.yaw = this.approachAngle(
      this.yaw,
      this.perchYaw,
      Tuning.ropeTurnSpeed * dt
    );
    this.root.rotation.y = this.yaw;

    if (t >= 1) {
      this.state = "perched";
      this.setFacing(this.perchYaw);
      this.animations.play(Anim.PERCH, { loop: true });
    }
  }

  /**
   * Holds him on the top rope for as long as the player keeps holding what
   * got him there. Letting go launches the dive.
   */
  private advancePerch(): void {
    this.root.position.copyFrom(this.climbTo);

    // Either the run modifier or a direction keeps him up there.
    if (this.input.isRunning || this.input.hasMovement) return;

    this.startDive();
  }

  /** Leaves the top rope on a fixed arc into the middle of the ring. */
  private startDive(): void {
    this.state = "diving";
    this.divePhase = "air";
    this.diveElapsed = 0;
    this.diveFrom.copyFrom(this.root.position);

    // Land inside the ring, clamped so a dive never ends outside the ropes.
    const inward = this.ringCentreDirection(this.diveFrom);
    const target = this.diveFrom.add(inward.scale(Tuning.diveDistance));
    if (this.bounds) {
      target.x = Scalar.Clamp(target.x, this.bounds.minX, this.bounds.maxX);
      target.z = Scalar.Clamp(target.z, this.bounds.minZ, this.bounds.maxZ);
    }
    this.diveTo.set(target.x, 0, target.z);

    this.setFacing(Math.atan2(inward.x, inward.z));
    this.animations.play(Anim.DIVE_START, {
      loop: false,
      restart: true,
      onEnd: () => {
        if (this.state === "diving") {
          this.animations.play(Anim.DIVE_AIR, { loop: true });
        }
      },
    });
  }

  /** Flies the arc, then lands him on his feet back in the ring. */
  private advanceDive(dt: number): void {
    // Stay in the dive state through the landing. Handing back to locomotion
    // any earlier would let updateAnimation cut straight to idle.
    if (this.divePhase === "landing") return;

    this.diveElapsed += dt;
    const t = Math.min(this.diveElapsed / Tuning.diveDuration, 1);

    this.root.position.x = Scalar.Lerp(this.diveFrom.x, this.diveTo.x, t);
    this.root.position.z = Scalar.Lerp(this.diveFrom.z, this.diveTo.z, t);
    // Parabola: rises off the rope, then falls to the mat.
    const base = Scalar.Lerp(this.diveFrom.y, this.diveTo.y, t);
    this.root.position.y = base + Math.sin(Math.PI * t) * Tuning.diveArcHeight;

    if (t >= 1) {
      this.root.position.y = 0;
      this.speed = 0;
      this.verticalVelocity = 0;
      this.divePhase = "landing";
      this.animations.play(Anim.DIVE_LAND, {
        loop: false,
        restart: true,
        onEnd: () => {
          if (this.state === "diving") this.state = "locomotion";
        },
      });
    }
  }

  /** Unit vector from a point toward the middle of the ring. */
  private ringCentreDirection(from: Vector3): Vector3 {
    const centre = this.bounds
      ? new Vector3(
          (this.bounds.minX + this.bounds.maxX) / 2,
          0,
          (this.bounds.minZ + this.bounds.maxZ) / 2
        )
      : Vector3.Zero();
    const dir = centre.subtract(from);
    dir.y = 0;
    return dir.lengthSquared() > 1e-6 ? dir.normalize() : new Vector3(0, 0, 1);
  }

  /**
   * Begins the beat against the ropes: the wrestler spins so his back takes
   * them, presses in as they stretch, and is then thrown off. Only after this
   * does the run in the opposite direction start.
   */
  private startRopeHit(hitX: number, hitZ: number): void {
    this.computeReboundDirection(hitX, hitZ);

    this.state = "ropeHit";
    this.ropeHitElapsed = 0;
    this.speed = 0;

    // Outward is the opposite of the rebound heading: it points into the
    // ropes, which is the way his back and the ropes both give.
    this.ropeOutward.copyFrom(this.reboundDirection).scaleInPlace(-1);
    // Anchor where he met the ropes, so the give can push out and settle back.
    this.ropeAnchor.copyFrom(this.root.position);

    // Turn to put his back into the ropes.
    this.ropeTargetYaw = Math.atan2(
      this.reboundDirection.x,
      this.reboundDirection.z
    );

    // Load the ropes. Their spring is unchanged; only the beat is new.
    if (this.ropes) {
      if (hitX) this.ropes.impact(hitX < 0 ? "+x" : "-x", Tuning.reboundSpeed);
      if (hitZ) this.ropes.impact(hitZ < 0 ? "+z" : "-z", Tuning.reboundSpeed);
      this.ropeSide = hitZ
        ? hitZ < 0
          ? "+z"
          : "-z"
        : hitX < 0
          ? "+x"
          : "-x";
    }

    this.animations.play(Anim.ROPE_HIT, { loop: false, restart: true });
  }

  /**
   * Rides out the beat: spin the back into the ropes, sink with them as they
   * stretch, then hand over to the run away.
   */
  private advanceRopeHit(dt: number): void {
    // Letting go of the run drops the whole exchange, same as a rope run.
    if (!this.input.isRunning) {
      this.state = "locomotion";
      return;
    }

    this.ropeHitElapsed += dt;

    // Whip round so the ropes are taken back-first.
    this.yaw = this.approachAngle(
      this.yaw,
      this.ropeTargetYaw,
      Tuning.ropeTurnSpeed * dt
    );
    this.root.rotation.y = this.yaw;

    // Ride the ropes outward as they load, and back in as they recover.
    const bow = this.ropeSide ? this.ropes?.displacementOf(this.ropeSide) ?? 0 : 0;
    const give = Math.max(0, Math.min(bow, Tuning.ropeGive));
    this.root.position.x = this.ropeAnchor.x + this.ropeOutward.x * give;
    this.root.position.z = this.ropeAnchor.z + this.ropeOutward.z * give;

    if (this.ropeHitElapsed >= Tuning.ropeHitDuration) {
      this.launchFromRopes();
    }
  }

  /** The ropes let go: run off in the reflected direction. */
  private launchFromRopes(): void {
    this.state = "rebound";
    this.reboundElapsed = 0;
    this.speed = Tuning.reboundSpeed;
    // Snap back to where he met the ropes. Launching from outside the play
    // area would otherwise re-trigger the contact test on the next frame.
    this.root.position.x = this.ropeAnchor.x;
    this.root.position.z = this.ropeAnchor.z;
    this.yaw = this.ropeTargetYaw;
    this.root.rotation.y = this.yaw;
    this.animations.play(Anim.RUN, { loop: true });
  }

  /**
   * Reflects the incoming direction about the rope struck, so hitting the
   * north ropes sends them south, and a corner sends them back the way they
   * came. Writes into `reboundDirection`.
   */
  private computeReboundDirection(hitX: number, hitZ: number): void {
    const source =
      this.state === "rebound" ? this.reboundDirection : this.moveDirection;

    // Reflect only the axis that was struck; the other is preserved so a
    // glancing run comes off the ropes at an angle.
    const x = hitX !== 0 ? Math.abs(source.x) * hitX : source.x;
    const z = hitZ !== 0 ? Math.abs(source.z) * hitZ : source.z;

    this.reboundDirection.set(x, 0, z);
    if (this.reboundDirection.lengthSquared() < 1e-6) {
      // Struck the ropes dead-on with no lateral component: push straight off.
      this.reboundDirection.set(hitX, 0, hitZ);
    }
    this.reboundDirection.normalize();
  }

  /** Selects the locomotion clip; attacks and jumps drive their own. */
  private updateAnimation(): void {
    if (this.state !== "locomotion") return;

    if (this.speed < 0.1) {
      this.animations.play(Anim.IDLE, { loop: true });
    } else if (this.speed > (Tuning.walkSpeed + Tuning.runSpeed) / 2) {
      this.animations.play(Anim.RUN, { loop: true });
    } else {
      this.animations.play(Anim.WALK, { loop: true });
    }
  }

  /** Moves `from` toward `to` by at most `maxDelta`, wrapping at +/-PI. */
  private approachAngle(from: number, to: number, maxDelta: number): number {
    let diff = (to - from) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= maxDelta) return to;
    return from + Math.sign(diff) * maxDelta;
  }
}
