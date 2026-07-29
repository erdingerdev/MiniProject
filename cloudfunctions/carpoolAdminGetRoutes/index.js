const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  if (wxContext.OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { status = 'pending', page = 1, pageSize = 20 } = event

  const res = await db.collection('carpool_routes')
    .where({ status })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  const countRes = await db.collection('carpool_routes').where({ status }).count()

  return { routes: res.data, total: countRes.total }
}
