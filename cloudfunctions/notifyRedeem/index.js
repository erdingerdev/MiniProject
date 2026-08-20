const https = require('https')

const WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=296d1c58-c3c3-49df-bd5a-5b781f404842'

exports.main = async (event) => {
  const { pool, nickname, peopleCount, remainCount } = event
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const nick = nickname || (pool ? `[${pool}]用户` : '用户')
  const content = `剩余:${remainCount || '未填'}次\n人数:${peopleCount || 0}人\n昵称:${nick}\n泳池:${pool || '未知'}\n时间:${now}`

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      msgtype: 'text',
      text: { content }
    })
    const req = https.request(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => resolve({ ok: true, result: body }))
    })
    req.on('error', e => reject(e))
    req.write(data)
    req.end()
  })
}
