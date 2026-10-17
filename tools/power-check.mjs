import { auditReachability } from './progression-reachability.mjs'
import { powerFixture, measurePower } from './power-scenarios.mjs'

export function runPowerChecks(E, ok, close) {
  for (const [realm, expected] of [[4, [false, false, false]], [5, [true, false, false]], [6, [true, true, true]], [7, [true, true, true]], [8, [true, true, true]]]) {
    const r = auditReachability(realm)
    ok(`粒子设施可在境界 ${realm} 的来源和仓容内自举`, r.settled && r.state.realm === realm &&
      ['splitArray', 'polarizeArray', 'annihilationFurnace'].every((id, i) => !!r.state.buildings[id]?.count === expected[i]))
  }
  const zero = powerFixture()
  ok('基础供能链从零分子、零灵子、零灵能启动', ['qiParticle', 'yangParticle', 'yinParticle', 'qiEnergy'].every(id => E.moneyIsZero(zero.state.resources[id])))
  zero.advance(60)
  ok('零库存基础链能够产生第一份灵能', E.moneyIsPositive(zero.state.resources.qiEnergy) && zero.derived.buildingSupply.annihilationFurnace > 0.999)
  E.setBuildingPower(zero.state, zero.derived, 'splitArray', 'energy')
  const beforeInvalid = JSON.stringify(zero.state)
  ok('非法供能档不撤销已选高阶模式、不写入状态或纪事', !E.setBuildingPower(zero.state, zero.derived, 'splitArray', 'invalid') && JSON.stringify(zero.state) === beforeInvalid)
  const high = measurePower({ chains: 1, mode: 'energy' })
  ok('一条完整产线切高阶后连续十分钟不自耗停炉', high.fullSeconds === 600 && high.minSupply > 0.999 && E.moneyGt(high.energy, high.energyBefore))
  ok('高阶余能支付维护与逸散后仍有缓冲', E.moneyGt(high.output, high.maintenance.plus(high.energyDecay)))
  const core = measurePower({ chains: 2, core: true })
  ok('两条基础产线能满供未祭炼灵能枢并攒够一份阵印灵能', core.coreSupply === 1 && E.moneyGte(core.energy, E.CRAFT_MAP.condenseAscensionSeal.cost.qiEnergy))
  const gathering = measurePower({ chains: 2, gathering: true })
  ok('灵能引采满供后仍能积累阵印供料', gathering.gatheringSupply === 1 && E.moneyGte(gathering.energy, E.CRAFT_MAP.condenseAscensionSeal.cost.qiEnergy))
  const homes = measurePower({ chains: 2, mode: 'energy', core: true, homes: true })
  ok('住宅环境与灵能枢并用时主产线持续运行', homes.fullSeconds === 600 && homes.coreSupply === 1 && E.moneyIsPositive(homes.energy))

  const online = powerFixture(), offline = powerFixture()
  for (let i = 0; i < 600; i++) online.advance()
  offline.advance(600)
  ok('零库存完整产线在线与离线推进一致', ['qi', 'qiParticle', 'yangParticle', 'yinParticle', 'qiEnergy'].every(id => close(online.state.resources[id], offline.state.resources[id])))

  const starved = powerFixture({ core: true, homes: true })
  const { state: s, derived: d } = starved
  const housing = d.maxDisciples, capacity = d.max.qiEnergy
  for (const id of ['qi', 'qiParticle', 'yangParticle', 'yinParticle', 'qiEnergy']) s.resources[id] = E.money(0)
  E.recompute(s, d)
  starved.advance()
  ok('无启动动力、燃料与余能时停炉停效且不欠账', E.moneyIsZero(d.rates.qiEnergy) && d.upgradeSupply.energyCore === 0 && E.moneyIsZero(s.resources.qiEnergy))
  ok('断供保留住房与实体仓储', d.maxDisciples === housing && E.moneyEq(d.max.qiEnergy, capacity))
  s.resources.qi = E.money(1000000)
  E.recompute(s, d)
  starved.advance(60)
  ok('补回灵气后无需赠送燃料或灵能即可恢复基础链', E.moneyIsPositive(d.rates.qiEnergy) && d.buildingSupply.annihilationFurnace > 0.999)
  for (const id of ['splitArray', 'polarizeArray', 'annihilationFurnace']) s.buildings[id].on = false
  E.recompute(s, d)
  ok('停用粒子设施后不继续收取粒子产线动力', E.moneyIsZero(d.rates.qiEnergy) && ['splitArray', 'polarizeArray', 'annihilationFurnace'].every(id => !(d.buildingSupply[id] > 0)))
}
