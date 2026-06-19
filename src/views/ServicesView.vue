<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import ServiceCard from '@/components/ServiceCard.vue'
import ServiceEditor from '@/components/ServiceEditor.vue'
import AppIcon from '@/components/AppIcon.vue'

const services = useServicesStore()
const library = useLibraryStore()
const router = useRouter()

const editorOpen = ref(false)
const query = ref('')

onMounted(() => {
  void services.init()
  void library.init()
})

function submit(payload: { name: string; date: string }) {
  void services.create(payload).then((svc) => {
    editorOpen.value = false
    router.push({ name: 'service-detail', params: { id: svc.id } })
  })
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return services.services
  return services.services.filter((svc) => {
    if (svc.name.toLowerCase().includes(q)) return true
    if (svc.date && svc.date.toLowerCase().includes(q)) return true
    // Match any song title in the setlist
    return svc.items.some((item) => {
      const song = library.getById(item.songId)
      return song?.title.toLowerCase().includes(q)
    })
  })
})
</script>

<template>
  <section>
    <div class="section-title">
      <h1>Services</h1>
      <div class="section-title__actions">
        <button class="btn btn--primary" @click="editorOpen = true">
          <AppIcon name="plus" :size="16" /> New service
        </button>
      </div>
    </div>

    <div v-if="!services.loading && services.services.length > 0" class="search">
      <AppIcon name="search" :size="16" />
      <input
        v-model="query"
        type="search"
        class="search__input"
        placeholder="Search by service name or song…"
        aria-label="Search services"
      />
      <button v-if="query" class="search__clear" title="Clear" @click="query = ''">
        <AppIcon name="x" :size="14" />
      </button>
    </div>

    <div v-if="services.loading" class="empty"><p>Loading…</p></div>

    <div v-else-if="services.services.length === 0" class="empty surface">
      <div class="empty__art"><AppIcon name="calendar" :size="36" /></div>
      <h3>No services yet</h3>
      <p>
        Create a service for each worship occasion — Sunday morning, Wednesday prayer, Easter, and
        so on — and arrange songs into a playlist.
      </p>
      <button class="btn btn--primary" @click="editorOpen = true">
        <AppIcon name="plus" :size="16" /> Create your first service
      </button>
    </div>

    <div v-else-if="filtered.length === 0" class="empty">
      <p>No services match “{{ query }}”.</p>
      <button class="btn btn--ghost btn--sm" @click="query = ''">Clear search</button>
    </div>

    <div v-else class="grid">
      <ServiceCard v-for="svc in filtered" :key="svc.id" :service="svc" />
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
.search {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-3);
  background: var(--c-bg-1);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  color: var(--c-text-muted);
  max-width: 480px;
  margin-bottom: var(--sp-4);
  transition: border-color var(--dur-fast) var(--ease);
}
.search:focus-within {
  border-color: var(--c-accent);
}
.search__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--c-text);
  padding: var(--sp-3) 0;
}
.search__input::placeholder {
  color: var(--c-text-muted);
}
.search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--c-text-muted);
  padding: 4px;
  border-radius: var(--r-pill);
}
.search__clear:hover {
  background: var(--c-bg-3);
  color: var(--c-text);
}
.btn--sm {
  padding: var(--sp-1) var(--sp-3);
  font-size: 0.8rem;
}
</style>
