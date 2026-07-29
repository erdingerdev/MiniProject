const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const DAILY_LIMIT = 5

exports.main = async (event) => {
  const { openid, nickname, avatar, type, origin, destination, departTime, peopleCount, contact, note } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID

  if (!uid) return { ok: false, error: '未登录' }
  if (!type || !origin || !destination || !departTime || !contact) return { ok: false, error: '请填写完整信息' }
  if (origin === destination) return { ok: false, error: '起终点不能相同' }

  // 检查每日次数
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const countRes = await db.collection('carpool_publish_logs').where({
    openid: uid,
    createdAt: _.gte(today.getTime())
  }).count()
  if (countRes.total >= DAILY_LIMIT) return { ok: false, error: '今日发布次数已用完，明天再来吧' }

  const now = Date.now()
  const route = {
    openid: uid,
    nickname: nickname || '',
    avatar: avatar || '',
    type,
    origin,
    destination,
    departTime,
    peopleCount: peopleCount || 1,
    contact,
    note: note || '',
    status: 'pending',
    rejectReason: '',
    reminded: false,
    createdAt: now,
    expiresAt: now + 72 * 3600000
  }

  // 查已有帖子，覆盖更新
  const exist = await db.collection('carpool_routes').where({ openid: uid }).get()
  let routeId
  if (exist.data.length > 0) {
    routeId = exist.data[0]._id
    await db.collection('carpool_routes').doc(routeId).update({ data: route })
    // 清理旧互动
    await db.collection('carpool_interactions').where({ routeId }).remove()
  } else {
    const res = await db.collection('carpool_routes').add({ data: route })
    routeId = res._id
  }

  // 记录发布日志
  await db.collection('carpool_publish_logs').add({ data: { openid: uid, createdAt: now } })

  return { ok: true, routeId, overwritten: exist.data.length > 0 }
}
