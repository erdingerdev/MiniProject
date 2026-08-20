const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MCHID = '1748358912'
const APPID = 'wxbcd464dd28d81bc1'
const API_KEY = '2sg2wWIoR9cYaK2OtuBEYXbrAZ0R5etm'

const crypto = require('crypto')

function sign(timestamp, nonceStr, prepayId) {
  const str = `appId=${APPID}&nonceStr=${nonceStr}&package=prepay_id=${prepayId}&signType=MD5&timeStamp=${timestamp}&key=${API_KEY}`
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase()
}

// 过滤 emoji 和不可打印字符，保留中文/英文/数字/常用标点
function sanitize(str) {
  return (str || '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{FE0F}\u{E0020}-\u{E007F}]/gu, '')
}

// 转义 XML 特殊字符
function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// 截断到指定字节数（UTF-8 中文 3 字节/字）
function truncateBytes(str, maxBytes) {
  let bytes = 0, i = 0
  for (; i < str.length; i++) {
    const c = str.charCodeAt(i)
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3
    if (bytes > maxBytes) break
  }
  return str.slice(0, i)
}

exports.main = async (event, context) => {
  const { openid, amount, nickname, pool, peopleCount } = event
  // 微信支付 body 限制 128 字节，留余量截断
  let nick = sanitize(nickname || '')
  if (!nick) {
    // 反查通行码兜底
    try {
      const user = await db.collection('app_users').where({ _openid: openid }).get()
      const ids = user.data[0]?.boundPasscodeIds || []
      if (ids.length > 0) {
        const pcs = await db.collection('passcodes').where({
          _id: _.in(ids),
          category: pool,
          deleted: false
        }).get()
        if (pcs.data.length > 0) {
          nick = `[${pcs.data[0].name}]用户`
        }
      }
    } catch {}
    if (!nick) nick = pool ? `[${pool}]用户` : '用户'
  }
  let description = `${nick}【${pool || '游泳'}】x${peopleCount || 1}人`
  description = truncateBytes(description, 120)

  // 生成订单号
  const outTradeNo = 'PAY' + Date.now() + Math.random().toString(36).slice(2, 6)

  // 调用微信支付统一下单 APIv2（兼容性更好）
  const https = require('https')
  const xml2js = require('xml2js')

  const params = {
    appid: APPID,
    mch_id: MCHID,
    nonce_str: Math.random().toString(36).slice(2, 18),
    body: description,
    out_trade_no: outTradeNo,
    total_fee: Math.round(amount * 100), // 金额（分）
    spbill_create_ip: '127.0.0.1',
    notify_url: 'https://erdinger-dev-d0gzsgzbo6e40458d.service.tcloudbase.com/wxpay/notify',
    trade_type: 'JSAPI',
    openid: openid
  }

  // 生成签名（用原始值，不做 XML 转义）
  const sortedKeys = Object.keys(params).sort()
  let signStr = ''
  for (const k of sortedKeys) {
    if (params[k] !== undefined && params[k] !== '') {
      signStr += `${k}=${params[k]}&`
    }
  }
  signStr += `key=${API_KEY}`
  params.sign = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase()

  // 转 XML（构建时才对字段值做 XML 转义）
  let xml = '<xml>'
  for (const k of Object.keys(params)) {
    xml += `<${k}>${escapeXml(String(params[k]))}</${k}>`
  }
  xml += '</xml>'

  // 调用统一下单
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.mch.weixin.qq.com',
      path: '/pay/unifiedorder',
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' }
    }, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        xml2js.parseString(body, (err, result) => {
          if (err) { resolve({ ok: false, error: '解析失败' }); return }
          const data = result.xml
          console.log('WXPay response:', JSON.stringify(data))
          if (data.return_code[0] !== 'SUCCESS' || data.result_code[0] !== 'SUCCESS') {
            const errMsg = data.err_code_des ? data.err_code_des[0] : (data.return_msg ? data.return_msg[0] : '下单失败')
            console.error('WXPay error:', errMsg)
            resolve({ ok: false, error: errMsg })
            return
          }

          const prepayId = data.prepay_id[0]
          const nonceStr = Math.random().toString(36).slice(2, 18)
          const timestamp = Math.floor(Date.now() / 1000).toString()
          const paySign = sign(timestamp, nonceStr, prepayId)

          resolve({
            ok: true,
            outTradeNo,
            payment: {
              timeStamp: timestamp,
              nonceStr,
              package: `prepay_id=${prepayId}`,
              signType: 'MD5',
              paySign
            }
          })
        })
      })
    })
    req.on('error', () => resolve({ ok: false, error: '网络错误' }))
    req.write(xml)
    req.end()
  })
}
