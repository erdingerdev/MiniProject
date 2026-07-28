const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data } = event

  // 检查独占通行码是否已被他人绑定（所有用户可调用）
  if (action === 'checkExclusive') {
    const res = await db.collection('app_users').where({ boundPasscodeIds: data.passcodeId }).get()
    return { ok: true, bound: res.data.length > 0 }
  }

  // 以下操作仅管理员
  if (OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  // 获取通行码详情（绑定用户列表+使用统计）
  if (action === 'getPasscodeDetail') {
    const pc = await db.collection('passcodes').doc(data.passcodeId).get()
    if (!pc.data || pc.data.deleted) return { ok: false, error: 'not found' }
    const users = await db.collection('app_users').where({ boundPasscodeIds: data.passcodeId }).get()
    const logs = { data: [] }
    for (const coll of ['orders', 'checkins', 'usage_logs']) {
      try {
        const r = await db.collection(coll).where({ passcodeId: data.passcodeId }).get()
        logs.data.push(...r.data)
      } catch {}
    }
    const boundUsers = users.data.map(u => {
      const uLogs = logs.data.filter(l => l.openid === u.openid)
      const total = uLogs.reduce((s, l) => s + (l.peopleCount || 1), 0)
      return { openid: u.openid, nickname: u.nickname, avatar: u.avatar, totalCount: total }
    })
    return { ok: true, usageCount: logs.data.length, boundUsers }
  }

  // 解绑用户
  if (action === 'unbindUser') {
    const userRes = await db.collection('app_users').where({ _openid: data.openid }).get()
    if (userRes.data.length > 0) {
      await db.collection('app_users').doc(userRes.data[0]._id).update({ data: { boundPasscodeIds: db.command.pull(data.passcodeId) } })
    }
    return { ok: true }
  }

  // 删除通行码（软删除 + 解绑所有用户）
  if (action === 'deletePasscode') {
    const pcRes = await db.collection('passcodes').doc(data.passcodeId).get()
    if (!pcRes.data || pcRes.data.deleted) return { ok: false, error: 'not found' }
    await db.collection('passcodes').doc(data.passcodeId).update({ data: { deleted: true } })
    // 从所有绑定用户移除
    const users = await db.collection('app_users').where({ boundPasscodeIds: data.passcodeId }).get()
    for (const user of users.data) {
      await db.collection('app_users').doc(user._id).update({ data: { boundPasscodeIds: db.command.pull(data.passcodeId) } })
    }
    return { ok: true }
  }

  return { ok: false, error: '未知操作' }
}
