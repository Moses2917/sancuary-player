<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    /** "horizontal" | "vertical" */
    orientation?: 'horizontal' | 'vertical'
    label?: string
    /** Optional accent CSS var name, e.g. '--c-piano'. */
    accent?: string
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    /** When true, render a "NN%" readout next to the slider. */
    showValue?: boolean
    /** Render the value as-is (0..1 -> 0..100) instead of min/max scaled. */
    unit?: 'percent' | 'raw'
  }>(),
  {
    orientation: 'horizontal',
    accent: '--c-accent',
    min: 0,
    max: 1,
    step: 0.01,
    disabled: false,
    showValue: false,
    unit: 'percent',
  },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()

const percent = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  return ((props.modelValue - props.min) / range) * 100
})

const valueLabel = computed(() => {
  if (props.unit === 'raw') return props.modelValue.toFixed(2)
  return `${Math.round(percent.value)}%`
})

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  emit('update:modelValue', parseFloat(target.value))
}

const styleObj = computed(() => ({
  '--accent': `var(${props.accent})`,
  '--pct': `${percent.value}%`,
}))
</script>

<template>
  <div
    class="slider"
    :class="[`slider--${orientation}`, { 'slider--disabled': disabled }]"
    :style="styleObj"
  >
    <label v-if="label" class="slider__label">{{ label }}</label>
    <div class="slider__row">
      <input
        class="slider__input"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="label"
        :orient="orientation === 'vertical' ? 'vertical' : undefined"
        @input="onInput"
      />
      <span v-if="showValue" class="slider__value" :aria-hidden="true">{{ valueLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.slider {
  display: flex;
  --accent: var(--c-accent);
  --pct: 50%;
  --track: rgba(0, 0, 0, 0.08);
}
.slider--horizontal {
  flex-direction: column;
  gap: var(--sp-2);
  width: 100%;
}
.slider--vertical {
  flex-direction: row-reverse;
  align-items: center;
  gap: var(--sp-3);
  height: 120px;
}
.slider__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
}
.slider--vertical .slider__row {
  flex-direction: column;
}
.slider__label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--c-text-muted);
  white-space: nowrap;
}
.slider__value {
  flex-shrink: 0;
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
  font-weight: 550;
  color: var(--c-text-muted);
  letter-spacing: -0.005em;
}

.slider__input {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.slider--horizontal .slider__input {
  width: 100%;
  height: 16px;
}
.slider--vertical .slider__input {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 16px;
  height: 100%;
}

/* Track — pill, soft fill */
.slider__input::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: var(--r-pill);
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--pct),
    var(--track) var(--pct),
    var(--track) 100%
  );
}
.slider__input::-moz-range-track {
  height: 4px;
  border-radius: var(--r-pill);
  background: var(--track);
}
.slider__input::-moz-range-progress {
  height: 4px;
  border-radius: var(--r-pill);
  background: var(--accent);
}
.slider--vertical .slider__input::-webkit-slider-runnable-track {
  width: 4px;
  height: 100%;
  background: linear-gradient(
    to top,
    var(--accent) 0%,
    var(--accent) var(--pct),
    var(--track) var(--pct),
    var(--track) 100%
  );
}
.slider--vertical .slider__input::-moz-range-track {
  width: 4px;
  height: 100%;
}

/* Thumb — solid filled disc */
.slider__input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: none;
  margin-top: -5px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.18),
    0 0 0 0.5px rgba(0, 0, 0, 0.06);
  transition: transform var(--dur-fast) var(--ease);
}
.slider__input:hover::-webkit-slider-thumb {
  transform: scale(1.18);
}
.slider__input:active::-webkit-slider-thumb {
  transform: scale(1.3);
}
.slider__input::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.18),
    0 0 0 0.5px rgba(0, 0, 0, 0.06);
}
.slider--vertical .slider__input::-webkit-slider-thumb {
  margin-top: 0;
  margin-right: -5px;
}

.slider--disabled {
  opacity: 0.4;
}
.slider--disabled .slider__input {
  cursor: not-allowed;
}
</style>
