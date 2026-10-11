import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { initializeGame, startLoop } from './game/store'

initializeGame()
createApp(App).mount('#app')
startLoop()
