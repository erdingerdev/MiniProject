const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  if (wxContext.OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { routeId, action, reason } = event
  if (!routeId || !action) return { ok: false, error: '参数错误' }

  if (action === 'approve') {
    await db.collection('carpool_routes').doc(routeId).update({
      data: { status: 'approved', rejectReason: '' }
    })
  } else if (action === 'reject') {
    await db.collection('carpool_routes').doc(routeId).update({
      data: { status: 'rejected', rejectReason: reason || '' }
    })
    // 拒绝后清理互动
    await db.collection('carpool_interactions').where({ routeId }).remove()
  } else if (action === 'delete') {
    await db.collection('carpool_routes').doc(routeId).remove()
    await db.collection('carpool_interactions').where({ routeId }).remove()
  }

  return { ok: true }
}
