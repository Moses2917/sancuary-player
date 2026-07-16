<script setup lang="ts">
import { useRouter } from 'vue-router'
import { CalendarDays } from '@lucide/vue'
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
    <div class="card__art" aria-hidden="true"><CalendarDays :size="26" :stroke-width="1.5" /></div>
    <div class="card__meta">
      <h3 class="card__title" :title="service.name">{{ service.name }}</h3>
      <p class="card__date">{{ formatDate(service.date) || 'No date' }}</p>
      <p class="card__count">{{ service.items.length }} {{ service.items.length === 1 ? 'song' : 'songs' }}</p>
    </div>
  </article>
</template>

<style scoped>
.card {
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--c-text);
  box-shadow: none;
  transition:
    box-shadow var(--dur) var(--ease),
    transform var(--dur) var(--ease-out),
    border-color var(--dur-fast) var(--ease);
}
.card:hover,
.card:focus-visible {
  box-shadow: none;
  transform: none;
}
.card__art { aspect-ratio: 1; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #8d99ae, #404b69); border-radius: 8px; box-shadow: 0 4px 12px rgba(29,29,31,.12); transition: filter var(--dur) var(--ease), transform var(--dur) var(--ease-out); }
.card:hover .card__art, .card:focus-visible .card__art { filter: brightness(1.07); transform: scale(1.015); }
.card__meta { padding: 1px 2px; }
.card__date {
  margin-top: 3px;
  color: var(--c-text-soft);
  font-size: .78rem;
  line-height: 1.2;
}
.card__count {
  margin-top: 2px;
  color: var(--c-text-muted);
  font-size: .72rem;
  line-height: 1.2;
}
.card__title {
  font-weight: 600;
  font-size: .92rem;
  line-height: 1.22;
  letter-spacing: -.015em;
  color: var(--c-text);
}
</style>
