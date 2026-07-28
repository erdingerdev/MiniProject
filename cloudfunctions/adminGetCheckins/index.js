const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { openid, skip = 0, limit = 30 } = event
  const res = await db.collection('checkins').where({ openid }).orderBy('timestamp', 'desc').skip(skip).limit(limit).get()
  const list = res.data.map(l => ({
    id: l._id, type: l.type || 'payment',
    peopleCount: l.peopleCount || 1,
    formattedTime: l.timestamp ? new Date(new Date(l.timestamp).getTime() + 8*3600000).toISOString().slice(0, 19).replace('T', ' ') : ''
  }))
  return { ok: true, list }
}
