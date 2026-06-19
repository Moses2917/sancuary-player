<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Calendar, ChevronRight } from '@lucide/vue'
import type { Service } from '@/types'
import { formatDate } from '@/utils'

const props = defineProps<{ service: Service }>()

const router = useRouter()

function open() {
  router.push({ name: 'service-detail', params: { id: props.service.id } })
}
</script>

<template>
  <article class="card surface" tabindex="0" @click="open" @keydown.enter="open">
    <div class="card__head">
      <span class="card__date">
        <Calendar :size="14" />
        {{ formatDate(service.date) || 'No date' }}
      </span>
      <span class="card__count">{{ service.items.length }} songs</span>
    </div>
    <h3 class="card__title" :title="service.name">{{ service.name }}</h3>
    <div class="card__foot">
      <span class="card__cta">Open playlist <ChevronRight :size="14" /></span>
    </div>
  </article>
</template>

<style scoped>
.card {
  padding: var(--sp-5);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 140px;
  position: relative;
  overflow: hidden;
  transition:
    transform var(--dur) var(--ease-spring),
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur) var(--ease);
}
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 80% 60% at 50% 0%,
    var(--c-accent-glow),
    transparent 70%
  );
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
  pointer-events: none;
}
.card:hover,
.card:focus-visible {
  transform: translateY(-4px);
  border-color: var(--c-accent);
  box-shadow: var(--sh-lg);
}
.card:hover::before,
.card:focus-visible::before {
  opacity: 0.6;
}
.card__head {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  color: var(--c-text-muted);
}
.card__date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.card__count {
  background: var(--c-bg-3);
  padding: 2px 10px;
  border-radius: var(--r-pill);
  font-weight: 600;
}
.card__title {
  position: relative;
  font-size: 1.5rem;
  line-height: 1.15;
  margin-top: auto;
}
.card__foot {
  position: relative;
  color: var(--c-accent);
  font-size: 0.85rem;
  font-weight: 600;
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
