const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { openid, nickname, routeId } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  if (!uid) return { ok: false, error: '未登录' }

  // 查目标路线
  const routeRes = await db.collection('carpool_routes').doc(routeId).get()
  if (!routeRes.data) return { ok: false, error: '帖子不存在' }
  const route = routeRes.data
  if (route.openid === uid) return { ok: false, error: '不能操作自己的帖子' }
  if (route.status !== 'approved') return { ok: false, error: '帖子暂不可用' }

  // 查自己的路线
  const myRes = await db.collection('carpool_routes').where({ openid: uid }).get()
  const myRoute = myRes.data.length > 0 ? myRes.data[0] : null

  if (route.type === 'driver') {
    // 按钮「我想加入」，乘客点车主帖
    if (myRoute && myRoute.type === 'driver') return { ok: false, error: '需发布找位子帖子' }
  } else {
    // 按钮「我想邀请」，车主点乘客帖
    if (!myRoute || myRoute.type !== 'driver') return { ok: false, error: '需发布找伙伴帖子' }
  }

  // 检查是否已交互过
  const existRes = await db.collection('carpool_interactions')
    .where({ routeId, interactorOpenid: uid })
    .get()
  if (existRes.data.length > 0) return { ok: false, error: '已联系过对方' }

  // 次数限制
  if (route.type === 'driver') {
    // 乘客每天3次
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const countRes = await db.collection('carpool_interactions')
      .where({ interactorOpenid: uid, createdAt: _.gte(today.getTime()) })
      .count()
    if (countRes.total >= 3) return { ok: false, error: '今日联系次数已用完' }

    // 司机座位限制
    const seatRes = await db.collection('carpool_interactions')
      .where({ routeId, type: 'join' })
      .count()
    if (seatRes.total >= (route.peopleCount || 3)) return { ok: false, error: '已成团' }
  } else {
    // 车主最多同时5个邀请
    const invCount = await db.collection('carpool_interactions')
      .where({ interactorOpenid: uid, type: 'invite' })
      .count()
    if (invCount.total >= 5) return { ok: false, error: '邀请已达上限(5人)' }
  }

  // 邀请时，获取发起方（司机）的联系方式存入记录
  let interactorContact = ''
  if (route.type !== 'driver') {
    const myRoute = await db.collection('carpool_routes').where({ openid: uid }).get()
    interactorContact = myRoute.data.length > 0 ? myRoute.data[0].contact : ''
  }

  const interaction = {
    routeId,
    routeOwnerOpenid: route.openid,
    interactorOpenid: uid,
    interactorNickname: nickname || '',
    interactorContact,
    type: route.type === 'driver' ? 'join' : 'invite',
    read: false,
    createdAt: Date.now()
  }

  await db.collection('carpool_interactions').add({ data: interaction })

  // 司机邀请 → 返回自己的联系方式（推送给对方），乘客才看到车主联系方式
  if (route.type !== 'driver') {
    return { ok: true, type: 'invite' }
  }
  return { ok: true, contact: route.contact, type: 'join' }
}
