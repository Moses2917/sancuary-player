import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: { name: 'services' },
    },
    {
      path: '/services',
      name: 'services',
      component: () => import('@/views/ServicesView.vue'),
    },
    {
      path: '/services/:id',
      name: 'service-detail',
      component: () => import('@/views/ServiceDetailView.vue'),
      props: true,
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('@/views/LibraryView.vue'),
    },
    {
      path: '/now-playing',
      name: 'now-playing',
      component: () => import('@/views/NowPlayingView.vue'),
      meta: { bare: true },
    },
  ],
})

export default router
