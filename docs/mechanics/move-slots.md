# VPG Engine — Move Slots Reference (v3)

This table lists every assignable move slot in the VPG Engine, organized by position and category.

## Column Definitions

- **position** — broad area of the game system (Grappling, Standing, Running, Ground, Turnbuckle, Ringside, Apron, Irish Whip, Taunt, Double Team)
- **category** — functional grouping within a position
- **group** — eligibility group for the move database (a move's eligibility references groups, not individual slots)
- **slotId** — the specific assignable slot (unique `snake_case` identifier)
- **playerState** — what state the player must be in for this slot to fire
- **opponentState** — what state the opponent must be in (comma-separated if multiple valid states)
- **range** — distance modifier where applicable (`close`, `mid`, `any`, `null`)
- **requiresSpecial** — whether the player must have special meter to trigger this slot
- **input** — button/input combo that triggers the slot (follows Input Grammar Specification)

## State Vocabulary Reference

### Neutral Player States

- `standing` — upright, not in any special state
- `running` — moving with run held
- `ducking` — crouched low after duck input
- `getting_up` — in the process of recovering from being downed
- `airborne` — mid flying attack
- `at_turnbuckle` — standing in the corner, not climbed
- `on_turnbuckle` — climbed to top or second rope
- `on_apron` — standing on the ring apron
- `running_on_apron` — running along the ring apron
- `outside_ring` — standing on the floor at ringside
- `entering` — making entrance to the ring (pre-match)

### Paired Grapple States (attacker / defender)

- `front_weak_grapple_attacking` / `front_weak_grapple_defending`
- `front_strong_grapple_attacking` / `front_strong_grapple_defending`
- `back_weak_grapple_attacking` / `back_weak_grapple_defending`
- `back_strong_grapple_attacking` / `back_strong_grapple_defending`
- `turnbuckle_front_weak_grapple_attacking` / `_defending`
- `turnbuckle_front_strong_grapple_attacking` / `_defending`
- `turnbuckle_back_weak_grapple_attacking` / `_defending`
- `turnbuckle_back_strong_grapple_attacking` / `_defending`
- `apron_weak_grapple_from_inside_attacking` / `_defending`
- `apron_strong_grapple_from_inside_attacking` / `_defending`
- `apron_weak_grapple_from_apron_attacking` / `_defending`
- `apron_strong_grapple_from_apron_attacking` / `_defending`
- `double_team_grapple_front_attacking` / `_defending`
- `double_team_grapple_back_attacking` / `_defending`
- `double_team_grapple_sandwich_attacking` / `_defending`

### Defender-Only States

- `standing_facing_player` — upright, facing the attacker
- `standing_facing_away` — upright, back to the attacker
- `down_facing_up` — laying flat on back
- `down_facing_down` — laying flat on stomach
- `sitting_up` — sitting on mat with legs straight out
- `kneeling_all_fours` — on hands and knees
- `tree_of_woe` — hanging upside down in turnbuckle
- `at_turnbuckle_facing_out` — slumped in corner, back against turnbuckle, facing player
- `at_turnbuckle_facing_in` — slumped in corner, facing turnbuckle, back to player
- `on_turnbuckle_facing_player` — on top rope facing player
- `on_turnbuckle_facing_away` — on top rope facing away from player
- `on_apron` — standing on ring apron
- `outside_ring` — standing on floor at ringside
- `down_outside_ring` — laying down outside the ring
- `down_in_ring` — laying down in the ring (generic, for flying attacks where facing direction doesn't matter)
- `running_toward_from_weak_whip` — running toward player after weak Irish whip
- `running_toward_from_strong_whip` — running toward player after strong Irish whip
- `running_toward_opponent` — running toward player (generic)
- `throwing_punch` — mid-punch animation (for counter punch window)
- `throwing_kick` — mid-kick animation (for counter kick window)
- `held_on_shoulders` — held up on partner's shoulders (double team)
- `defeated` — match is over, opponent has lost
- `n/a` — no opponent state required (taunts, walking style, evasion)

### Orthogonal Flags

- `has_special` — player has special meter available (modeled via `requiresSpecial` column)

---

## Grappling

|position|category|group|slotId|playerState|opponentState|range|requiresSpecial|input|
|---|---|---|---|---|---|---|---|---|
|Grappling|Front Weak Grapple|front_weak_grapple_a|front_weak_grapple_1|front_weak_grapple_attacking|front_weak_grapple_defending|n/a|false|a|
|Grappling|Front Weak Grapple|front_weak_grapple_a|front_weak_grapple_2|front_weak_grapple_attacking|front_weak_grapple_defending|n/a|false|dpad_left/dpad_right + a|
|Grappling|Front Weak Grapple|front_weak_grapple_a|front_weak_grapple_3|front_weak_grapple_attacking|front_weak_grapple_defending|n/a|false|dpad_up + a|
|Grappling|Front Weak Grapple|front_weak_grapple_a|front_weak_grapple_4|front_weak_grapple_attacking|front_weak_grapple_defending|n/a|false|dpad_down + a|
|Grappling|Front Weak Grapple|front_weak_grapple_b|front_weak_grapple_5|front_weak_grapple_attacking|front_weak_grapple_defending|n/a|false|b|
|Grappling|Front Weak Grapple|front_weak_grapple_b|front_weak_grapple_6|front_weak_grapple_attacking|front_weak_grapple_defending|n/a|false|dpad_left/dpad_right + b|
|Grappling|Front Weak Grapple|front_weak_grapple_b|front_weak_grapple_7|front_weak_grapple_attacking|front_weak_grapple_defending|n/a|false|dpad_up + b|
|Grappling|Front Weak Grapple|front_weak_grapple_b|front_weak_grapple_8|front_weak_grapple_attacking|front_weak_grapple_defending|n/a|false|dpad_down + b|
|Grappling|Front Strong Grapple|front_strong_grapple|front_strong_grapple_1|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|false|a|
|Grappling|Front Strong Grapple|front_strong_grapple|front_strong_grapple_2|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|false|dpad_left/dpad_right + a|
|Grappling|Front Strong Grapple|front_strong_grapple|front_strong_grapple_3|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|false|dpad_up + a|
|Grappling|Front Strong Grapple|front_strong_grapple|front_strong_grapple_4|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|false|dpad_down + a|
|Grappling|Front Strong Grapple|front_strong_grapple|front_strong_grapple_5|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|false|b|
|Grappling|Front Strong Grapple|front_strong_grapple|front_strong_grapple_6|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|false|dpad_left/dpad_right + b|
|Grappling|Front Strong Grapple|front_strong_grapple|front_strong_grapple_7|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|false|dpad_up + b|
|Grappling|Front Strong Grapple|front_strong_grapple|front_strong_grapple_8|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|false|dpad_down + b|
|Grappling|Front Strong Grapple|front_finisher|front_finisher|front_strong_grapple_attacking|front_strong_grapple_defending|n/a|true|control_stick|
|Grappling|Back Weak Grapple|back_weak_grapple|back_weak_grapple_1|back_weak_grapple_attacking|back_weak_grapple_defending|n/a|false|a|
|Grappling|Back Weak Grapple|back_weak_grapple|back_weak_grapple_2|back_weak_grapple_attacking|back_weak_grapple_defending|n/a|false|dpad + a|
|Grappling|Back Weak Grapple|back_weak_grapple|back_weak_grapple_3|back_weak_grapple_attacking|back_weak_grapple_defending|n/a|false|b|
|Grappling|Back Weak Grapple|back_weak_grapple|back_weak_grapple_4|back_weak_grapple_attacking|back_weak_grapple_defending|n/a|false|dpad + b|
|Grappling|Back Strong Grapple|back_strong_grapple|back_strong_grapple_1|back_strong_grapple_attacking|back_strong_grapple_defending|n/a|false|a|
|Grappling|Back Strong Grapple|back_strong_grapple|back_strong_grapple_2|back_strong_grapple_attacking|back_strong_grapple_defending|n/a|false|dpad + a|
|Grappling|Back Strong Grapple|back_strong_grapple|back_strong_grapple_3|back_strong_grapple_attacking|back_strong_grapple_defending|n/a|false|b|
|Grappling|Back Strong Grapple|back_strong_grapple|back_strong_grapple_4|back_strong_grapple_attacking|back_strong_grapple_defending|n/a|false|dpad + b|
|Grappling|Back Strong Grapple|back_finisher|back_finisher|back_strong_grapple_attacking|back_strong_grapple_defending|n/a|true|control_stick|
|Grappling|Grapple Reversal|back_weak_grapple_counter|back_weak_grapple_counter|back_weak_grapple_defending|back_weak_grapple_attacking|n/a|false|r|
|Grappling|Grapple Reversal|back_strong_grapple_counter|back_strong_grapple_counter|back_strong_grapple_defending|back_strong_grapple_attacking|n/a|false|r|

## Standing

|position|category|group|slotId|playerState|opponentState|range|requiresSpecial|input|
|---|---|---|---|---|---|---|---|---|
|Standing|Weak Striking|weak_arm_strike|weak_arm_strike_1|standing|standing_facing_player, standing_facing_away|close|false|b|
|Standing|Weak Striking|weak_arm_strike|weak_arm_strike_2|standing|standing_facing_player, standing_facing_away|close|false|dpad + b|
|Standing|Weak Striking|weak_leg_strike|weak_leg_strike_1|standing|standing_facing_player, standing_facing_away|mid|false|b|
|Standing|Weak Striking|weak_leg_strike|weak_leg_strike_2|standing|standing_facing_player, standing_facing_away|mid|false|dpad + b|
|Standing|Strong Striking|strong_strike|strong_strike_1|standing|standing_facing_player, standing_facing_away|any|false|b|
|Standing|Strong Striking|strong_strike|strong_strike_2|standing|standing_facing_player, standing_facing_away|any|false|dpad + b|
|Standing|Strong Striking|strong_strike|strong_strike_3|standing|standing_facing_player, standing_facing_away|any|false|a + b|
|Standing|Recovering Strike|ducking_strike|ducking_strike|getting_up|standing_facing_player, standing_facing_away|any|false|b|
|Standing|Counter Attack|counter_punch|counter_punch|standing|throwing_punch|any|false|r|
|Standing|Counter Attack|special_counter_punch|special_counter_punch|standing|throwing_punch|any|true|r|
|Standing|Counter Attack|counter_kick|counter_kick_1|standing|throwing_kick|any|false|r + a|
|Standing|Counter Attack|counter_kick|counter_kick_2|standing|throwing_kick|any|false|r + b|
|Standing|Counter Attack|special_counter_kick|special_counter_kick|standing|throwing_kick|any|true|r + a/b|
|Standing|Walking Style|walking_style|walking_style|standing|null|n/a|false|dpad|

## Running

| position | category              | group                 | slotId                               | playerState | opponentState                                | range | requiresSpecial | input              |
| -------- | --------------------- | --------------------- | ------------------------------------ | ----------- | -------------------------------------------- | ----- | --------------- | ------------------ |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_1                | running     | standing_facing_player, standing_facing_away | any   | false           | run + b            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_2                | running     | standing_facing_player, standing_facing_away | any   | false           | run + a + b        |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_1              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + b     |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_2              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + a + b |
| Running  | Running Grapple       | run_front_grapple     | run_front_grapple                    | running     | standing_facing_player                       | any   | false           | run + a            |
| Running  | Running Grapple       | run_back_grapple      | run_back_grapple                     | running     | standing_facing_away                         | any   | false           | run + a            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_up          | running     | down_facing_up                               | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_down        | running     | down_facing_down                             | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_sitting_up         | running     | sitting_up                                   | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_kneeling_all_fours | running     | kneeling_all_fours                           | any   | false           | run + b            |
| Running  | Evasion               | evasion               | evasion                              | running     | null                                         | n/a   | false           | run + r            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_1                | running     | standing_facing_player, standing_facing_away | any   | false           | run + b            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_2                | running     | standing_facing_player, standing_facing_away | any   | false           | run + a + b        |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_1              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + b     |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_2              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + a + b |
| Running  | Running Grapple       | run_front_grapple     | run_front_grapple                    | running     | standing_facing_player                       | any   | false           | run + a            |
| Running  | Running Grapple       | run_back_grapple      | run_back_grapple                     | running     | standing_facing_away                         | any   | false           | run + a            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_up          | running     | down_facing_up                               | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_down        | running     | down_facing_down                             | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_sitting_up         | running     | sitting_up                                   | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_kneeling_all_fours | running     | kneeling_all_fours                           | any   | false           | run + b            |
| Running  | Evasion               | evasion               | evasion                              | running     | null                                         | n/a   | false           | run + r            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_1                | running     | standing_facing_player, standing_facing_away | any   | false           | run + b            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_2                | running     | standing_facing_player, standing_facing_away | any   | false           | run + a + b        |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_1              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + b     |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_2              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + a + b |
| Running  | Running Grapple       | run_front_grapple     | run_front_grapple                    | running     | standing_facing_player                       | any   | false           | run + a            |
| Running  | Running Grapple       | run_back_grapple      | run_back_grapple                     | running     | standing_facing_away                         | any   | false           | run + a            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_up          | running     | down_facing_up                               | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_down        | running     | down_facing_down                             | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_sitting_up         | running     | sitting_up                                   | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_kneeling_all_fours | running     | kneeling_all_fours                           | any   | false           | run + b            |
| Running  | Evasion               | evasion               | evasion                              | running     | null                                         | n/a   | false           | run + r            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_1                | running     | standing_facing_player, standing_facing_away | any   | false           | run + b            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_2                | running     | standing_facing_player, standing_facing_away | any   | false           | run + a + b        |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_1              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + b     |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_2              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + a + b |
| Running  | Running Grapple       | run_front_grapple     | run_front_grapple                    | running     | standing_facing_player                       | any   | false           | run + a            |
| Running  | Running Grapple       | run_back_grapple      | run_back_grapple                     | running     | standing_facing_away                         | any   | false           | run + a            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_up          | running     | down_facing_up                               | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_down        | running     | down_facing_down                             | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_sitting_up         | running     | sitting_up                                   | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_kneeling_all_fours | running     | kneeling_all_fours                           | any   | false           | run + b            |
| Running  | Evasion               | evasion               | evasion                              | running     | null                                         | n/a   | false           | run + r            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_1                | running     | standing_facing_player, standing_facing_away | any   | false           | run + b            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_2                | running     | standing_facing_player, standing_facing_away | any   | false           | run + a + b        |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_1              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + b     |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_2              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + a + b |
| Running  | Running Grapple       | run_front_grapple     | run_front_grapple                    | running     | standing_facing_player                       | any   | false           | run + a            |
| Running  | Running Grapple       | run_back_grapple      | run_back_grapple                     | running     | standing_facing_away                         | any   | false           | run + a            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_up          | running     | down_facing_up                               | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_down        | running     | down_facing_down                             | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_sitting_up         | running     | sitting_up                                   | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_kneeling_all_fours | running     | kneeling_all_fours                           | any   | false           | run + b            |
| Running  | Evasion               | evasion               | evasion                              | running     | null                                         | n/a   | false           | run + r            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_1                | running     | standing_facing_player, standing_facing_away | any   | false           | run + b            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_2                | running     | standing_facing_player, standing_facing_away | any   | false           | run + a + b        |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_1              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + b     |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_2              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + a + b |
| Running  | Running Grapple       | run_front_grapple     | run_front_grapple                    | running     | standing_facing_player                       | any   | false           | run + a            |
| Running  | Running Grapple       | run_back_grapple      | run_back_grapple                     | running     | standing_facing_away                         | any   | false           | run + a            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_up          | running     | down_facing_up                               | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_down        | running     | down_facing_down                             | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_sitting_up         | running     | sitting_up                                   | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_kneeling_all_fours | running     | kneeling_all_fours                           | any   | false           | run + b            |
| Running  | Evasion               | evasion               | evasion                              | running     | null                                         | n/a   | false           | run + r            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_1                | running     | standing_facing_player, standing_facing_away | any   | false           | run + b            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_2                | running     | standing_facing_player, standing_facing_away | any   | false           | run + a + b        |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_1              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + b     |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_2              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + a + b |
| Running  | Running Grapple       | run_front_grapple     | run_front_grapple                    | running     | standing_facing_player                       | any   | false           | run + a            |
| Running  | Running Grapple       | run_back_grapple      | run_back_grapple                     | running     | standing_facing_away                         | any   | false           | run + a            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_up          | running     | down_facing_up                               | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_down        | running     | down_facing_down                             | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_sitting_up         | running     | sitting_up                                   | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_kneeling_all_fours | running     | kneeling_all_fours                           | any   | false           | run + b            |
| Running  | Evasion               | evasion               | evasion                              | running     | null                                         | n/a   | false           | run + r            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_1                | running     | standing_facing_player, standing_facing_away | any   | false           | run + b            |
| Running  | Running Strike        | weak_running_strike   | weak_running_strike_2                | running     | standing_facing_player, standing_facing_away | any   | false           | run + a + b        |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_1              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + b     |
| Running  | Running Strike        | strong_running_strike | strong_running_strike_2              | running     | standing_facing_player, standing_facing_away | any   | false           | dpad + run + a + b |
| Running  | Running Grapple       | run_front_grapple     | run_front_grapple                    | running     | standing_facing_player                       | any   | false           | run + a            |
| Running  | Running Grapple       | run_back_grapple      | run_back_grapple                     | running     | standing_facing_away                         | any   | false           | run + a            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_up          | running     | down_facing_up                               | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_facing_down        | running     | down_facing_down                             | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_sitting_up         | running     | sitting_up                                   | any   | false           | run + b            |
| Running  | Running Ground Strike | run_ground_strike     | run_ground_strike_kneeling_all_fours | running     | kneeling_all_fours                           | any   | false           | run + b            |
| Running  | Evasion               | evasion               | evasion                              | running     | null                                         | n/a   | false           | run + r            |
