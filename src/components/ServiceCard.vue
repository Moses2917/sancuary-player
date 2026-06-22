<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import type { Service } from '@/types'
import { formatDate } from '@/utils'

const props = defineProps<{ service: Service }>()

const router = useRouter()

function open() {
  router.push({ name: 'service-detail', params: { id: props.service.id } })
}
</script>

<template>
  <article class="card" tabindex="0" @click="open" @keydown.enter="open">
    <div class="card__head">
      <span class="card__date">{{ formatDate(service.date) || 'No date' }}</span>
      <span class="card__count">{{ service.items.length }} songs</span>
    </div>
    <h3 class="card__title" :title="service.name">{{ service.name }}</h3>
    <div class="card__foot">
      <span class="card__cta">Open <ChevronRight :size="13" :stroke-width="1.75" /></span>
    </div>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  padding: var(--sp-5);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 140px;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  transition:
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur) var(--ease),
    transform var(--dur) var(--ease-out);
}
.card:hover,
.card:focus-visible {
  border-color: var(--c-border-strong);
  box-shadow: var(--sh-md);
  transform: translateY(-1px);
}
.card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.74rem;
  color: var(--c-text-muted);
  letter-spacing: 0.04em;
}
.card__date {
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.1em;
  font-size: 0.68rem;
}
.card__count {
  font-variant-numeric: tabular-nums;
  color: var(--c-text-soft);
}
.card__title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 1.6rem;
  line-height: 1.15;
  letter-spacing: -0.015em;
  margin-top: auto;
  color: var(--c-text);
}
.card__foot {
  color: var(--c-accent);
  font-size: 0.8rem;
  font-weight: 500;
}
.card__cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: gap var(--dur-fast) var(--ease-out);
}
.card:hover .card__cta {
  gap: 8px;
}
</style>
