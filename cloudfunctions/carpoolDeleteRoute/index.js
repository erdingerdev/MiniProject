const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const DAILY_LIMIT = 5

exports.main = async (event) => {
  const { openid } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  if (!uid) return { ok: false, error: '未登录' }

  const res = await db.collection('carpool_routes').where({ openid: uid }).get()
  if (res.data.length === 0) return { ok: false, error: '你还没有发布帖子' }

  // 检查每日次数
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const countRes = await db.collection('carpool_publish_logs').where({
    openid: uid,
    createdAt: _.gte(today.getTime())
  }).count()
  if (countRes.total >= DAILY_LIMIT) return { ok: false, error: '今日操作次数已用完，明天再来吧' }

  const routeId = res.data[0]._id
  await db.collection('carpool_routes').doc(routeId).remove()
  await db.collection('carpool_interactions').where({ routeId }).remove()

  // 记录操作日志
  await db.collection('carpool_publish_logs').add({ data: { openid: uid, createdAt: Date.now() } })

  return { ok: true }
}
