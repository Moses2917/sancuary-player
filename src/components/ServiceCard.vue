<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import ServiceArtwork from './ServiceArtwork.vue'
import type { Service } from '@/types'
import { formatDate } from '@/utils'

const props = defineProps<{ service: Service }>()

const router = useRouter()

function open() {
  router.push({ name: 'service-detail', params: { id: props.service.id } })
}
</script>

<template>
  <article
    class="card"
    role="link"
    :aria-label="`Open ${service.name}`"
    tabindex="0"
    @click="open"
    @keydown.enter="open"
  >
    <ServiceArtwork class="card__art" :seed="service.id" />
    <div class="card__body">
      <span class="card__date">{{ formatDate(service.date) || 'No date' }}</span>
      <h3 class="card__title" :title="service.name">{{ service.name }}</h3>
      <span class="card__count">{{ service.items.length }} songs</span>
    </div>
    <ChevronRight class="card__arrow" :size="16" :stroke-width="1.75" aria-hidden="true" />
  </article>
</template>

<style scoped>
.card {
  position: relative;
  padding: var(--sp-4);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  min-height: 120px;
  background: var(--c-bg-1);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  transition:
    box-shadow var(--dur) var(--ease),
    transform var(--dur) var(--ease-out),
    border-color var(--dur-fast) var(--ease);
}
.card:hover,
.card:focus-visible {
  border-color: var(--c-border-strong);
  box-shadow: var(--sh-md);
  transform: translateY(-1px);
}
.card__art {
  width: 80px;
  flex-shrink: 0;
}
.card__body {
  flex: 1;
  min-width: 0;
}
.card__date {
  font-weight: 500;
  font-size: 0.73rem;
  color: var(--c-text-muted);
}
.card__count {
  font-variant-numeric: tabular-nums;
  color: var(--c-text-muted);
  font-size: 0.78rem;
}
.card__title {
  font-weight: 600;
  font-size: 1.05rem;
  line-height: 1.35;
  letter-spacing: -0.02em;
  margin: 3px 0;
  overflow-wrap: anywhere;
  color: var(--c-text);
}
.card__arrow {
  flex-shrink: 0;
  color: var(--c-text-muted);
}
</style>
