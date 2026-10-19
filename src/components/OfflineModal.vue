<script setup>
import { ui, actions, state } from '@/game/store'
import { fmt, fmtAmount, fmtTime } from '@/game/format'
</script>

<template>
  <div v-if="ui.offlineReport" class="mask" @click.self="actions.dismissOffline()">
    <div class="dialog">
      <div class="dialog-head">闭关归来</div>
      <div class="dialog-body">
        <div class="small dim">
          你离开了 <b class="good">{{ fmtTime(ui.offlineReport.awaySeconds) }}</b
          >，弟子们替你打理了宗门<template v-if="ui.offlineReport.capped">
            （离线收益最多结算 {{ fmtTime(ui.offlineReport.simulatedSeconds) }}，修习《龟息功》可延长）</template
          >。
        </div>

        <div v-if="ui.offlineReport.estimated" class="small dim" style="padding-top: 4px">
          长离线的收益为估算，可能与在线挂机不同。
        </div>

        <div v-if="ui.offlineReport.disciples > 0" class="small good" style="padding-top: 4px">
          另有 {{ ui.offlineReport.disciples }} 名弟子慕名而来。
        </div>

        <div v-if="ui.offlineReport.readyToBreak > 0" class="small" style="padding-top: 4px">
          {{ ui.offlineReport.readyToBreak }} 名弟子修满待突破<template v-if="state.settings.autoBreakthrough">——离线不自动突破，可回游戏处理</template>。
        </div>

        <table class="grid" v-if="ui.offlineReport.gains.length" style="margin-top: 6px">
          <tbody>
            <tr v-for="g in ui.offlineReport.gains" :key="g.id">
              <td class="dim nowrap">{{ g.name }}</td>
              <td class="num good">+{{ fmtAmount(g.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">
          这段闭关没有净增的库存：可能库房已满、供料不足，或收获刚好被口粮与维护吃掉。
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn primary" @click="actions.dismissOffline()">继续摸鱼</button>
      </div>
    </div>
  </div>
</template>
