<script setup lang="ts">
import { computed } from 'vue'
import { GripVertical, Pause, Play, Trash2 } from '@lucide/vue'
import type { PlaylistItem, Song } from '@/types'
import VolumeSlider from './VolumeSlider.vue'

const props = defineProps<{
  item: PlaylistItem
  song: Song
  index: number
  isCurrent: boolean
  isPlaying: boolean
  dragging: boolean
  dragOver: boolean
}>()

const emit = defineEmits<{
  (e: 'play'): void
  (e: 'remove'): void
  (e: 'update:piano', v: number): void
  (e: 'update:choir', v: number): void
  (e: 'dragstart'): void
  (e: 'dragenter'): void
  (e: 'dragend'): void
  (e: 'drop'): void
}>()

const isCurrentPlaying = computed(() => props.isCurrent && props.isPlaying)
</script>

<template>
  <li
    class="row"
    :class="{
      'row--current': isCurrent,
      'row--dragging': dragging,
      'row--over': dragOver,
    }"
    @dragover.prevent="emit('dragenter')"
    @drop.prevent="emit('drop')"
  >
    <button
      class="row__grip"
      draggable="true"
      title="Drag to reorder"
      @dragstart="emit('dragstart')"
      @dragend="emit('dragend')"
    >
      <GripVertical :size="16" :stroke-width="1.5" />
    </button>

    <span class="row__index">{{ index + 1 }}</span>

    <button
      class="row__art"
      :class="{ 'row__art--playing': isCurrentPlaying }"
      :title="isCurrentPlaying ? 'Pause' : 'Play from here'"
      @click="emit('play')"
    >
      <component
        :is="isCurrentPlaying ? Pause : Play"
        :size="14"
        :stroke-width="2"
        :style="!isCurrentPlaying ? 'margin-left: 2px' : ''"
      />
    </button>

    <div class="row__title" :title="song.title">{{ song.title }}</div>

    <div class="row__mix">
      <div class="mix">
        <span class="mix__tag" style="--c: var(--c-piano)">
          <span class="mix__dot"></span>Piano
        </span>
        <VolumeSlider
          class="mix__slider"
          :model-value="item.pianoVolume"
          accent="--c-piano"
          show-value
          @update:model-value="emit('update:piano', $event)"
        />
      </div>
      <div class="mix">
        <span class="mix__tag" style="--c: var(--c-choir)">
          <span class="mix__dot"></span>Choir
        </span>
        <VolumeSlider
          class="mix__slider"
          :model-value="item.choirVolume"
          accent="--c-choir"
          show-value
          @update:model-value="emit('update:choir', $event)"
        />
      </div>
    </div>

    <button class="icon-btn icon-btn--danger" title="Remove from service" @click="emit('remove')">
      <Trash2 :size="15" :stroke-width="1.75" />
    </button>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 24px 28px 36px 1fr 1.4fr 32px;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: 10px;
  border: 1px solid transparent;
  background: rgba(255,255,255,.54);
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.row:hover {
  background: #fff;
  box-shadow: var(--sh-sm);
}
.row--current {
  background: rgba(250, 45, 72, .09);
  border-color: rgba(250, 45, 72, 0.20);
}
.row--current:hover {
  background: var(--c-accent-glow);
}
.row--dragging {
  opacity: 0.4;
}
.row--over {
  border-style: dashed;
  border-color: var(--c-accent);
}

.row__grip {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-text-muted);
  background: transparent;
  border: none;
  cursor: grab;
  padding: 4px;
  border-radius: var(--r-sm);
  opacity: 0;
  transition:
    opacity var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.row:hover .row__grip {
  opacity: 0.7;
}
.row__grip:hover {
  color: var(--c-text);
  opacity: 1;
}
.row__grip:active {
  cursor: grabbing;
}
.row__index {
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--c-text-muted);
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.row__art {
  width: 32px;
  height: 32px;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-bg-2);
  color: var(--c-text);
  border: none;
  transition:
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.row__art:hover {
  background: var(--c-accent);
  color: #fff;
}
.row__art--playing {
  background: var(--c-accent);
  color: #fff;
}
.row__title {
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.015em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  color: var(--c-text);
}
.row__mix {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-5);
  min-width: 0;
}
.mix {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.mix__tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--c-text-muted);
  min-width: 48px;
  text-transform: uppercase;
}
.mix__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c);
}
.mix__slider {
  flex: 1;
  min-width: 0;
}

@media (max-width: 760px) {
  .row {
    grid-template-columns: 24px 28px 32px 1fr 32px;
    grid-template-areas:
      'grip idx art title remove'
      'mix  mix mix mix mix';
    row-gap: var(--sp-2);
  }
  .row__grip {
    grid-area: grip;
  }
  .row__index {
    grid-area: idx;
  }
  .row__art {
    grid-area: art;
  }
  .row__title {
    grid-area: title;
  }
  .row__mix {
    grid-area: mix;
    margin-top: 4px;
  }
  .row__mix .mix__tag {
    min-width: auto;
  }
}
</style>
