# Arena Floor Layout

## Modular Tile Naming, Coordinates, and Structure

This document defines the **complete naming schema**, **tile taxonomy**, and **grid layout** for the arena floor. All names follow a **lossless, slot‑based convention** designed for Blender, JSON registries, and the VPG Engine.

## 1. Naming Schema

All floor tiles follow the canonical pattern: `floor_{shape}_{orientation}_x_{col}_z_{row}`

### **Slots**

| Slot            | Meaning                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| `floor`         | Identifies this object as part of the arena floor system                        |
| `{shape}`       | One of: `8x8`, `4x8`, `8x4`, `cut`                                              |
| `{orientation}` | For rectangles: `n`, `e`, `s`, `w` For cut‑corner tiles: `nw`, `ne`, `sw`, `se` |
| `x_{col}`       | Grid X‑coordinate (negative = left, positive = right)                           |
| `z_{row}`       | Grid Z‑coordinate (negative = down, positive = up)                              |

### **Underscore Rule**

- **All separators use underscores**
- **Negative numbers use a minus sign only**
- Example:  `floor_cut_nw_x_-3_z_3`

## 2. Tile Types

### **2.1 Full Square (8×8)**

```
`floor_8x8`
```

### **2.2 Rectangle (4×8)**

Long edge is vertical (north–south).

```
floor_4x8_n
```

### **2.3 Rectangle (8×4)**

Long edge is horizontal (east–west).

```
floor_8x4_e
```

### **2.4 Cut‑Corner Tiles**

Each removes a 25% triangular wedge from one corner.

| Name           | Missing Corner |
| -------------- | -------------- |
| `floor_cut_nw` | North‑west     |
| `floor_cut_ne` | North‑east     |
| `floor_cut_sw` | South‑west     |
| `floor_cut_se` | South‑east     |

## 3. Coordinate System

The arena uses a **top‑down grid**:

- **X increases to the right**
- **Z increases upward**
- Origin `(0,0)` is the center of the 4×4 block of 8×8 tiles
- Rows are listed **top to bottom**
- Columns are listed **left to right**

This ensures stable, engine‑friendly placement.

## 4. Full Floor Layout (All Tiles)

Below is the complete arena floor, row by row, using the underscore naming schema.

### Row 1 (Topmost)

```
floor_8x8_x_0_z_4
```

### Row 2

```
floor_cut_nw_x_-3_z_3
floor_4x8_n_x_-2_z_3
floor_4x8_n_x_-1_z_3
floor_4x8_n_x_0_z_3
floor_4x8_n_x_1_z_3
floor_4x8_n_x_2_z_3
floor_4x8_n_x_3_z_3
floor_cut_ne_x_4_z_3
```

### Row 3

```
floor_8x8_x_-1_z_2
floor_8x8_x_0_z_2
floor_8x8_x_1_z_2
floor_8x8_x_2_z_2
```

### Row 4

```
floor_8x8_x_-1_z_1
floor_8x8_x_0_z_1
floor_8x8_x_1_z_1
floor_8x8_x_2_z_1
```

### Row 5

```
floor_8x8_x_-1_z_0
floor_8x8_x_0_z_0
floor_8x8_x_1_z_0
floor_8x8_x_2_z_0
```

### Row 6 (Bottom Row)

```
floor_cut_sw_x_-2_z_-1
floor_8x4_e_x_-1_z_-1
floor_8x4_e_x_0_z_-1
floor_cut_se_x_1_z_-1
```

## 5. Material Naming

Materials follow the same slot‑based pattern:

```
mat_floor_{shape}_{orientation}
```

### Required Materials

```
mat_floor_8x8
mat_floor_4x8_n
mat_floor_8x4_e
mat_floor_cut_nw
mat_floor_cut_ne
mat_floor_cut_sw
mat_floor_cut_se
```

Materials are **shared** across all tiles of the same type.

## 6. Summary Diagram (Text‑Only)

```
                [8x8]
   NW  4x8  4x8  4x8  4x8  4x8  4x8  NE
        8x8  8x8  8x8  8x8
        8x8  8x8  8x8  8x8
        8x8  8x8  8x8  8x8
   SW   8x4  8x4   SE
```

## 7. Purpose

This naming system ensures:

- **Lossless identification** of every tile
- **Stable coordinates** for engine placement
- **Predictable sorting** in Blender and JSON
- **Beginner‑friendly documentation**
- **Future‑proof extensibility** for new arenas or tile sets