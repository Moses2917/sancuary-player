<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Calendar, Music } from '@lucide/vue'
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink to="/" class="brand">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M5 22V9l7-5 7 5v13M9 22v-5h6v5" />
          </svg>
        </span>
        <span class="brand__text">Sanctuary</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink to="/services" class="nav__link" active-class="nav__link--active">
          <Calendar :size="14" :stroke-width="1.75" />
          <span>Services</span>
        </RouterLink>
        <RouterLink to="/library" class="nav__link" active-class="nav__link--active">
          <Music :size="14" :stroke-width="1.75" />
          <span>Library</span>
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--c-border);
}
.app-header__inner {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 0 var(--sp-5);
  height: var(--header-h);
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--c-text);
}
.brand:hover {
  color: var(--c-text);
}
.brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--c-accent);
  color: #fff;
}
.brand__text {
  font-weight: 650;
  font-size: 1.04rem;
  letter-spacing: -0.02em;
}

.nav {
  margin-left: auto;
  display: flex;
  gap: 2px;
  background: var(--c-bg-2);
  padding: 3px;
  border-radius: var(--r-pill);
}
.nav__link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--r-pill);
  color: var(--c-text-muted);
  font-size: 0.82rem;
  font-weight: 550;
  letter-spacing: -0.005em;
  transition:
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.nav__link:hover {
  color: var(--c-text);
}
.nav__link--active {
  background: var(--c-surface-raised);
  color: var(--c-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 1px rgba(0, 0, 0, 0.04);
}

@media (max-width: 560px) {
  .app-header__inner {
    gap: var(--sp-3);
    padding: 0 var(--sp-4);
  }
  .nav__link span {
    display: none;
  }
  .nav__link {
    padding: 6px 10px;
  }
}
</style>
