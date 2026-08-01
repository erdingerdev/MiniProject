const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { openid } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  if (!uid) return { route: null }

  const res = await db.collection('carpool_routes').where({ openid: uid }).get()
  if (res.data.length === 0) return { route: null }

  const route = res.data[0]
  // 标记是否过期
  if (route.expiresAt && route.expiresAt <= Date.now() && route.status === 'approved') {
    route.expired = true
  }
  // 查询关联互动
  const interactions = await db.collection('carpool_interactions')
    .where({ routeId: route._id })
    .orderBy('createdAt', 'desc')
    .get()

  return { route, interactions: interactions.data }
}
