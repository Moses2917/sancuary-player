<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { Calendar, Church, Music, Smartphone } from '@lucide/vue'

const route = useRoute()
</script>

<template>
  <header class="app-header">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <RouterLink to="/" class="brand" aria-label="Sanctuary home">
      <span class="brand__mark" aria-hidden="true"><Church :size="22" :stroke-width="1.75" /></span>
      <span class="brand__text">Sanctuary<span class="brand__sub">Music for worship</span></span>
    </RouterLink>
    <p class="nav-label">Your workspace</p>
    <nav class="nav" aria-label="Main navigation">
      <RouterLink
        to="/services"
        class="nav__link"
        :class="{ 'nav__link--active': route.name === 'service-detail' }"
        :aria-current="route.name === 'service-detail' ? 'page' : undefined"
        active-class="nav__link--active"
      >
        <Calendar :size="19" :stroke-width="1.75" aria-hidden="true" />
        <span>Player</span>
      </RouterLink>
      <RouterLink to="/library" class="nav__link" active-class="nav__link--active">
        <Music :size="19" :stroke-width="1.75" aria-hidden="true" />
        <span>Library</span>
      </RouterLink>
      <RouterLink to="/remote" class="nav__link" active-class="nav__link--active">
        <Smartphone :size="19" :stroke-width="1.75" aria-hidden="true" />
        <span>Remote Control</span>
      </RouterLink>
    </nav>
    <div class="sidebar-note">
      <Music :size="20" :stroke-width="1.25" aria-hidden="true" />
      <p>A little preparation.<br />Room for worship.</p>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 30;
  width: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  padding: max(32px, env(safe-area-inset-top)) 16px 24px;
  background: #f5f5f7;
  border-right: 1px solid var(--c-border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  color: var(--c-text);
}
.brand__mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(145deg, #fb6480, #d92f4f);
  box-shadow: 0 3px 8px #d92f4f20;
  color: white;
}
.brand__text {
  font-size: 1.2rem;
  font-weight: 650;
  letter-spacing: -0.04em;
}
.brand__sub {
  display: block;
  color: var(--c-text-muted);
  font-size: 0.68rem;
  font-weight: 400;
  letter-spacing: 0;
}
.nav-label {
  margin: 44px 12px 8px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--c-text-muted);
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav__link {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  padding: 8px 12px;
  border-radius: 7px;
  color: var(--c-text-soft);
  font-size: 0.9rem;
  transition: background var(--dur-fast) var(--ease);
}
.nav__link svg {
  color: var(--c-accent);
  flex-shrink: 0;
}
.nav__link:hover {
  background: #eaeaec;
}
.nav__link--active {
  background: var(--c-accent-glow);
  color: var(--c-accent);
  font-weight: 600;
}
.sidebar-note {
  margin-top: auto;
  padding: 20px 12px 0;
  color: var(--c-text-muted);
  font-size: 0.75rem;
  line-height: 1.7;
}
.sidebar-note svg {
  margin-bottom: 8px;
  color: var(--c-accent);
}
.skip-link {
  position: absolute;
  top: 8px;
  left: 8px;
  transform: translateY(-200%);
  padding: 8px 12px;
  background: white;
  border-radius: 6px;
}
.skip-link:focus {
  transform: none;
}
@media (max-width: 900px) {
  .app-header {
    position: sticky;
    inset: 0 0 auto;
    width: 100%;
    padding: env(safe-area-inset-top) max(16px, env(safe-area-inset-right)) 0
      max(16px, env(safe-area-inset-left));
    background: rgba(248, 248, 250, 0.94);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-right: none;
    border-bottom: 1px solid var(--c-border);
  }
  .brand {
    height: 60px;
    padding: 0;
  }
  .brand__mark {
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }
  .brand__sub,
  .nav-label,
  .sidebar-note {
    display: none;
  }
  .nav {
    flex-direction: row;
    height: 52px;
    padding-bottom: 8px;
  }
  .nav__link {
    flex: 1;
    justify-content: center;
    gap: 7px;
    padding: 8px;
    font-size: 0.8rem;
    min-height: 44px;
    white-space: nowrap;
  }
}
</style>
