# Parameters

## Parameter System Overview

The Parameter system defines each wrestler’s **combat profile** by assigning numerical strengths and weaknesses across ten core attributes. These attributes govern how much damage a wrestler **inflicts** and **receives** in different move categories. The system ensures that every wrestler has a distinct playstyle while maintaining predictable balance rules for designers.

Each wrestler has:

- **5 Offensive Parameters** (damage output)
- **5 Defensive Parameters** (damage resistance)

All ten parameters use a **1–5 scale**, with a **global budget of 30 points** per wrestler. This creates meaningful tradeoffs: increasing one area requires reducing another.

## Design Goals

- **Differentiate wrestler archetypes** (striker, powerhouse, technician, high‑flyer, brawler).
- **Support authentic character representation** by matching stats to real‑world strengths.
- **Maintain balance** through a fixed point budget and capped attribute ranges.
- **Provide predictable tuning** for designers and modders.
- **Integrate cleanly with the damage, stun, and momentum systems.**

## Offensive Parameters

Offensive Parameters determine the **base damage multiplier** applied to moves that target specific body regions or categories. Higher values increase the damage output of moves in that category.

- **Head Offense** — Punches, DDTs, headlocks, head‑targeting grapples.
- **Body Offense** — Slams, suplexes, gutbusters, torso‑targeting grapples.
- **Arm Offense** — Clotheslines, arm wringers, hammerlocks, lariats.
- **Leg Offense** — Kicks, knee strikes, sweeps, leg‑targeting grapples.
- **Flying Offense** — Aerial attacks, springboards, top‑rope moves.

**Design Intent:** Offensive stats define what a wrestler _hurts opponents with most effectively_. A high‑flyer may have 4–5 in Flying Offense but only 1–2 in Body or Arms. A powerhouse may invert that pattern.

## Defensive Parameters

Defensive Parameters determine how much damage a wrestler **absorbs** from incoming attacks in each category. Higher values reduce damage taken.

- **Head Defense** — Resistance to head strikes and head‑targeting grapples.
- **Body Defense** — Resistance to slams, suplexes, and torso attacks.
- **Arm Defense** — Resistance to arm‑targeting moves.
- **Leg Defense** — Resistance to kicks and leg‑based grapples.
- **Flying Defense** — Resistance to aerial attacks.

**Design Intent:** Defensive stats define a wrestler’s **durability profile**. A tank‑style wrestler may have high Body and Head Defense, while a fragile high‑flyer may have lower values but compensate with speed and offense.

## Point Allocation Rules

- Each parameter must be between **1 and 5**.
- Total of all ten parameters must not exceed **30**.
- Designers may intentionally leave points unspent to represent wrestlers with clear weaknesses.
- Created wrestlers begin with **all values at 1**, leaving **20 assignable points**.

This system prevents extreme min‑maxing and ensures that every wrestler has at least baseline competency in all areas.

## Example: Character Parameter Profile

Using The Rock as a reference:

### Offensive Parameters

- Head: 2
- Body: 3
- Arms: 4
- Legs: 2
- Flying: 2 **Total Offense = 13**

### Defensive Parameters

- Head: 2
- Body: 3
- Arms: 2
- Legs: 2
- Flying: 2 **Total Defense = 11**

**Grand Total = 24** (6 points intentionally unspent)

This profile reinforces his identity as a **strong upper‑body striker** with solid durability but limited aerial ability.

## Designer Guidelines for Creating Wrestlers

- **Match stats to movesets.** A wrestler with many leg‑based attacks should not have low Leg Offense unless intentionally designed as a weak kicker.
- **Avoid symmetrical builds unless the character is meant to be generic.**
- **Use low stats deliberately** to create exploitable weaknesses and encourage matchup variety.
- **Ensure archetype clarity.**
    
    - Powerhouse → High Body/Arms Offense, High Body Defense
    - Technician → High Arms/Legs Offense, Balanced Defense
    - High‑Flyer → High Flying Offense, Low Body Defense
    - Brawler → High Head/Arms Offense, Moderate Defense

## Integration With Other Systems

The Parameter system interacts with:

- **Move Power Ratings** (base damage values)
- **Body Part Damage Tracking** (stun, limb weakening, KO thresholds)
- **Momentum/Spirit System** (how quickly finishers become available)
- **AI Behavior Profiles** (preferred move categories)

This ensures that parameters influence not only damage numbers but also pacing, match flow, and character identity.


Parameters are **numerical attributes (1–5)** assigned to each wrestler that determine:

- **How much damage a character's moves deal**
- **How much damage a character takes from attacks**
- **How quickly a character can pin or be pinned**
- **How effective a character's submissions are** (to a limited degree)

