import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { startLoop } from './game/store'

createApp(App).mount('#app')
startLoop()
