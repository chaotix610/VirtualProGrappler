<template>
  <div v-if="snapshot" class="debug">
    <div class="debug__head">
      <span class="debug__title">Combat</span>
      <span class="debug__frame">frame {{ frame }}</span>
      <span class="debug__frame">rng {{ snapshot.draws }}</span>
    </div>

    <div class="debug__pair">
      <section
        v-for="side in (['player', 'opponent'] as const)"
        :key="side"
        class="fighter"
      >
        <header class="fighter__name">
          {{ snapshot[side].name }}
          <span class="fighter__tag">{{ side }}</span>
        </header>

        <div class="bar">
          <div class="bar__label">Health</div>
          <div class="bar__track">
            <!-- Max health is a hard ceiling that never regenerates, so it is
                 drawn behind current health rather than as its own bar. -->
            <div
              class="bar__max"
              :style="{ width: pct(snapshot[side].maxHealth, 255) }"
            />
            <div
              class="bar__fill"
              :style="{ width: pct(snapshot[side].currentHealth, 255) }"
            />
          </div>
          <div class="bar__value">
            {{ snapshot[side].currentHealth }}
            <span class="bar__sub">/ {{ snapshot[side].maxHealth }}</span>
          </div>
        </div>

        <div class="bar">
          <div class="bar__label">Spirit</div>
          <div class="bar__track">
            <div
              class="bar__fill bar__fill--spirit"
              :style="{ width: pct(snapshot[side].spirit, 100) }"
            />
          </div>
          <div class="bar__value">{{ snapshot[side].spirit }}</div>
        </div>

        <div class="joints">
          <div
            v-for="part in parts"
            :key="part"
            class="joint"
            :class="{ 'joint--held': snapshot[side].holding === part }"
          >
            <span class="joint__name">{{ part.slice(0, 4) }}</span>
            <span class="joint__track">
              <span
                class="joint__fill"
                :style="{ width: pct(snapshot[side].jointStamina[part], 50) }"
              />
            </span>
            <span class="joint__value">
              {{ snapshot[side].jointStamina[part].toFixed(1) }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <div class="debug__log">
      <div v-if="!snapshot.history.length" class="log__empty">
        No exchanges yet &mdash; get close and press J or K.
      </div>
      <div
        v-for="(entry, i) in snapshot.history"
        :key="i"
        class="log__row"
        :class="{ 'log__row--miss': !entry.connected }"
      >
        <span class="log__frame">f{{ entry.frame }}</span>
        <span class="log__move">{{ entry.moveName }}</span>
        <template v-if="entry.connected && entry.breakdown">
          <span class="log__calc">
            {{ entry.breakdown.factor1 }}+{{ entry.breakdown.factor2 }}+{{
              entry.breakdown.factor3
            }}
            = {{ entry.breakdown.subtotal }}
          </span>
          <span class="log__dmg">
            &minus;{{ entry.breakdown.currentHealthDamage }} hp
          </span>
          <span class="log__max">
            &minus;{{ entry.breakdown.maxHealthDamage }} max
          </span>
        </template>
        <span v-else class="log__miss">{{ entry.missReason }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import type { MatchSnapshot } from "@/combat/Match";
import { BODY_PARTS } from "@/combat/types";

/**
 * Read-only view of the combat simulation.
 *
 * The systems it shows are correct regardless of animation, so this is how
 * the damage maths gets verified while the move set is still a couple of
 * strikes. It polls rather than subscribing: the numbers only need to be
 * readable, not frame-accurate.
 */
export default defineComponent({
  name: "CombatDebug",

  props: {
    source: {
      type: Function as PropType<() => MatchSnapshot | null>,
      required: true,
    },
    frameSource: {
      type: Function as PropType<() => number>,
      required: true,
    },
  },

  data() {
    return {
      parts: BODY_PARTS,
      snapshot: null as MatchSnapshot | null,
      frame: 0,
      timer: 0,
    };
  },

  mounted() {
    this.timer = window.setInterval(() => {
      this.snapshot = this.source();
      this.frame = this.frameSource();
    }, 100);
  },

  beforeUnmount() {
    window.clearInterval(this.timer);
  },

  methods: {
    pct(value: number, max: number): string {
      return `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    },
  },
});
</script>

<style scoped>
.debug {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  width: min(30rem, calc(100vw - 1.5rem));
  padding: 0.6rem 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 0.5rem;
  background: rgba(10, 14, 20, 0.82);
  color: #e8eef5;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.7rem;
  line-height: 1.35;
  pointer-events: none;
}

.debug__head {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.debug__title {
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.debug__frame {
  opacity: 0.55;
}

.debug__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.fighter__name {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  margin-bottom: 0.3rem;
  font-weight: 600;
}

.fighter__tag {
  font-size: 0.6rem;
  opacity: 0.45;
  text-transform: uppercase;
}

.bar {
  display: grid;
  grid-template-columns: 3.1rem 1fr auto;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.15rem;
}

.bar__label {
  opacity: 0.6;
}

.bar__track {
  position: relative;
  height: 0.5rem;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.09);
  overflow: hidden;
}

.bar__max {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(255, 255, 255, 0.18);
}

.bar__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: #57b972;
}

.bar__fill--spirit {
  background: #d8a13c;
}

.bar__value {
  min-width: 4.2rem;
  text-align: right;
}

.bar__sub {
  opacity: 0.45;
}

.joints {
  margin-top: 0.3rem;
}

.joint {
  display: grid;
  grid-template-columns: 2.2rem 1fr 2.2rem;
  align-items: center;
  gap: 0.35rem;
}

.joint__name {
  opacity: 0.55;
}

.joint__track {
  height: 0.3rem;
  border-radius: 0.15rem;
  background: rgba(255, 255, 255, 0.09);
  overflow: hidden;
}

.joint__fill {
  display: block;
  height: 100%;
  background: #6ea8ff;
}

.joint__value {
  text-align: right;
  opacity: 0.7;
}

/* Below 15.0 the wrestler visibly holds the limb. */
.joint--held .joint__fill {
  background: #ff8a5c;
}

.joint--held .joint__name,
.joint--held .joint__value {
  color: #ff8a5c;
  opacity: 1;
}

.debug__log {
  margin-top: 0.55rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.log__empty {
  opacity: 0.4;
}

.log__row {
  display: flex;
  gap: 0.45rem;
  white-space: nowrap;
}

.log__frame {
  opacity: 0.4;
  min-width: 3.2rem;
}

.log__move {
  min-width: 7.5rem;
}

.log__calc {
  opacity: 0.6;
}

.log__dmg {
  color: #ff9b8a;
}

.log__max {
  opacity: 0.55;
}

.log__row--miss {
  opacity: 0.45;
}

.log__miss {
  font-style: italic;
}
</style>