Parameters are divided into **Offense** and **Defense**, each with five body‑part categories:

- **Head**
- **Body**
- **Arms**
- **Legs**
- **Flying**

Each value ranges from **1 (weakest)** to **5 (strongest)**.

## What Parameters Do Not **Affect**

### **2.1 Damage Animations (Holding Body Parts)**

No matter the parameter values, wrestlers show damage animations (holding their head, etc.) **after the same number of hits**.

### **2.2 Countering / Blocking**

They do not effect the likelihood of blocking or countering a move.

### **2.3 Move Ratings**

Parameters do not change the _listed_ move rating—only the **effective damage**.

# **3. How Offensive Parameters Work**

## **3.1 Offense Applies to the Body Part** _**You Use**_**, Not the Part You Hit**

### **Example:**

- A move that uses **legs** (e.g., Big Boot, Wheel Kick) → uses **Leg Offense**
- A move that uses **arms** (e.g., Clothesline) → uses **Arm Offense**
- A move that uses **head** (e.g., Headbutt) → uses **Head Offense**

# **4. How Defensive Parameters Work**

Defense applies to **the body part being hit**.

### **Example:**

- A Clothesline hits the **head** → opponent’s **Head Defense** reduces damage
- A Splash hits the **body** → opponent’s **Body Defense** reduces damage
- A Leg Drop hits the **head** → opponent’s **Head Defense** applies

# **5. How Offense and Defense Interact**

The tests show a consistent rule:

## **5.1 A 5 Offense cancels a 5 Defense**

> “A 5 rated defensive parameter cancels out a 5 rated offensive.”

## **5.2 Higher Offense = Fewer Moves Needed to Pin**

> “A 5 rated offense parameter takes less hits to pin than a 1 rated parameter.”

## **5.3 Higher Defense = More Moves Needed to Pin**

> “The higher the defensive rating… the less damage they may take… or it will take more hits to get a pin over them.”

## 📌 How Parameters Feed Into the Damage Formula

The Offense and Defense values described in this document are used directly in the **Parameter Bonus** portion of the damage calculation. In the AKI/VPW2 system, the difference between:

- **Offense Parameter (body part used)**
- **Defense Parameter (body part hit)**

is applied mathematically as:

$$
Factor2=⌊max⁡(0,A−B)⋅D⋅0.1⌋
$$

This formula is documented in detail in: [move-damage](move-damage.md)**— Factor 2: Parameter Bonus**

# **6. Submissions: A Special Case**

Submissions behave differently from strikes and grapples.

## **6.1 Parameters** _**Do**_ **Affect Submissions — But Only Slightly**

> “Parameters do in fact have some baring on submissions.”

A higher **offensive parameter for the body part used in the submission** (e.g., Arms for an Armbar) reduces the number of attempts needed to tap someone out.

## **6.2 Submission Skill Has a Much Larger Effect**

> “The skill setting of submission also has an effect on how quick you can get a tap out… a higher parameter couldn’t beat a higher skill level.”

### **Hierarchy of Submission Influence**

1. **Submission Skill (Novice / Normal / Expert)**
2. **Offensive Parameter (body part used)**
3. **Defensive Parameter (body part targeted)** — minimal effect

## **6.3 Defense Parameter Has Almost No Effect on Submission Survival**

Test 12 shows:

> “You will submit just as quick with expert skill and 1 defense arm as… with expert skill and 5 defense arm.”

# **7. How to Assign Parameters for CAWs**

The document provides a practical method for designing balanced, realistic CAWs.

## **7.1 Use 3 as the “Average Wrestler” Baseline**

> “A wrestler with average abilities… would have all 3’s.”

## **7.2 Assign Offense Based on What Body Parts the Wrestler Uses**

Examples from the text:

- **High flyers** → high **Flying Offense**
- **Clothesline-heavy wrestlers** → high **Arm Offense**
- **Big boot / kicks** → high **Leg Offense**
- **Headbutt users** → high **Head Offense**

## **7.3 Assign Defense Based on Durability**

- If a wrestler is known for toughness → raise relevant defenses
- If they are fragile → lower them

## **7.4 Test Moves to Determine Their Attack Area**

> “Use the move… until he/she starts to hold a part of their body. That will be the area that is effected.”

If no damage animation appears after ~20 hits, the move is classified as **Flying**.

# **8. Summary of Proven Mechanics**

