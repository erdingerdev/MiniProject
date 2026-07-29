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
  // 对于 fromMe 的互动，需要关联路线联系信息
  const fromMeWithContact = await Promise.all(fromMe.data.map(async (item) => {
    try {
      const r = await db.collection('carpool_routes').doc(item.routeId).get()
      return { ...item, routeContact: r.data ? r.data.contact : '', routeDepartTime: r.data ? r.data.departTime : '', routeNickname: r.data ? r.data.nickname : '' }
    } catch { return item }
  }))

  return {
    unreadCount: unread,
    toMe: toMe.data,
    fromMe: fromMeWithContact
  }
}
