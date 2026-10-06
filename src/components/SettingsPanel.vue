<script setup>
import { ref } from 'vue'
import { state, derived, actions, ui, saveNow } from '@/game/store'
import { SAVE_KEY } from '@/game/save'
import { fmtClock, fmtTime, fmt } from '@/game/format'
import { CONFIG } from '@/data/config'

const importText = ref('')
const importError = ref('')
const exportedText = ref('')

function doExport() {
  exportedText.value = actions.exportText()
  importError.value = ''
}

function copyExport() {
  if (!exportedText.value) doExport()
  navigator.clipboard
    ?.writeText(exportedText.value)
    .then(() => (importError.value = '已复制到剪贴板'))
    .catch(() => (importError.value = '复制失败，请手动选中文本复制'))
}

function doImport() {
  try {
    actions.importText(importText.value)
    importError.value = '读档成功'
    importText.value = ''
  } catch (err) {
    importError.value = '导入失败：' + (err?.message || '格式不正确')
  }
}

function doReset() {
  if (window.confirm('确定要重新开山立派吗？当前进度会被清空（成就与仙缘也一并清空）。')) {
    actions.resetGame()
    exportedText.value = ''
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
        <button class="btn" @click="copyExport">复制到剪贴板</button>
        <button class="btn danger" @click="doReset">重新开山（清档）</button>
      </div>

      <div class="small dim" style="padding: 6px 0 2px">存档文本（可复制备份）</div>
      <textarea
        v-model="exportedText"
        placeholder="点击「导出存档」后会在这里生成一串可复制的文本"
      ></textarea>

      <div class="small dim" style="padding: 6px 0 2px">导入存档（粘贴后点「读取」）</div>
      <textarea v-model="importText" placeholder="把导出的存档文本粘贴到这里"></textarea>
      <div class="btn-row" style="padding-top: 6px">
        <button class="btn" @click="doImport">读取</button>
        <span class="small warn">{{ importError }}</span>
        <span class="small dim">存档键名 {{ SAVE_KEY }}</span>
      </div>
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

  <div class="box">
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
