# Damage System

### _Authoritative Mechanics Based on AKI/VPW2 Behavior_

This section documents how the AKI Engine / VPG Engine models wrestler health, limb stamina, move parameters, and damage calculations. These systems are derived from reverse‑engineered VPW2 logic and are reproduced here with full accuracy.

# 1. Health System

## 1.1 Current Health

Every wrestler begins a match with **Current Health = 255**. This value decreases when taking damage and regenerates slowly when idle.

> “Each wrestler has a hidden Current Health bar that starts at 255 and is depleted… This Current Health bar will recover (to a certain extent) if you stand around.”

Current Health cannot exceed Max Health.

## 1.2 Max Health

Max Health also begins at **255**, but unlike Current Health, it:

- **Never regenerates**
- **Never drops below 64**
- **Decreases at 25% of the Main Health Damage received**

$$
\text{MaxHealthDamage} = \left\lfloor \frac{\text{MainHealthDamage}}{4} \right\rfloor
$$


> “There is also a hidden Max Health bar that also starts at 255 (it never drops below 64).”

If Current Health is above Max Health after Max Health is reduced, it is forced down to match.

## 1.3 Health Example

A Pendulum Backbreaker might deal:

- **20 Current Health damage** → 255 → 235
- **5 Max Health damage** → 255 → 250

Current Health will regenerate back up to 250, but no higher.

# 2. Joint Stamina System

## 2.1 Limb Categories

Each wrestler has **five Joint Stamina pools**, each starting at **50.0**:

- **Head** (neck, jaw)
- **Body** (sternum, abdomen, spine, lower back)
- **Arms** (shoulder, elbow, wrist)
- **Legs** (hip, knee, ankle, toe)
- **Flying** (abstract “aerial stamina”)

> Joint Stamina bars start at 50.0 and reduce down to zero. Joint Stamina bars never recover.

Joint Stamina uses floating‑point values (e.g., 48.7).

## 2.2 Limb Damage Visual Cues

When any non‑Flying limb drops below **15.0**, the wrestler holds that limb.

$$
\text{JointStamina} < 15.0
$$

Only one limb can be held at a time; the engine tracks the most damaged limb.

## 2.3 Movement Penalty

Leg stamina affects movement speed:

$$
\text{EffectiveSpeed} = f(\text{LegStamina})
$$
Where $f$ is a non‑linear slowdown curve.

# 3. Move Parameters

Each move defines:

- **Base Health Damage**
- **Attack Parameter** (Head / Body / Arm / Leg / Flying)
- **Defense Parameter**
- **Joint Stamina Damage** (per limb)


Each move in the game has a detailed set of stats/parameters.

Moves that repeat (submissions, 10‑count punches) have **two entries**:

- Initial move
- Repeating move (per wrench/pulse)

# 4. Main Health Damage Calculation

Main Health Damage is computed in **four factors**, then applied to Current and Max Health.

Let:

