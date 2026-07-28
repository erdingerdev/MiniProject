const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { skip = 0, limit = 20 } = event
  const res = await db.collection('feedback').orderBy('createdAt', 'desc').skip(skip).limit(limit).get()
  const list = res.data.map(f => ({
    id: f._id, openid: f.openid || '', nickname: f.nickname || '匿名',
    content: f.content || '',
    createdAt: f.createdAt ? new Date(new Date(f.createdAt).getTime() + 8*3600000).toISOString().slice(0, 19).replace('T', ' ') : ''
  }))
  return { ok: true, list }
}