|Mechanic|Proven Effect?|Notes|
|---|---|---|
|Damage animations|❌ No|Always occur at same time|
|Pin difficulty|✔️ Yes|Higher Offense = fewer hits; Higher Defense = more hits|
|Move damage|✔️ Yes|Determined by Offense (used body part) vs Defense (targeted body part)|
|Submissions|✔️ Partial|Mostly determined by Submission Skill|
|Counters / reversals|❓ Unknown|Not proven|
|Move ratings|❌ No|Parameters don’t change listed move strength|

# **9. The Core Formula (Based on Tests)**

### **Effective Damage = Move Rating × (Offense – Defense Difference)**

Where:

- **Offense** = body part used
- **Defense** = body part hit
- **Equal values cancel out**
- **Each point of difference increases or decreases effective damage**

# **10. Parameter Interaction Charts**

## **10.1  Core Interaction Diagram**

```
┌──────────────────────────────┐
│   MOVE (from Move Database)  │
│  - Uses Body Part (Offense)  │
│  - Hits Body Area (Defense)  │
│  - Has Power Tier (F → S)    │
└───────────────┬──────────────┘
                │
                ▼
┌──────────────────────────────────────────────┐
│  OFFENSIVE PARAMETER (1–5)                   │
│  "What part of your wrestler is used"        │
│  e.g., Wheel Kick → Legs Offense             │
│  (Document: “Offensive parameters stand for  │
│   what part… is using to hit the opponent.”) │
└──────────────────────────────┬───────────────┘
                               │
                               ▼
                     DAMAGE CALCULATION
                               ▲
                               │
┌──────────────────────────────┴────────────────┐
│  DEFENSIVE PARAMETER (1–5)                    │
│  "What part of the opponent is being hit"     │
│  e.g., Wheel Kick hits Head → Head Defense    │
│  (Document: “Defense parameters… stand for    │
│   the area on your wrestler being attacked.”) │
└──────────────────────────────┬────────────────┘
                               │
                               ▼
                     EFFECTIVE DAMAGE

```

## **10.2 The Actual Damage Logic (Visual)**

```
Effective Damage =
   Move Power Tier
 × (Offense Parameter – Defense Parameter)
```

### Visual Scale

```
Offense 5 vs Defense 1 → +4 advantage (very high damage)
Offense 5 vs Defense 5 → 0 advantage (neutral)
Offense 1 vs Defense 5 → -4 disadvantage (very low damage)
```

## **10.3. How Move Database Data Fits Into the System**

The Move Database tells us:

- **Power Tier** (F, E, D, C, B, A, S, G)
- **Move Type** (Strike, Grapple, Submission, Pin)
- **Which body part is used** (inferred from animation category)
- **Which body area is hit** (from your testing method)

Example: _Giant Headbutt

From the Move Database:

```
Giant Headbutt | Power C | Bleed TRUE
```

From the Parameters document:

> “Headbutt… uses the head to deliver damage.”

So:

- **Offense Used:** Head Offense
- **Defense Targeted:** Head Defense
- **Power Tier:** C
- **Bleed:** TRUE (cosmetic)

## **10.4. Full Interaction Flowchart**

```
                 ┌──────────────────────────────┐
                 │  SELECTED MOVE               │
                 │  (Move Database)             │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Determine BODY PART USED     │
                 │  (Offense Parameter)          │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Determine AREA HIT           │
                 │  (Defense Parameter)          │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Apply MOVE POWER TIER        │
                 │  (F → S)                      │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Calculate EFFECTIVE DAMAGE   │
                 │  Offense – Defense            │
                 │  (Document: “Higher offense   │
                 │   takes less hits to pin.”)   │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Apply to PIN / KO / SUB      │
                 └──────────────────────────────┘
```

## **10.5. Interaction With Move Types**

### **10.5.1 Strikes & Grapples**

Use the **body part used** → Offense Use the **body part hit** → Defense

Example: **Climb Up Wheel Kick** (Move Database: Power D)

- Uses **Legs** → Leg Offense
    
- Hits **Head** → Head Defense
    

Your document confirms:

> “It took CAW A 6 wheel kicks… CAW B 9… Offensive parameters stand for what part… is using to hit.”

## **5.2 Pins**

Pins depend entirely on **damage dealt**.

> “A 5 rated offense parameter takes less hits to pin… A higher defensive parameter… takes more hits to get a pin.”

## **5.3 Submissions**




# **Parameter Interaction Chart

_A visual, authoritative reference for how Offensive/Defensive Parameters interact with Move Power, Move Type, and Submission Skill._

# **1. System Overview**

Parameters determine **effective damage**, **pin difficulty**, and **submission strength**.

They interact with moves using three inputs:

