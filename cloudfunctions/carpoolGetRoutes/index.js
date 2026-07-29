const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { page = 1, pageSize = 20 } = event
  const now = Date.now()

  const res = await db.collection('carpool_routes')
    .where({ status: 'approved', expiresAt: _.gt(now) })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 不下发联系方式
  const routes = res.data.map(r => ({
    _id: r._id, type: r.type, nickname: r.nickname, avatar: r.avatar,
    origin: r.origin, destination: r.destination, departTime: r.departTime,
    peopleCount: r.peopleCount, note: r.note, createdAt: r.createdAt
  }))

  return { routes }
}
