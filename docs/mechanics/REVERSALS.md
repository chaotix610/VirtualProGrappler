#  🎮 **Grapple Reversal System (AKI‑Style)** 

This document describes how AKI wrestling games (WWF No Mercy, WM2K, VPW2, etc.) determine whether a **grapple move** is reversed. VPG Engine replicates this logic unless otherwise overridden.

##  **Overview**

A **Grapple Reversal** occurs when the **DEFENDER** successfully inputs a reversal command _before_ the **ATTACKER** performs a grapple move from a weak or strong lock‑up.

A “grapple move” refers to any move executed **after a successful grab**, using:

- **A**
- **B**
- **C‑Down** (Irish Whip Grapple)
- Any of the above + **D‑Pad direction**

This system applies to:

- Standing Grapples
- Ground Grapples (identical table)
- Turnbuckle Grapples
- Apron Grapples
- All AKI titles

## 🎮 **Reversal Input Window**

Once the DEFENDER has been grabbed:

- The DEFENDER must press **A, B, L, or R** **once** to trigger a reversal roll.
- Multiple taps do **not** increase the chance.
- The input must occur **before** the ATTACKER selects their grapple move.

##  🎲 **Base Reversal Probability (Spirit‑Based)**

If the DEFENDER inputs a reversal in time, the game:

1. Reads the DEFENDER’s **current Spirit value** (0–100).
2. Determines which **Spirit Band** applies.
3. Retrieves the corresponding **Reversal Probability** (0–1000 scale).
4. Pulls a **pre‑rolled RNG value** (0–999).
5. Compares:
    
    - If `RNG < ReversalProbability` → **Reversal succeeds**
    - Else → **Move executes normally**
        
6. Writes a “reversal flag” to the DEFENDER’s player map (offset `0x71`).
7. Generates a new RNG value to replace the one consumed.

##  **Default AKI Reversal Probability Table**

|DEFENDER Spirit|Reversal Probability|% Chance|
|---|---|---|
|100|500|50%|
|81–99|333|33.3%|
|61–80|250|25%|
|31–60|125|12.5%|
|11–30|62|6.2%|
|0–10|31|3.1%|

- Standing Grapples table: **80153610 → 80153626**
- Ground Grapples table: **801535F8**
- Values are **16‑bit integers**

## ⚠️ **Special! Mode Rules**

### **1. ATTACKER in Special!, DEFENDER NOT in Special!**

- **Reversals are disabled**
- No Spirit check
- No RNG roll

### **2. ATTACKER in Special!, DEFENDER ALSO in Special!**

- **Normal reversal logic applies**

$$
P = \text{SpiritBandProbability}
$$

- DEFENDER receives the standard Spirit‑based probability
- At 100 Spirit, this is a **50% chance**

### Why?

Many Special grapples lack reversal animations or reversal slots, so the engine disables reversals unless both wrestlers are in Special!.

# 💥 **Strong Grapple Health Scaling**

Strong Grapples (including Turnbuckle, Apron, etc.) apply **additional scaling** based on the DEFENDER’s Health.

### **Which Health Value Is Used?**

- If DEFENDER is **not** in Special!: use **Current Health**
- If DEFENDER **is** in Special!: use **Max Health**

### **Health Thresholds**

|DEFENDER Health|Effect on Reversal Chance|
|---|---|
|≥ 192 (≥ 75% health)|Multiply base probability ×4 (capped at 100%)|
|≥ 128 (≥ 50% health)|Multiply base probability ×2 (capped at 100%)|
||No multiplier|

### Multipliers

$$
P = P \times 4 \quad \text{(if Health} \ge 192\text{)}
$$

$$
P = P \times 2 \quad \text{(if Health} \ge 128\text{)}
$$

**Cap at**:

$$
P = \min(P, 100\%)
$$

### **Interpretation**

Strong Grapples are **much harder to land** early in the match.

## 🏋️ **Weight Factor Scaling**

Every wrestler has a **Weight Factor** parameter (0–7). Heavier wrestlers have higher values.

### Weight Adjustment Formula

$$
W = \left( \left\lfloor \frac{DEF\_Weight}{3} \right\rfloor - \left\lfloor \frac{ATK\_Weight}{3} \right\rfloor \right)
$$
#### If:
$$
W > 0
$$
#### Then:
$$
P = P \times 2
$$

### **How Weight Factor Affects Reversal Chance**

1. Take **ATTACKER Weight Factor**
2. Take **DEFENDER Weight Factor**
3. Divide each by **3** (integer division, round down)
4. Compute:

$$
\text{DEFENDER\_Result} - \text{ATTACKER\_Result}
$$

5. If the result is **greater than 0**, then:

    - **Double the reversal chance** (×2)
    - Cap at 100%

### **Example**

Dragon Kid (Weight 01) grabs Magnum TOKYO (Weight 04).

- Spirit‑based reversal chance = 25%
- Weight Factor division:

    - ATTACKER: 01 ÷ 3 = 0
    - DEFENDER: 04 ÷ 3 = 1

- Difference = 1 → positive
- Final reversal chance = **25% × 2 = 50%**

### **Notes**

- Most wrestlers have Weight Factor 05 → 05 ÷ 3 = 1
- Lightweight characters (01) are disproportionately penalized
- Heavyweights (07) rarely benefit because both sides often round to 2

### **Other Uses of Weight Factor**

- AI dashes more often for low‑weight wrestlers
- AI executes grapple follow‑ups faster for low‑weight wrestlers
- Reflects “agile lightweight” behavior

# 🧮 **Final Reversal Probability Formula (Full AKI Logic)**

### **Step 1 — Spirit Band Probability**

$$
P = \text{SpiritBandProbability}
$$
### **Step 2 — Weight Factor Adjustment**

$$
W = \left( \left\lfloor \frac{DEF\_Weight}{3} \right\rfloor - \left\lfloor \frac{ATK\_Weight}{3} \right\rfloor \right)
$$

#### If:

$$
W > 0 \;\Rightarrow\; P = P \times 2
$$

### **Step 3 — Strong Grapple Health Scaling**

If Strong Grapple:

- If DEFENDER Health ≥ 192:

$$
P = P \times 4
$$

- Else if DEFENDER Health ≥ 128:

$$
P = P \times 2
$$

### **Step 4 — Special! Mode Rules**

- If ATTACKER in Special! **and DEFENDER not in Special!**:

$$
\text{Reversal Disabled}
$$

- If both in Special!: continue normally

### **Step 5 — Cap**

$$
P = \min(P, 100\%)
$$

### **Step 6 — RNG Roll**

$$
\text{Reversal if } RNG < P
$$