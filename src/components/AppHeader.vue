<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { CalendarDays, Church, LibraryBig } from '@lucide/vue'
</script>

<template>
  <aside class="app-header">
    <RouterLink to="/" class="brand">
      <span class="brand__mark" aria-hidden="true"><Church :size="18" :stroke-width="1.7" /></span>
      <strong>Sanctuary</strong>
    </RouterLink>

    <nav class="nav" aria-label="Main navigation">
      <p class="nav__label">Library</p>
      <RouterLink to="/services" class="nav__link" active-class="nav__link--active">
        <CalendarDays :size="17" :stroke-width="1.8" />
        <span>Services</span>
      </RouterLink>
      <RouterLink to="/library" class="nav__link" active-class="nav__link--active">
        <LibraryBig :size="17" :stroke-width="1.8" />
        <span>Song Library</span>
      </RouterLink>

    </nav>
  </aside>
</template>

<style scoped>
.app-header {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 40;
  width: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  padding: 25px 12px;
  background: #f6f6f8;
  border-right: 1px solid rgba(60, 60, 67, 0.13);
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
}
.brand { display: flex; align-items: center; gap: 9px; padding: 5px 12px 31px; color: var(--c-text); }
.brand:hover { color: var(--c-text); }
.brand__mark { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 7px; color: #fff; background: var(--c-accent); }
.brand strong { font-size: .95rem; font-weight: 680; letter-spacing: -.025em; }
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav__label { padding: 0 12px; margin: 0 0 6px; color: var(--c-text-muted); font-size: .66rem; font-weight: 700; letter-spacing: .075em; text-transform: uppercase; }
.nav__link { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 11px; border-radius: 7px; color: var(--c-text-soft); font-size: .86rem; font-weight: 530; letter-spacing: -.01em; }
.nav__link:hover { color: var(--c-text); background: rgba(255, 255, 255, .48); }
.nav__link--active { color: var(--c-text); background: rgba(0, 0, 0, .07); box-shadow: none; }
.nav__link--active :deep(svg) { color: var(--c-accent); }

@media (max-width: 780px) {
  .app-header { width: 100%; height: 70px; inset: 0 0 auto; flex-direction: row; align-items: center; padding: 0 13px; border-right: none; border-bottom: 1px solid var(--c-border); }
  .nav__label { display: none; }
  .brand { padding: 0; gap: 8px; }
  .brand__mark { width: 27px; height: 27px; border-radius: 7px; }
  .nav { margin-left: auto; flex-direction: row; gap: 4px; }
  .nav__link { min-height: 34px; padding: 0 9px; font-size: .78rem; }
}
@media (max-width: 420px) { .nav__link span { display: none; } .nav__link { padding: 0 9px; } }
</style>
