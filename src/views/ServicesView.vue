<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useServicesStore } from '@/stores/services'
import ServiceCard from '@/components/ServiceCard.vue'
import ServiceEditor from '@/components/ServiceEditor.vue'
import Icon from '@/components/Icon.vue'

const services = useServicesStore()
const router = useRouter()

const editorOpen = ref(false)

onMounted(() => {
  void services.init()
})

function submit(payload: { name: string; date: string }) {
  void services.create(payload).then((svc) => {
    editorOpen.value = false
    router.push({ name: 'service-detail', params: { id: svc.id } })
  })
}
</script>

<template>
  <section>
    <div class="section-title">
      <h1>Services</h1>
      <div class="section-title__actions">
        <button class="btn btn--primary" @click="editorOpen = true">
          <Icon name="plus" :size="16" /> New service
        </button>
      </div>
    </div>

    <div v-if="services.loading" class="empty"><p>Loading…</p></div>

    <div v-else-if="services.services.length === 0" class="empty surface">
      <div class="empty__art"><Icon name="calendar" :size="36" /></div>
      <h3>No services yet</h3>
      <p>Create a service for each worship occasion — Sunday morning, Wednesday prayer, Easter, and so on — and arrange songs into a playlist.</p>
      <button class="btn btn--primary" @click="editorOpen = true">
        <Icon name="plus" :size="16" /> Create your first service
      </button>
    </div>

    <div v-else class="grid">
      <ServiceCard
        v-for="svc in services.services"
        :key="svc.id"
        :service="svc"
      />
    </div>

    <ServiceEditor :open="editorOpen" @close="editorOpen = false" @submit="submit" />
  </section>
</template>

<style scoped>
.empty__art {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--sp-3);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--c-bg-2), var(--c-bg-3));
  color: var(--c-accent);
  border: 1px solid var(--c-border);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--sp-4);
}
</style>
