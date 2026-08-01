const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { openid } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  if (!uid) return { unreadCount: 0, interactions: [] }

  // 查自己的路线
  const myRes = await db.collection('carpool_routes').where({ openid: uid }).get()
  const myRouteId = myRes.data.length > 0 ? myRes.data[0]._id : null

  // 别人对我的路线的互动（我是 routeOwner）
  const toMe = myRouteId
    ? await db.collection('carpool_interactions')
        .where({ routeOwnerOpenid: uid })
        .orderBy('createdAt', 'desc')
        .get()
    : { data: [] }

  // 我发起的互动（我是 interactor）
  const fromMe = await db.collection('carpool_interactions')
    .where({ interactorOpenid: uid })
    .orderBy('createdAt', 'desc')
    .get()

  // 未读数（别人对我发起的，且未读）
  const unread = toMe.data.filter(i => !i.read).length

  // 对于 toMe 的互动，关联对方昵称（已在 interactorNickname 中）
  // 批量查关联的路线联系方式，避免 N+1
  let fromMeWithContact = fromMe.data
  if (fromMe.data.length > 0) {
    const routeIds = [...new Set(fromMe.data.map(i => i.routeId))]
    const routeMap = {}
    if (routeIds.length > 0) {
      const routesRes = await db.collection('carpool_routes').where({ _id: _.in(routeIds) }).get()
      for (const r of routesRes.data) routeMap[r._id] = r
    }
    fromMeWithContact = fromMe.data.map(item => {
      const r = routeMap[item.routeId]
      return r ? { ...item, routeContact: r.contact || '', routeDepartTime: r.departTime || '', routeNickname: r.nickname || '' } : item
    })
  }

  return {
    unreadCount: unread,
    toMe: toMe.data,
    fromMe: fromMeWithContact
  }
}
