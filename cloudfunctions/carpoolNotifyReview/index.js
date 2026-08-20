const https = require('https')

const WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=0b00845b-9307-4909-b7db-077054be4512'

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { nickname, type, origin, destination, departTime, peopleCount, note, routeId, openid } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const typeText = type === 'driver' ? '找伙伴' : '找位子'
  let content = `【新帖待审核】\n用户：${nickname || '未知'}\n类型：${typeText}\n区间：${origin} → ${destination}\n出发：${departTime}\n人数：${peopleCount || 1}人`
  if (note) content += `\n备注：${note}`
  content += `\n时间：${now}`

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ msgtype: 'text', text: { content } })
    const req = https.request(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, async (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', async () => {
        const r = JSON.parse(body)
        if (r.errcode === 0 && routeId) {
          // 标记已提醒
          await db.collection('carpool_routes').doc(routeId).update({ data: { reminded: true } }).catch(() => {})
        }
        resolve({ ok: r.errcode === 0, result: body })
      })
    })
    req.on('error', e => reject(e))
    req.write(data)
    req.end()
  })
}
