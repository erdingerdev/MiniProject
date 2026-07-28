const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { skip = 0, limit = 20 } = event
  // 统计缓存（穿码映射 + 使用次数）
  const pcMap = {}
  let pcSkip = 0
  while (true) {
    const r = await db.collection('passcodes').where({ deleted: false }).skip(pcSkip).limit(100).get()
    if (r.data.length === 0) break
    r.data.forEach(p => { pcMap[p._id] = p.name })
    if (r.data.length < 100) break
    pcSkip += 100
  }
  const logStats = {}
  for (const coll of ['orders', 'checkins', 'usage_logs']) {
    let s = 0
    while (true) {
      try {
        const r = await db.collection(coll).skip(s).limit(100).get()
        if (r.data.length === 0) break
        r.data.forEach(l => { logStats[l.openid] = (logStats[l.openid] || 0) + (l.peopleCount || 1) })
        if (r.data.length < 100) break
        s += 100
      } catch { break }
    }
  }
  const [countRes, res] = await Promise.all([
    db.collection('app_users').count(),
    db.collection('app_users').skip(skip).limit(limit).get()
  ])
  const totalUsers = countRes.total
  const list = res.data.map(u => {
    const names = (u.boundPasscodeIds || []).map(id => pcMap[id] || '').filter(Boolean)
    return {
      openid: u.openid, nickname: u.nickname, avatar: u.avatar,
      boundPasscodeName: names.join(', ') || '无',
      totalCount: logStats[u.openid] || 0
    }
  }).sort((a, b) => b.totalCount - a.totalCount)
  return { ok: true, list, total: totalUsers }
}
