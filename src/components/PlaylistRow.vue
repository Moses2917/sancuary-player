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
      <GripVertical :size="18" />
    </button>

    <span class="row__index">{{ index + 1 }}</span>

    <button
      class="row__art"
      :class="{ 'row__art--playing': isCurrentPlaying }"
      :title="isCurrentPlaying ? 'Pause' : 'Play from here'"
      @click="emit('play')"
    >
      <component :is="isCurrentPlaying ? Pause : Play" :size="16" />
    </button>

    <div class="row__title" :title="song.title">{{ song.title }}</div>

    <div class="row__mix">
      <div class="mix" :class="{ 'mix--dim': false }">
        <span class="mix__tag" style="--c: var(--c-piano)">Piano</span>
        <VolumeSlider
          class="mix__slider"
          :model-value="item.pianoVolume"
          accent="--c-piano"
          show-value
          @update:model-value="emit('update:piano', $event)"
        />
      </div>
      <div class="mix">
        <span class="mix__tag" style="--c: var(--c-choir)">Choir</span>
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
      <Trash2 :size="16" />
    </button>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 28px 28px 40px 1fr 1.4fr 40px;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  transition:
    border-color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease);
}
.row:hover {
  border-color: var(--c-border-strong);
}
.row--current {
  border-color: var(--c-accent);
  background: color-mix(in srgb, var(--c-accent) 8%, var(--c-surface));
}
.row--dragging {
  opacity: 0.4;
}
.row--over {
  border-style: dashed;
  border-color: var(--c-accent);
  transform: scale(1.005);
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
}
.row__grip:hover {
  color: var(--c-text-soft);
}
.row__grip:active {
  cursor: grabbing;
}
.row__index {
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--c-text-muted);
  font-size: 0.9rem;
  font-weight: 600;
}
.row__art {
  width: 36px;
  height: 36px;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-bg-3);
  color: var(--c-text-soft);
  border: 1px solid var(--c-border);
  transition:
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.row__art:hover {
  background: var(--c-accent);
  color: #1a1208;
  border-color: transparent;
}
.row__art--playing {
  background: var(--c-accent);
  color: #1a1208;
  border-color: transparent;
  box-shadow: var(--sh-glow);
}
.row__title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.row__mix {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-4);
  min-width: 0;
}
.mix {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.mix--dim {
  opacity: 0.5;
}
.mix__tag {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c);
  min-width: 38px;
}
.mix__slider {
  flex: 1;
  min-width: 0;
}

@media (max-width: 760px) {
  .row {
    grid-template-columns: 24px 28px 36px 1fr 36px;
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
