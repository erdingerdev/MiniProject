const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { skip = 0, limit = 20 } = event
  const res = await db.collection('orders').orderBy('timestamp', 'desc').skip(skip).limit(limit).get()
  const openids = [...new Set(res.data.map(l => l.openid))]
  let userMap = {}
  if (openids.length > 0) {
    const users = await db.collection('app_users').where({ openid: db.command.in(openids) }).get()
    users.data.forEach(u => { userMap[u.openid] = u.nickname })
  }
  const list = res.data.map(l => ({
    id: l._id, openid: l.openid, type: l.type || 'payment',
    passcodeId: l.passcodeId, passcodeName: l.passcodeName,
    pool: l.pool || l.passcodeName || '', peopleCount: l.peopleCount || 1,
    unitPrice: l.unitPrice || 0, totalPrice: l.totalPrice || 0,
    username: '', password: '',
    paidAt: l.paidAt || 0, timeStr: l.timeStr || '',
    formattedTime: l.timestamp ? new Date(new Date(l.timestamp).getTime() + 8*3600000).toISOString().slice(0, 19).replace('T', ' ') : '',
    nickname: userMap[l.openid] || '匿名', redeemed: l.redeemed || false
  }))
  return { ok: true, list }
}
