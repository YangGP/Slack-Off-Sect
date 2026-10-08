<script setup>
import { nextTick, ref } from 'vue'
import { CHANGELOG, CURRENT_VERSION } from '@/data/changelog'

const open = ref(false)
const entry = ref(null)
const closeButton = ref(null)
const body = ref(null)

function cycleFocus() {
  if (document.activeElement === closeButton.value) body.value?.focus()
  else closeButton.value?.focus()
}

async function show() {
  open.value = true
  await nextTick()
  closeButton.value?.focus()
}

async function close() {
  open.value = false
  await nextTick()
  entry.value?.focus()
}
</script>

<template>
  <button ref="entry" class="changelog-entry" type="button" aria-haspopup="dialog" aria-controls="changelog-dialog" :aria-expanded="open" @click="show">
    更新日志 <span class="dim">{{ CURRENT_VERSION }}</span>
  </button>
  <Teleport to="body">
    <div v-if="open" class="mask changelog-mask" @click.self="close" @keydown.esc.stop.prevent="close" @keydown.tab.prevent="cycleFocus">
      <section id="changelog-dialog" class="dialog changelog-dialog" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
        <div id="changelog-title" class="dialog-head">更新日志 <span class="small dim">当前 {{ CURRENT_VERSION }}</span></div>
        <div ref="body" class="dialog-body" tabindex="0" aria-label="版本记录">
          <article v-for="release in CHANGELOG" :key="release.version" class="changelog-release">
            <h2>{{ release.version }} · {{ release.title }} <time class="small dim">{{ release.date }}</time></h2>
            <ul>
              <li v-for="change in release.changes" :key="change">{{ change }}</li>
            </ul>
          </article>
        </div>
        <div class="dialog-foot"><button ref="closeButton" class="btn" type="button" @click="close">关闭</button></div>
      </section>
    </div>
  </Teleport>
</template>