- $D = \text{Base Health Damage}$
- $S = \text{Joint Stamina for the relevant limb}$
- $A = \text{Attacker’s Parameter}$
- $B = \text{Defender's Parameter}$
- $\Delta \text{Spirit} = \text{Spirit}_1 - \text{Spirit}_2$

## 4.1 Factor 1 — Limb‑Stamina‑Adjusted Base Damage

Formula:

$$
\text{Factor1} = \left\lfloor (S + 50) \cdot D \cdot 0.01 \right\rfloor
$$
So, Factor 1 equals (Joint Stamina + 50) times Base Health Damage times 0.01.

Rounded down.

If attacker is in **Special**, Joint Stamina is treated as **50.0**.

$$
S = 50
$$
The game adds 50 to that Joint Stamina value, then multiplies it by the base Health damage, then multiplies that by 0.01.

## 4.2 Factor 2 — Parameter Bonus

$$
\text{Factor2} = 
\left\lfloor 
\max(0, A - B) \cdot D \cdot 0.1
\right\rfloor
$$

Rounded down.

This Parameter Bonus can never be a negative number.

### 📌 Relationship to Wrestler Parameters

The attacker’s **Offense Parameter** and the defender’s **Defense Parameter** directly feed into **Factor 2 (Parameter Bonus)** of the damage formula. These values come from the wrestler’s parameter profile described in [[Parameters.md]] **Parameters.md**.

Higher Offense increases damage, higher Defense reduces it, and equal values cancel each other out.

For full details on how these parameters are assigned and what they represent, see: **➡️** `Parameters.md` **— Parameter System Overview**


## 4.3 Factor 3 — Spirit Bonus

$$
\text{Factor3} = 
\left\lfloor 
\Delta \text{Spirit} \cdot 0.05
\right\rfloor
$$
Max bonus = 5.

For every 20 points of Spirit advantage, attacker gets one additional point of damage.

## 4.4 Factor 4 — Special Bonus

Let:

$$
T = \text{Factor1} + \text{Factor2} + \text{Factor3}
$$
If attacker is in Special:

$$
\text{MainHealthDamage} = \left\lfloor T \cdot 1.2 \right\rfloor
$$
Else:

$$
\text{MainHealthDamage} = T
$$


# 5. Applying Main Health Damage

After computing Main Health Damage:

### 5.1 Technical Moves (Flag 0x08)

Moves with byte `0x1C = 08` **do not reduce Current Health**, but still:

- Log damage
- Reduce Max Health
- Count toward damage tracking

$$
\text{CurrentHealthDamage} = 0
$$

If the game sees a 08 value here, it skips, subtracting from the Current Health bar.

But:

$$
\text{MaxHealthDamage} = \left\lfloor \frac{\text{MainHealthDamage}}{4} \right\rfloor
$$
Still applies.

### 5.2 Normal Moves

$$
\text{CurrentHealth} \mathrel{-}= \text{MainHealthDamage}
$$

- Subtract Main Health Damage from Current Health
- Subtract **¼** of that (rounded down) from Max Health
- Log damage in the 30‑second damage log

$$
\text{MaxHealth} \mathrel{-}= \left\lfloor \frac{\text{MainHealthDamage}}{4} \right\rfloor
$$

# 6. Joint Stamina Damage

## 6.1 Normal Moves

Simply subtract the move’s Joint Stamina values from the corresponding limbs.

$$
\text{JointStamina}_i \mathrel{-}= \text{MoveDamage}_i
$$
## 6.2 Repeating Moves (Submissions, etc.)

Repeating phases are modified by **Submission Skill** (more accurately “Joint Technique Skill”).  This parameter affects ALL repeating moves, not just submission moves.

Let:
- $( M_i )$ be the move’s base Joint Stamina damage for limb $( i )$
- $(B)$ be the Submission Skill bonus/penalty.

$$
\text{JointStaminaDamage}_i = M_i + B
$$

### Submission Skill Matrix

(Attacker vs Defender)

Where $( B )$ is taken from the matrix:

| P1 ↓ / P2 → | Novice | Normal | Expert |
|-------------|--------|--------|--------|
| **Novice**  | 0      | -0.3   | -0.5   |
| **Normal**  | +0.3   | 0      | -0.3   |
| **Expert**  | +1.0   | +0.5   | 0      |

These bonuses/penalties apply **per wrench/pulse** to **each affected limb**.

# 7. Worked Example (Figure Four Leglock)

### Initial Application

- Limb‑adjusted damage = 4

$$
\text{Factor1} = \left\lfloor (35 + 50) \cdot 5 \cdot 0.01 \right\rfloor = 4
$$

- Parameter bonus = 0

$$
\text{Factor2} = 0
$$

- Spirit bonus = 3

$$
\text{Factor3} = \left\lfloor 64 \cdot 0.05 \right\rfloor = 3
$$

- Main Health Damage = 8

$$
T = 4 + 0 + 3 = 7
$$

$$
\text{MainHealthDamage} = \left\lfloor 7 \cdot 1.2 \right\rfloor = 8
$$

- Joint Stamina damage = **3 Leg**, **3 Flying**

$$
\text{Leg} = 3,\quad \text{Flying} = 3
$$

### Each Wrench

- Limb‑adjusted damage = 1
$$
\text{Factor1} = \left\lfloor (35 + 50) \cdot 2 \cdot 0.01 \right\rfloor = 1
$$
- Spirit bonus = 3
$$
\text{Factor3} = 3
$$
- Special bonus → total = **4**
$$
T = 1 + 0 + 3 = 4
$$
$$
\text{MainHealthDamage} = \left\lfloor 4 \cdot 1.2 \right\rfloor = 4
$$
- Submission Skill bonus = **+1 Leg**, **+1 Flying**
$$
B = +1.0
$$
- Final Joint Stamina damage = **4 Leg**, **4 Flying**
$$
\text{Leg} = 2 + 1 = 4,\quad \text{Flying} = 2 + 1 = 4
$$

So, each rep/wrench does 4 Current Health Damage, 1 Max Health Damage, 4 Leg Joint Stamina Damage and 4 Flying Joint Stamina Damage.

# 8. Summary of Engine Behavior

- Health and stamina systems are **separate but interlinked**
- Joint Stamina directly affects move damage output
- Spirit and Special mode provide dynamic combat swings
- Technical moves deal **no Current Health damage** but still degrade Max Health
- Repeating moves scale with Submission Skill
- Limb damage affects animations and movement speed
