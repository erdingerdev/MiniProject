const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const MCHID = '1748358912'
const APPID = 'wxbcd464dd28d81bc1'
const API_KEY = '2sg2wWIoR9cYaK2OtuBEYXbrAZ0R5etm'

const crypto = require('crypto')

function sign(timestamp, nonceStr, prepayId) {
  const str = `appId=${APPID}&nonceStr=${nonceStr}&package=prepay_id=${prepayId}&signType=MD5&timeStamp=${timestamp}&key=${API_KEY}`
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase()
}

exports.main = async (event, context) => {
  const { openid, amount, description } = event

  // 生成订单号
  const outTradeNo = 'PAY' + Date.now() + Math.random().toString(36).slice(2, 6)

  // 调用微信支付统一下单 APIv2（兼容性更好）
  const https = require('https')
  const xml2js = require('xml2js')

  const params = {
    appid: APPID,
    mch_id: MCHID,
    nonce_str: Math.random().toString(36).slice(2, 18),
    body: description || '游泳票',
    out_trade_no: outTradeNo,
    total_fee: Math.round(amount * 100), // 金额（分）
    spbill_create_ip: '127.0.0.1',
    notify_url: 'https://erdinger.top/api/wxpay/notify',
    trade_type: 'JSAPI',
    openid: openid
  }

  // 生成签名
  const sortedKeys = Object.keys(params).sort()
  let signStr = ''
  for (const k of sortedKeys) {
    if (params[k] !== undefined && params[k] !== '') {
      signStr += `${k}=${params[k]}&`
    }
  }
  signStr += `key=${API_KEY}`
  params.sign = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase()

  // 转 XML
  let xml = '<xml>'
  for (const k of Object.keys(params)) {
    xml += `<${k}>${params[k]}</${k}>`
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
