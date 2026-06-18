<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { Service } from '@/types'
import { formatDate } from '@/utils'
import Icon from './Icon.vue'

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
        <Icon name="calendar" :size="14" />
        {{ formatDate(service.date) || 'No date' }}
      </span>
      <span class="card__count">{{ service.items.length }} songs</span>
    </div>
    <h3 class="card__title" :title="service.name">{{ service.name }}</h3>
    <div class="card__foot">
      <span class="card__cta">Open playlist <Icon name="chevron-right" :size="14" /></span>
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
  transition:
    transform var(--dur) var(--ease),
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur) var(--ease);
}
.card:hover,
.card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--c-accent);
  box-shadow: var(--sh-md);
}
.card__head {
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
  font-size: 1.5rem;
  line-height: 1.15;
  margin-top: auto;
}
.card__foot {
  color: var(--c-accent);
  font-size: 0.85rem;
  font-weight: 600;
}
.card__cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
