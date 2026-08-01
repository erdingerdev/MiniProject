const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const uid = wxContext.OPENID
  if (!uid) return { ok: false, error: '未登录' }

  const { name } = event
  if (!name || !name.trim()) return { ok: false, error: '请输入站点名称' }

  const trimmed = name.trim()
  if (trimmed.length > 16) return { ok: false, error: '站点名称最长16字' }

  // 检查是否已有同名待审核申请
  const exist = await db.collection('carpool_station_requests')
    .where({ _openid: uid, name: trimmed, status: 'pending' })
    .count()
  if (exist.total > 0) return { ok: false, error: '你已提交过该站点的申请，请等待审核' }

  await db.collection('carpool_station_requests').add({
    data: {
      _openid: uid,
      nickname: event.nickname || '',
      avatar: event.avatar || '',
      name: trimmed,
      status: 'pending',
      createdAt: Date.now()
    }
  })

  return { ok: true }
}
