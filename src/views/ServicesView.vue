<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, Plus, Search, X } from '@lucide/vue'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import ServiceCard from '@/components/ServiceCard.vue'
import ServiceEditor from '@/components/ServiceEditor.vue'

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
      <div>
        <h1>Services</h1>
        <p class="page-intro">Set lists, ready when the room is.</p>
      </div>
      <div class="section-title__actions">
        <button class="btn btn--primary" @click="editorOpen = true">
          <Plus :size="16" /> New service
        </button>
      </div>
    </div>

    <div v-if="!services.loading && services.services.length > 0" class="search">
      <Search :size="16" />
      <input
        v-model="query"
        type="search"
        class="search__input"
        placeholder="Search by service name or song…"
        aria-label="Search services"
      />
      <button v-if="query" class="search__clear" title="Clear" @click="query = ''">
        <X :size="14" />
      </button>
    </div>

    <div v-if="services.loading" class="empty"><p>Loading…</p></div>

    <div v-else-if="services.services.length === 0" class="empty">
      <div class="empty__icon"><Calendar :size="32" :stroke-width="1.25" /></div>
      <h3>No services yet</h3>
      <p>
        Create a service for each worship occasion — Sunday morning, Wednesday prayer, Easter, and
        so on — and arrange songs into a playlist.
      </p>
      <button class="btn btn--primary" @click="editorOpen = true">
        <Plus :size="14" :stroke-width="2" /> Create your first service
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
.empty__icon {
  width: 68px;
  height: 68px;
  margin: 0 auto var(--sp-4);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: #e9e9ed;
  color: var(--c-accent);
  box-shadow: none;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 24px 18px;
}
.page-intro { margin-top: 5px; color: var(--c-text-muted); font-size: .92rem; font-weight: 450; letter-spacing: -.01em; }
.search {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 14px;
  background: rgba(118, 118, 128, .12);
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--c-text-muted);
  max-width: 480px;
  margin-bottom: var(--sp-5);
  height: 36px;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}
.search:focus-within {
  background: var(--c-surface-raised);
  border-color: var(--c-border-strong);
  box-shadow: var(--sh-sm);
}
.search__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--c-text);
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
  background: rgba(0, 0, 0, 0.08);
  color: var(--c-text);
}
.btn--sm {
  height: 28px;
  padding: 0 12px;
  font-size: 0.78rem;
}
</style>
