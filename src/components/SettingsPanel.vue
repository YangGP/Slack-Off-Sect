<script setup>
import { ref } from 'vue'
import { state, derived, actions, ui, saveNow } from '@/game/store'
import { fmtClock, fmtTime, fmt } from '@/game/format'
import { CONFIG } from '@/data/config'

const fileInput = ref(null)
const importing = ref(false)
const importError = ref('')

function doExport() {
  try {
    const blob = new Blob([actions.exportText()], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `摸鱼宗门存档-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    importError.value = ''
  } catch (err) {
    importError.value = '导出失败：' + (err?.message || '无法下载文件')
  }
}

async function doImport(event) {
  const input = event.target
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  importError.value = ''
  try {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('无法读取文件'))
      reader.onabort = () => reject(new Error('文件读取已取消'))
      reader.readAsText(file, 'utf-8')
    })
    actions.importText(text)
    importError.value = '读档成功'
  } catch (err) {
    importError.value = '导入失败：' + (err?.message || '格式不正确')
  } finally {
    input.value = ''
    importing.value = false
  }
}

function doReset() {
  if (window.confirm('确定要重新开山立派吗？当前进度会被清空（成就与仙缘也一并清空）。')) {
    actions.resetGame()
    importError.value = ''
  }
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      存档<span class="hint">
        上次保存 {{ fmtClock(ui.lastSavedAt || state.lastSaveAt) }}，自动保存每
        {{ CONFIG.AUTOSAVE_MS / 1000 }} 秒
      </span>
    </div>
    <div class="box-body">
      <div class="btn-row">
        <button class="btn primary" @click="saveNow()">立即存档</button>
        <button class="btn" @click="doExport">导出存档</button>
        <button class="btn" :disabled="importing" @click="fileInput.click()">{{ importing ? '读取中…' : '读取存档' }}</button>
        <button class="btn danger" :disabled="importing" @click="doReset">重新开山（清档）</button>
      </div>
      <input ref="fileInput" type="file" accept=".txt,.json,text/plain,application/json" aria-label="上传存档文件" hidden @change="doImport">
      <div class="small dim" style="padding-top: 6px">导出下载存档文件；读取选择本地文件，将覆盖当前进度。支持旧版文本存档和 JSON 存档。</div>
      <div v-if="importError" class="small warn" role="status" style="padding-top: 6px">{{ importError }}</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">挂机设置</div>
    <div class="box-body">
      <label class="sw">
        <input
          type="checkbox"
          :checked="state.settings.autosave"
          @change="actions.setSetting('autosave', $event.target.checked)"
        />
        自动存档
      </label>
      <label class="sw">
        <input
          type="checkbox"
          :checked="state.settings.offlineProgress"
          @change="actions.setSetting('offlineProgress', $event.target.checked)"
        />
        离线收益
      </label>
      <label class="sw">
        <input
          type="checkbox"
          :checked="state.settings.autoCraftOn"
          @change="actions.setSetting('autoCraftOn', $event.target.checked)"
        />
        自动制作总开关
      </label>
      <div class="small dim" style="padding-top: 4px">
        离线收益上限 {{ fmt(derived.offlineHours) }} 小时（参悟《龟息功》可 +8 小时）；
        自动制作需要先参悟《心有灵犀》，之后在左栏炼制块里逐项勾选。
      </div>
    </div>
  </div>

  <div v-if="ui.debug" class="box">
    <div class="box-head">
      山中趣事<span class="hint">手动触发一次随机奇遇（调试用）</span>
    </div>
    <div class="box-body">
      <button class="btn" @click="actions.triggerEvent()">来一次奇遇</button>
      <span class="small dim">
        正常每 2.5 ~ 7 分钟自动发生一次奇遇或天灾，结果写进右侧「宗门纪事」。
      </span>
    </div>
  </div>

  <div class="box">
    <div class="box-head">关于</div>
    <div class="box-body">
      <div class="kv"><span class="k">游戏</span><span class="v">摸鱼宗门 · Slack Off Sect</span></div>
      <div class="kv"><span class="k">技术栈</span><span class="v">Vue 3 + Vite（纯 JavaScript）</span></div>
      <div class="kv">
        <span class="k">参考</span><span class="v">猫国建设者（Kittens Game）的放置玩法与数据结构</span>
      </div>
      <div class="kv">
        <span class="k">本次挂机</span><span class="v">{{ fmtTime(state.stats.playTime) }}</span>
      </div>
      <div class="kv">
        <span class="k">设计文档</span><span class="v">docs/DESIGN.md</span>
      </div>
    </div>
  </div>
</template>
