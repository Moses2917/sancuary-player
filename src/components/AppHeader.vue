<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Calendar, Music } from '@lucide/vue'
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink to="/" class="brand">
        <span class="brand__mark">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2v20M5 22V9l7-5 7 5v13M9 22v-5h6v5" />
          </svg>
        </span>
        <span class="brand__text">Sanctuary</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink to="/services" class="nav__link" active-class="nav__link--active">
          <Calendar :size="15" :stroke-width="1.6" />
          <span>Services</span>
        </RouterLink>
        <RouterLink to="/library" class="nav__link" active-class="nav__link--active">
          <Music :size="15" :stroke-width="1.6" />
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
  background: rgba(244, 240, 231, 0.85);
  backdrop-filter: saturate(180%) blur(10px);
  -webkit-backdrop-filter: saturate(180%) blur(10px);
  border-bottom: 1px solid var(--c-border);
}
.app-header__inner {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 0 var(--sp-5);
  height: var(--header-h);
  display: flex;
  align-items: center;
  gap: var(--sp-6);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-3);
  color: var(--c-text);
}
.brand:hover {
  color: var(--c-text);
}
.brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  color: var(--c-accent);
  transition: color var(--dur-fast) var(--ease);
}
.brand:hover .brand__mark {
  color: var(--c-accent-deep);
}
.brand__text {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.nav {
  margin-left: auto;
  display: flex;
  gap: 2px;
}
.nav__link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  color: var(--c-text-muted);
  font-size: 0.86rem;
  font-weight: 500;
  transition:
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.nav__link:hover {
  color: var(--c-text);
  background: var(--c-bg-3);
}
.nav__link--active {
  color: var(--c-text);
}
.nav__link--active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -2px;
  transform: translateX(-50%);
  width: 18px;
  height: 2px;
  border-radius: var(--r-pill);
  background: var(--c-accent);
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
    padding: var(--sp-2);
  }
}
</style>
