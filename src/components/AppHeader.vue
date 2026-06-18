<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Icon from './Icon.vue'
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink to="/" class="brand">
        <span class="brand__mark">
          <Icon name="cross" :size="18" :stroke-width="0" />
        </span>
        <span class="brand__text">
          <span class="brand__title">Sanctuary</span>
          <span class="brand__sub">Player</span>
        </span>
      </RouterLink>
      <nav class="nav">
        <RouterLink to="/services" class="nav__link" active-class="nav__link--active">
          <Icon name="calendar" :size="18" />
          <span>Services</span>
        </RouterLink>
        <RouterLink to="/library" class="nav__link" active-class="nav__link--active">
          <Icon name="music" :size="18" />
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
  background: linear-gradient(
    180deg,
    rgba(11, 16, 32, 0.92),
    rgba(11, 16, 32, 0.6)
  );
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
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
  display: flex;
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
  width: 38px;
  height: 38px;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--c-accent), var(--c-accent-deep));
  color: #1a1208;
  box-shadow: var(--sh-glow);
}
.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1;
}
.brand__title {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.brand__sub {
  font-size: 0.7rem;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--c-text-muted);
}
.nav {
  margin-left: auto;
  display: flex;
  gap: var(--sp-2);
}
.nav__link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--r-md);
  color: var(--c-text-soft);
  font-weight: 500;
  font-size: 0.92rem;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.nav__link:hover {
  color: var(--c-text);
  background: var(--c-bg-3);
}
.nav__link--active {
  color: var(--c-accent);
  background: rgba(227, 184, 115, 0.1);
}

@media (max-width: 560px) {
  .app-header__inner {
    gap: var(--sp-3);
    padding: 0 var(--sp-4);
  }
  .brand__sub {
    display: none;
  }
  .nav__link span {
    display: none;
  }
  .nav__link {
    padding: var(--sp-2);
  }
}
</style>
