<script setup lang="ts">
import { computed } from 'vue'
import { Music } from '@lucide/vue'

const props = defineProps<{ seed: string }>()
// Stable local color: a service keeps its identity when renamed or reordered.
const hue = computed(() =>
  Array.from(props.seed).reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) % 360, 0),
)
</script>

<template>
  <div class="service-art" :style="{ '--art-hue': hue }" aria-hidden="true">
    <svg class="service-art__lines" viewBox="0 0 160 160" fill="none">
      <circle cx="132" cy="25" r="66" />
      <circle cx="132" cy="25" r="88" />
      <circle cx="132" cy="25" r="110" />
      <circle cx="132" cy="25" r="132" />
    </svg>
    <Music class="service-art__note" :stroke-width="1.2" />
  </div>
</template>

<style scoped>
.service-art {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 10px;
  color: white;
  background: linear-gradient(145deg, hsl(var(--art-hue) 42% 65%), hsl(var(--art-hue) 40% 32%));
  box-shadow:
    inset 0 0 0 1px #ffffff20,
    0 4px 12px #0000000c;
}
.service-art__lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  stroke: currentColor;
  opacity: 0.18;
}
.service-art__note {
  position: absolute;
  left: 24%;
  top: 24%;
  width: 52%;
  height: 52%;
  filter: drop-shadow(0 2px 3px #00000010);
}
</style>
