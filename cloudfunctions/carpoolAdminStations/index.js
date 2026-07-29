const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  if (wxContext.OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { action, stationId, name, direction } = event

  if (action === 'list') {
    const res = await db.collection('carpool_stations').get()
    return { stations: res.data }
  }

  if (action === 'add') {
    if (!name) return { ok: false, error: '请输入站点名称' }
    await db.collection('carpool_stations').add({ data: { name, direction: direction || '' } })
    return { ok: true }
  }

  if (action === 'update') {
    if (!stationId) return { ok: false, error: '参数错误' }
    const upd = {}
    if (name !== undefined) upd.name = name
    if (direction !== undefined) upd.direction = direction
    await db.collection('carpool_stations').doc(stationId).update({ data: upd })
    return { ok: true }
  }

  if (action === 'delete') {
    if (!stationId) return { ok: false, error: '参数错误' }
    await db.collection('carpool_stations').doc(stationId).remove()
    return { ok: true }
  }

  return { ok: false, error: '未知操作' }
}
