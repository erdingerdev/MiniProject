const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { code } = event
  if (!code) return { error: '缺少 code' }

  const https = require('https')
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=wxbcd464dd28d81bc1&secret=154963e3149397b95ede92bd5f547074&js_code=${code}&grant_type=authorization_code`
  
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          const data = JSON.parse(body)
          if (data.errcode) {
            resolve({ error: data.errmsg })
          } else {
            resolve({ openid: data.openid, session_key: data.session_key })
          }
        } catch {
          resolve({ error: '解析失败' })
        }
      })
    }).on('error', () => resolve({ error: '登录失败' }))
  })
}
