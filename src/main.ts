import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Resolve mode before mounting: a direct /remote visit must not mount the local player.
void router.isReady().then(() => app.mount('#app'))
