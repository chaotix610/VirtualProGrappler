# VPG Rig 2.0

The **VPG Rig 2.0** is the character skeleton rig used by Virtual Pro Grappler.

## Overview

The VPG Rig 2.0 is a modern game-oriented humanoid skeletal hierarchy, using the ActionForge/Quaternius template, designed for:

- Character animation
- Animation retargeting
- Humanoid character creation
- Weapon handling
- IK-based posing
- Game engine interoperability

The rig uses a naming convention similar to Unreal Engine:

```text
upperarm_l
lowerarm_l
thigh_r
calf_r
```

rather than Mixamo's:

```text
LeftArm
LeftForeArm
RightUpLeg
```

The rig includes:

- Root bone
- Pelvis root
- 3-bone spine
- Neck and head
- Full finger chains
- Leg and foot chains
- IK helper bones
- Weapon attachment helpers
- Offhand attachment helpers

---

# Verified Rig Data

Originally verified against the pre-reorganization animation exports (5,789 GLBs). The runtime clips now live in `public/assets/animations/`. The original verification found an identical bone set and parenting in every file.

| Property | Value |
|----------|-------|
| Total bones (skin joints) | 71 |
| Bones with vertex weights | 52 |
| Bones without vertex weights | 19 (`root`, 4 `ik_*`, 2 `socket_*`, 10 finger leaves, 2 ball leaves) |
| Scene root object | `Armature` |
| Skinned meshes | `Mannequin_1`, `Mannequin_2` (children of `Armature`) |
| Facial bones | None |

---

# Skeleton Hierarchy

```text
Armature                          (object node, not a bone)
├─ Mannequin_1                    (skinned mesh)
├─ Mannequin_2                    (skinned mesh)
└─ root
   ├─ ik_hand_root
   │  └─ ik_hand_gun
   │     ├─ ik_hand_l
   │     └─ ik_hand_r
   │
   ├─ socket_offhand
   │  └─ socket_offhand_grip
   │
   └─ pelvis
      ├─ spine_01
      │  └─ spine_02
      │     └─ spine_03
      │        ├─ clavicle_l
      │        │  └─ upperarm_l
      │        │     └─ lowerarm_l
      │        │        └─ hand_l
      │        │           ├─ index_01_l
      │        │           │  └─ index_02_l
      │        │           │     └─ index_03_l
      │        │           │        └─ index_04_leaf_l
      │        │           ├─ middle_01_l
      │        │           │  └─ middle_02_l
      │        │           │     └─ middle_03_l
      │        │           │        └─ middle_04_leaf_l
      │        │           ├─ pinky_01_l
      │        │           │  └─ pinky_02_l
      │        │           │     └─ pinky_03_l
      │        │           │        └─ pinky_04_leaf_l
      │        │           ├─ ring_01_l
      │        │           │  └─ ring_02_l
      │        │           │     └─ ring_03_l
      │        │           │        └─ ring_04_leaf_l
      │        │           └─ thumb_01_l
      │        │              └─ thumb_02_l
      │        │                 └─ thumb_03_l
      │        │                    └─ thumb_04_leaf_l
      │        │
      │        ├─ clavicle_r
      │        │  └─ upperarm_r
      │        │     └─ lowerarm_r
      │        │        └─ hand_r
      │        │           ├─ index_01_r
      │        │           │  └─ index_02_r
      │        │           │     └─ index_03_r
      │        │           │        └─ index_04_leaf_r
      │        │           ├─ middle_01_r
      │        │           │  └─ middle_02_r
      │        │           │     └─ middle_03_r
      │        │           │        └─ middle_04_leaf_r
      │        │           ├─ pinky_01_r
      │        │           │  └─ pinky_02_r
      │        │           │     └─ pinky_03_r
      │        │           │        └─ pinky_04_leaf_r
      │        │           ├─ ring_01_r
      │        │           │  └─ ring_02_r
      │        │           │     └─ ring_03_r
      │        │           │        └─ ring_04_leaf_r
      │        │           └─ thumb_01_r
      │        │              └─ thumb_02_r
      │        │                 └─ thumb_03_r
      │        │                    └─ thumb_04_leaf_r
      │        │
      │        └─ neck_01
      │           └─ Head
      │
      ├─ thigh_l
      │  └─ calf_l
      │     └─ foot_l
      │        └─ ball_l
      │           └─ ball_leaf_l
      │
      └─ thigh_r
         └─ calf_r
            └─ foot_r
               └─ ball_r
                  └─ ball_leaf_r
```

The hands have only their five finger chains as children. The IK and socket bones are not parented to the hands; they hang directly off `root` (see below).

---

# Bone Groups

## Root

### root

Top-level bone for the entire skeleton. Parent of three branches:

- `pelvis` (the body)
- `ik_hand_root` (hand IK chain)
- `socket_offhand` (offhand socket chain)