1. **Body Part Used** → Offense Parameter
2. **Body Area Hit** → Defense Parameter
3. **Move Power Tier** → Base Damage

Your document states:

> “Offensive parameters stand for what part of your wrestler’s body he/she is using to hit the opponent.” “Defense parameters… stand for the area on your wrestler being attacked.”

# **2. Core Interaction Diagram**

Code

```
┌──────────────────────────────┐
│        MOVE SELECTED         │
│  (from Move Database entry)  │
│  - Power Tier (F → S)        │
│  - Move Type (Strike/Grapple)│
│  - Animation Category         │
└───────────────┬──────────────┘
                │
                ▼
┌──────────────────────────────────────────────┐
│  BODY PART USED (Offense Parameter)          │
│  e.g., Wheel Kick → Legs Offense             │
└───────────────┬──────────────────────────────┘
                │
                ▼
        EFFECTIVE DAMAGE ENGINE
                ▲
                │
┌───────────────┴──────────────────────────────┐
│  BODY AREA HIT (Defense Parameter)            │
│  e.g., Wheel Kick hits Head → Head Defense    │
└───────────────────────────────────────────────┘
```

# **3. Effective Damage Formula (Visual)**

Code

```
Effective Damage =
   Move Power Tier
 × (Offense Parameter – Defense Parameter)
```

### Parameter Advantage Scale

Code

```
+4  (5 Offense vs 1 Defense) → Very high damage
+3
+2
+1
 0  (5 Offense vs 5 Defense) → Neutral
-1
-2
-3
-4  (1 Offense vs 5 Defense) → Very low damage
```

Your document confirms:

> “A 5 rated defensive parameter cancels out a 5 rated offensive.” “A 5 rated offense parameter takes less hits to pin than a 1 rated parameter.”

# **4. How Move Database Data Fits Into the System**

The Move Database provides:

- **Power Tier** (F, E, D, C, B, A, S, G)
    
- **Move Type** (Strike, Grapple, Submission, Pin)
    
- **Animation Category** (determines body part used)
    
- **Special Flags** (KO, Bleed, Submit, Pin)
    

### Example: _Climb Up Wheel Kick_

From Move Database:

Code

```
Climb Up Wheel Kick | Power D
```

From your parameter tests:

> “This is a leg move that attacks the opponent’s head.”

Thus:

- **Offense Used:** Legs
- **Defense Targeted:** Head
- **Power Tier:** D
- **Effective Damage:** D × (Leg Offense – Head Defense)

# **5. Full Interaction Flowchart**

Code

```
                 ┌──────────────────────────────┐
                 │  MOVE ENTRY (Move Database)  │
                 │  - Power Tier                │
                 │  - KO/Bleed/Submit/Pin       │
                 │  - Animation Category        │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Determine BODY PART USED     │
                 │  (Offense Parameter)          │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Determine AREA HIT           │
                 │  (Defense Parameter)          │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Apply MOVE POWER TIER        │
                 │  (F → S)                      │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Compute EFFECTIVE DAMAGE     │
                 │  Offense – Defense            │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  Apply to PIN / KO / SUB      │
                 └──────────────────────────────┘
```

# **6. Interaction by Move Type**

## **6.1 Strikes & Grapples**

- Use **body part used** → Offense
    
- Use **body part hit** → Defense
    
- Use **Move Power Tier** → Base damage
    

Your document:

> “The higher the defensive rating… the less damage they may take… or it will take more hits to get a pin.”

## **6.2 Pins**

Pins depend entirely on **damage accumulated**.

> “A 5 rated offense parameter takes less hits to pin… A higher defensive parameter… takes more hits to get a pin.”

## **6.3 Submissions**

Submissions use a different formula:

Code

```
Submission Strength =
   (Offense Parameter of body part used)
 + (Submission Skill Level)
```

Defense parameter has **minimal effect**:

> “You will submit just as quick with expert skill and 1 defense arm as… with 5 defense arm.”

# **7. Visual Summary Table**

|Component|Source|Controls|Notes|
|---|---|---|---|
|**Move Power Tier**|Move Database|Base damage|F weakest → S strongest|
|**Body Part Used**|Animation category|Offense Parameter|Determines damage output|
|**Area Hit**|Testing method|Defense Parameter|Determines damage reduction|
|**Offense Parameter (1–5)**|Wrestler data|Damage multiplier|Higher = more damage|
|**Defense Parameter (1–5)**|Wrestler data|Damage reduction|Higher = less damage|
|**Submission Skill**|Wrestler data|Submission strength|Stronger than parameters|
|**Bleed / KO Flags**|Move Database|Cosmetic / special|No effect on parameter math|
