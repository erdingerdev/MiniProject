const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  // 微信支付回调仅需返回成功，实际处理在前端 success 回调
  console.log('WXPay notify:', JSON.stringify(event))
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>'
  }
}
