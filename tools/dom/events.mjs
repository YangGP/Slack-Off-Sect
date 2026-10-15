import { EVENT_MAP } from '../../src/data/events.js'

export async function checkEvents(context) {
  let { ok, window, state, derived, actions, engine, text } = context
  console.log('\n== 事件选择 ==')
  state.pendingChoice = null
  state.resources.wood = 100
  engine.recompute(state, derived)
  engine.fireEvent(state, derived, { id: 'ancientCave', type: 'choice', text: '发现古洞' })
  await new Promise((r) => setTimeout(r, 50))
  ok('未决选择正常渲染', !!window.document.querySelector('.choice'))
  ok('选择展示实际代价', window.document.querySelector('.choice-preview')?.textContent.includes('灵木 −12'))
  window.document.querySelector('.choice-row button')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('点击选择清除待决并扣除代价', !state.pendingChoice && state.resources.wood === 88)
  ok('选择结算立即保存', JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).pendingChoice === null)
  ok('选择结算后按钮消失', !window.document.querySelector('.choice'))
  state.resources.herb = 0
  engine.fireEvent(state, derived, { id: 'caravan', type: 'choice', text: '商队到访' })
  await new Promise((r) => setTimeout(r, 50))
  ok('不足用料的交易选项禁用且说明所需材料', window.document.querySelector('.choice-row button')?.disabled && window.document.querySelector('.choice-preview')?.textContent.includes('材料不足'))
  const decline = [...window.document.querySelectorAll('.choice-row button')].find(b => b.textContent === '暂不介入')
  ok('材料不足时仍可不介入', !!decline && !decline.disabled)
  decline?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('不介入按钮可正常结束事件', !state.pendingChoice && !window.document.querySelector('.choice'))
  const beforeThreat = JSON.stringify(state)
  state.realm = 4
  state.affairs = { beastPeaceUntil: 0, beastCooldownUntil: 0 }
  state.resources.arrayBase = 0
  state.resources.talisman = 0
  state.resources.herb = 100
  engine.recompute(state, derived)
  engine.fireEvent(state, derived, EVENT_MAP.beastThreat)
  await new Promise((r) => setTimeout(r, 50))
  const threatButtons = [...window.document.querySelectorAll('.choice-row button')]
  ok('妖兽事务展示四种应对且不能免费取消', threatButtons.length === 4 && !threatButtons.some(b => b.textContent === '暂不介入'))
  ok('妖兽事务展示期限与默认方案', text().includes('到期依现有阵法防守'))
  ok('待决事务显示宗门等级', window.document.querySelector('.choice-head')?.textContent.includes('二级·金丹至化神'))
  ok('缺料时加固禁用，默认防守可操作', threatButtons[0]?.disabled && !threatButtons[3]?.disabled)
  state.resources.arrayBase = 1
  state.resources.talisman = 2
  await new Promise((r) => setTimeout(r, 50))
  window.document.querySelector('.choice-row button')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('点击加固实际扣料并清除威胁', !state.pendingChoice && state.resources.arrayBase === 0 && state.resources.talisman === 0)
  ok('处理后展示药圃安宁且立即存档', text().includes('药圃安宁') && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).affairs.beastPeaceUntil > Date.now())
  actions.importText(beforeThreat)
  await new Promise((r) => setTimeout(r, 50))
  Object.assign(context, { ok, window, state, derived, actions, engine, text })
}
