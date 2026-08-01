const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  if (wxContext.OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { status = 'pending' } = event
  const res = await db.collection('carpool_station_requests')
    .where({ status })
    .orderBy('createdAt', 'desc')
    .get()

  return { requests: res.data }
}
