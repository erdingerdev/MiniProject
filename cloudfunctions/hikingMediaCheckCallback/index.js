const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const crypto = require('crypto')

// 微信公众平台「消息推送」里配置的 Token（仅 URL 模式用到，云函数模式不需要）
const TOKEN = 'hikingcheck2026'

function getMethod(event) {
  return (event.httpMethod ||
    (event.requestContext && event.requestContext.http && event.requestContext.http.method) ||
    '').toUpperCase()
}

function getQuery(event) {
  return event.queryStringParameters || event.queryString || event.query || {}
}

function verifySignature(signature, timestamp, nonce) {
  const arr = [TOKEN, String(timestamp), String(nonce)].sort()
  const sha1 = crypto.createHash('sha1').update(arr.join('')).digest('hex')
  return sha1 === signature
}

// 从推送事件里算违规标记：suggest=risky 或 label 非 100（100=正常）
function calcRisky(data) {
  const result = (data && data.result) || {}
  const suggest = result.suggest || ''
  const label = result.label
  return (suggest === 'risky' || (label !== undefined && label !== 100)) ? 1 : 0
}

exports.main = async (event) => {
  // 云函数模式：微信直接调用云函数，event 就是推送的事件数据
  if (event && event.Event === 'wxa_media_check') {
    const traceId = event.trace_id || event.traceId
    if (traceId) await handleResult(traceId, calcRisky(event))
    return 'success'
  }

  // URL 模式：走 HTTP 网关（兼容备用）
  const method = getMethod(event)
  const query = getQuery(event)
  let body = event.body || ''
  if (event.isBase64Encoded && typeof body === 'string' && body) {
    try { body = Buffer.from(body, 'base64').toString('utf-8') } catch (e) {}
  }

  // 微信 URL 有效性验证：GET 返回 echostr
  if (method === 'GET') {
    const { signature, timestamp, nonce, echostr } = query
    if (signature && timestamp && nonce && echostr && verifySignature(signature, timestamp, nonce)) {
      return echostr
    }
    return 'verify fail'
  }

  // 事件推送：POST
  if (method === 'POST') {
    const { signature, timestamp, nonce } = query
    if (signature && timestamp && nonce && !verifySignature(signature, timestamp, nonce)) {
      return 'signature fail'
    }
    let data = body
    if (typeof body === 'string') {
      try { data = JSON.parse(body) } catch (e) { data = null }
    }
    if (data && data.Event === 'wxa_media_check') {
      const traceId = data.trace_id || data.traceId
      if (traceId) await handleResult(traceId, calcRisky(data))
    }
    return 'success'
  }

  return 'success'
}

// 收到一条检测结果：标记 done；该帖所有图都检测完后，按结果定最终状态
async function handleResult(traceId, isrisky) {
  try {
    await db.collection('hiking_media_checks').where({ trace_id: traceId })
      .update({ data: { status: 'done', isrisky } })
    const checkRes = await db.collection('hiking_media_checks').where({ trace_id: traceId }).get()
    if (!checkRes.data || checkRes.data.length === 0) return
    const routeId = checkRes.data[0].routeId
    // 还有图没检测完，继续等
    const allRes = await db.collection('hiking_media_checks').where({ routeId }).get()
    const stillPending = allRes.data.some(c => c.status === 'pending')
    if (stillPending) return
    // 全部检测完：任一违规 → 下架；全过 → 通过
    const hasRisky = allRes.data.some(c => c.isrisky === 1)
    await db.collection('hiking_routes').doc(routeId)
      .update({ data: { status: hasRisky ? 'rejected' : 'approved' } })
  } catch (e) {
    console.error('handleResult error:', e)
  }
}
