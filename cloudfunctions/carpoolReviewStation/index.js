const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  if (wxContext.OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { requestId, action } = event
  if (!requestId) return { ok: false, error: '参数错误' }
  if (!['approve', 'reject'].includes(action)) return { ok: false, error: '操作无效' }

  const reqDoc = await db.collection('carpool_station_requests').doc(requestId).get()
  if (!reqDoc.data || reqDoc.data.status !== 'pending') return { ok: false, error: '该申请已处理' }

  if (action === 'approve') {
    // 通过 → 写入站点表
    await db.collection('carpool_stations').add({
      data: { name: reqDoc.data.name, direction: '' }
    })
  }

  await db.collection('carpool_station_requests').doc(requestId).update({
    data: { status: action === 'approve' ? 'approved' : 'rejected', reviewedAt: Date.now() }
  })

  return { ok: true }
}