`root` has no vertex weights. In the retargeted animations in `converted/`, `root` is never animated: it stays at rest in every clip, and world-space travel is carried by `pelvis` instead (see [Converted Animation Conventions](#converted-animation-conventions)).

---

### pelvis

Primary body root.

All deforming chains originate from this bone:

- Spine
- Left leg
- Right leg

The IK and socket chains do not; they are siblings of `pelvis` under `root`.

---

# Spine

```text
spine_01
└─ spine_02
   └─ spine_03
```

Three-bone spine chain. `spine_03` is the parent of both clavicles and `neck_01`.

Benefits:

- Better torso bending
- Better twisting
- Cleaner animation retargeting

---

# Head

```text
neck_01
└─ Head
```

Note the capital `H` in `Head`; every other bone name is lowercase.

Provides:

- Head rotation
- Look direction
- Neck motion

No facial bones are implemented in the hierarchy.

---

# Arms

## Left Arm

```text
clavicle_l
└─ upperarm_l
   └─ lowerarm_l
      └─ hand_l
```

## Right Arm

```text
clavicle_r
└─ upperarm_r
   └─ lowerarm_r
      └─ hand_r
```

This is a common game-ready arm hierarchy.

---

# Fingers

Each finger uses four bones, suffixed `_l` or `_r` by side:

## Index Finger

```text
index_01
└─ index_02
   └─ index_03
      └─ index_04_leaf
```

## Middle Finger

```text
middle_01
└─ middle_02
   └─ middle_03
      └─ middle_04_leaf
```

## Ring Finger

```text
ring_01
└─ ring_02
   └─ ring_03
      └─ ring_04_leaf
```

## Pinky Finger

```text
pinky_01
└─ pinky_02
   └─ pinky_03
      └─ pinky_04_leaf
```

## Thumb

```text
thumb_01
└─ thumb_02
   └─ thumb_03
      └─ thumb_04_leaf
```

The `*_04_leaf` bones are terminal end bones and carry no vertex weights; they do not deform geometry.

---

# Legs

## Left Leg

```text
thigh_l
└─ calf_l
   └─ foot_l
      └─ ball_l
         └─ ball_leaf_l
```

## Right Leg

```text
thigh_r
└─ calf_r
   └─ foot_r
      └─ ball_r
         └─ ball_leaf_r
```

`ball_leaf_l` and `ball_leaf_r` are terminal end bones with no vertex weights.

Supports:

- Walking
- Running
- Jumping
- Foot roll animation

---

# IK Bones

```text
root
└─ ik_hand_root
   └─ ik_hand_gun
      ├─ ik_hand_l
      └─ ik_hand_r
```

This follows the Unreal Engine mannequin convention. None of these bones have vertex weights.

GLB cannot store IK constraints, so these are ordinary animated bones in the exported files, not live IK solvers. Their keyframes record where the hands are so that a game engine can drive its own IK from them. There are no foot IK bones.

## ik_hand_root

Child of `root` and parent of the hand IK chain. It is not animated in the reference idle and stays static in the converted clips.

---

## ik_hand_gun

Child of `ik_hand_root`. It is keyed to follow `hand_r`, so it marks the primary (right) hand's position and orientation for weapon handling.

Useful for:

- Rifles
- Pistols
- Melee weapons
- Tools

---

## ik_hand_l

Child of `ik_hand_gun`. Left-hand IK target; keyed to follow `hand_l`.

Used by:

- Two-handed weapon setups
- Pose editing
- Animation correction

---

## ik_hand_r

Child of `ik_hand_gun`. Right-hand IK target; keyed to stay near `hand_r` at an offset of roughly 7 cm.

Used similarly for right-hand constraints.

---

# Offhand System

```text
root
└─ socket_offhand
   └─ socket_offhand_grip
```

Neither bone has vertex weights.

## socket_offhand

Child of `root` (not of `hand_l`). It is keyed to follow `hand_l`, giving a secondary attachment socket for:

- Support hand placement
- Shield grips
- Two-handed weapon handling

---

## socket_offhand_grip

Child of `socket_offhand`. Refined grip position used during two-handed interactions; it stays near `hand_l` at an offset of roughly 7 cm.

---

# Converted Animation Conventions

These apply to the retargeted GLBs in `public/assets/animations/`. They describe how the pipeline animates the rig, not the rig itself.

- Every file contains one animation that keys all 71 bones (translation, rotation and scale).
- `root` stays at rest in every clip. World-space travel and height changes are on `pelvis`.
- Scale keys are always 1.0.
- The `ik_*` and `socket_*` bones are keyed to follow the hands, matching how the reference idle uses them.

---

# Comparison With Mixamo

| Feature | Mixamo | ActionForge |
|----------|----------|----------|
| Root Bone | Usually no | Yes |
| 3-Bone Spine | Yes | Yes |
| Full Fingers | Yes | Yes |
| IK Target Bones | No | Yes (hands only; no live IK in GLB) |
| Weapon Bones | No | Yes |
| Offhand Sockets | No | Yes |
| Modern Naming | No | Yes |
| Open Asset Ecosystem | Limited | Yes |

---

# Rig Characteristics

- Humanoid
- Full body
- Five-finger support
- 71 total bones, 52 of which deform the mesh
- Built-in weapon handling support
- Suitable for animation retargeting
- Suitable for game engines
- GLB-friendly structure
- Well suited for moddable game projects

---

# Recommended Uses

This rig is well suited for:

- Action games
- RPGs
- Adventure games
- Third-person shooters
- Fighting games
- Wrestling games
- Sandbox games
- Open-source game engines

Its built-in weapon sockets and IK target bones make it a stronger gameplay-oriented skeleton than a traditional Mixamo rig while remaining relatively simple to understand and extend.
