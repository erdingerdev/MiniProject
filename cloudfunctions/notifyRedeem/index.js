const https = require('https')

const WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=296d1c58-c3c3-49df-bd5a-5b781f404842'

// 过滤 emoji
function sanitize(str) {
  return (str || '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{FE0F}\u{E0020}-\u{E007F}]/gu, '')
}

exports.main = async (event) => {
  const { pool, nickname, peopleCount, remainCount } = event
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const content = `剩余:${remainCount || '未填'}次\n人数:${peopleCount || 0}人\n昵称:${sanitize(nickname) || '无'}\n泳池:${pool || '未知'}\n时间:${now}`

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
