<script setup>
import { ref } from 'vue'
import { state, derived, actions, ui, saveNow } from '@/game/store'
import { fmtClock, fmtTime, fmt } from '@/game/format'
import { CONFIG } from '@/data/config'
import { MODULES, isModuleEnabled } from '@/data/modules'
import HoverTip from './HoverTip.vue'

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
    importError.value = ui.saveRecoveryNotice || '读档成功'
  } catch (err) {
    importError.value = '导入失败：' + (err?.message || '格式不正确')
  } finally {
    input.value = ''
    importing.value = false
  }
}

function doReset() {
  if (window.confirm('确定要彻底重开吗？当前新代进度、成就、仙缘、道果与道心都会被清空；旧代备份不会被删除。')) {
    actions.resetGame()
    importError.value = ''
  }
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      <HoverTip label="存档"><template #tip><p>导出下载存档文件；读取选择本地文件，将覆盖当前进度。支持旧版文本存档和JSON存档；结构冲突时仅继承仙缘和道果。</p></template></HoverTip><span class="hint">
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
      <div class="small dim" style="padding-top: 6px">读取存档将覆盖当前进度。</div>
      <div v-if="importError" class="small warn" role="status" style="padding-top: 6px">{{ importError }}</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head"><HoverTip label="挂机设置"><template #tip><p>《龟息功》延长离线收益上限。参悟《心有灵犀》或取得首颗道果后，可在炼制页逐项勾选自动配方；总开关控制所有自动制作。</p></template></HoverTip></div>
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
          :checked="state.settings.analyticsEnabled"
          @change="actions.setSetting('analyticsEnabled', $event.target.checked)"
        />
        允许游玩数据采集
      </label>
      <div v-if="state.settings.analyticsEnabled" class="small dim" role="status" style="padding-top: 4px">
        {{ ui.analyticsStatus === 'loading' ? '正在开启数据采集…' : ui.analyticsStatus === 'ready' ? '数据采集已启用' : ui.analyticsStatus === 'failed' ? '数据采集未能开启，不影响游戏' : '已允许采集，当前未启动' }}
      </div>
      <label class="sw">
        <input
          type="checkbox"
          :checked="state.settings.autoCraftOn"
          @change="actions.setSetting('autoCraftOn', $event.target.checked)"
        />
        自动制作总开关
      </label>
      <div class="small dim" style="padding-top: 4px">
        离线收益上限 {{ fmt(derived.offlineHours) }} 小时
      </div>
      <div class="small dim" style="padding-top: 10px">
        <HoverTip label="玩法模块"><template #tip><p>可选内容模块，默认开启。关闭后隐藏该模块的页面与相关建筑、岗位、研究，并召回出征中的弟子；主线照常运行，进度保留在存档里，随时可以重新开启。</p></template></HoverTip>
      </div>
      <label v-for="m in MODULES" :key="m.id" class="sw">
        <input
          type="checkbox"
          :checked="isModuleEnabled(state, m.id)"
          @change="actions.setModuleEnabled(m.id, $event.target.checked)"
        />
        {{ m.name }}
      </label>
    </div>
  </div>

  <div class="box">
    <div class="box-head">关于</div>
    <div class="box-body">
      <div class="kv"><span class="k">游戏</span><span class="v">摸鱼宗门 · Slack Off Sect</span></div>
      <div class="kv">
        <span class="k">参考</span><span class="v">猫国建设者（Kittens Game）的放置玩法与数据结构</span>
      </div>
      <div class="kv">
        <span class="k">本次挂机</span><span class="v">{{ fmtTime(state.stats.playTime) }}</span>
      </div>
    </div>
  </div>
</template>
