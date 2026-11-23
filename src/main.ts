import { createApp } from 'vue'
import App from './ui/App.vue'
import { saves } from './data/save/runtime'

// Settings edits reach the local save after a short debounce, and a write can
// still be in flight. Leaving during either would lose it, so the browser is
// asked to confirm - but only then, never as a routine "are you sure".
window.addEventListener('beforeunload', (event) => {
  if (saves.status.unsaved || saves.status.pending > 0) {
    event.preventDefault()
    event.returnValue = ''
  }
})

createApp(App).mount('#app')
