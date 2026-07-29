const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { openid, interactionId } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  if (!uid) return { ok: false, error: '未登录' }

  const res = await db.collection('carpool_interactions').doc(interactionId).get()
  if (!res.data) return { ok: false, error: '记录不存在' }
  if (res.data.routeOwnerOpenid !== uid) return { ok: false, error: '无权操作' }

  await db.collection('carpool_interactions').doc(interactionId).remove()
  return { ok: true }
}
