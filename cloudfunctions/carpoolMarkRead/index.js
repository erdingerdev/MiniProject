const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { openid, interactionIds } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  if (!uid) return { ok: false, error: '未登录' }

  const ids = interactionIds || []
  if (ids.length === 0) {
    // 全部标记已读
    const res = await db.collection('carpool_interactions')
      .where({ routeOwnerOpenid: uid, read: false })
      .get()
    for (const item of res.data) {
      await db.collection('carpool_interactions').doc(item._id).update({ data: { read: true } })
    }
  } else {
    for (const id of ids) {
      await db.collection('carpool_interactions').doc(id).update({ data: { read: true } })
    }
  }
  return { ok: true }
}
