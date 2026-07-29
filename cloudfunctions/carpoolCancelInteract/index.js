const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { openid, routeId } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  if (!uid) return { ok: false, error: '未登录' }

  // 先查发起方（我发起的），再查接收方（发给我的）
  let res = await db.collection('carpool_interactions')
    .where({ routeId, interactorOpenid: uid })
    .get()
  if (res.data.length === 0) {
    res = await db.collection('carpool_interactions')
      .where({ routeId, routeOwnerOpenid: uid })
      .get()
  }
  if (res.data.length === 0) return { ok: false, error: '未找到记录' }

  await db.collection('carpool_interactions').doc(res.data[0]._id).remove()
  return { ok: true }
}
