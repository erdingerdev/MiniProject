const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const { action, data } = event

  // 验证密码
  if (action === 'verifyPwd') {
    const cfg = await db.collection('app_config').doc('config').get()
    return { ok: cfg.data.adminPassword === data.pwd }
  }

  // 更新配置
  if (action === 'updateConfig') {
    const updates = {}
    if (data.swimEnabled !== undefined) updates['swimConfig.swimEnabled'] = data.swimEnabled
    if (data.guideText !== undefined) updates['swimConfig.guideText'] = data.guideText
    if (data.paymentQR !== undefined) updates['swimConfig.paymentQR'] = data.paymentQR
    if (data.qrFileID !== undefined) updates['swimConfig.qrFileID'] = data.qrFileID
    await db.collection('app_config').doc('config').update({ data: updates })
    return { ok: true }
  }

  // 更新密码
  if (action === 'updatePwd') {
    await db.collection('app_config').doc('config').update({ data: { adminPassword: data.pwd } })
    return { ok: true }
  }

  // 保存分类
  if (action === 'saveCategories') {
    await db.collection('app_config').doc('config').update({ data: { categories: data.categories } })
    return { ok: true }
  }

  // 设置分类凭证
  if (action === 'setCategoryCreds') {
    const cfg = await db.collection('app_config').doc('config').get()
    const creds = cfg.data.categoryCredentials || {}
    creds[data.category] = { username: data.username, password: data.password, unitPrice: data.unitPrice || (creds[data.category] && creds[data.category].unitPrice) || 22.98 }
    await db.collection('app_config').doc('config').update({ data: { categoryCredentials: creds } })
    return { ok: true }
  }

  // 设置单价
  if (action === 'setUnitPrice') {
    const cfg = await db.collection('app_config').doc('config').get()
    const creds = cfg.data.categoryCredentials || {}
    if (creds[data.category]) {
      creds[data.category].unitPrice = data.unitPrice
      await db.collection('app_config').doc('config').update({ data: { categoryCredentials: creds } })
    }
    return { ok: true }
  }

  // 获取付费二维码临时URL
  if (action === 'getQRUrl') {
    const cfg = await db.collection('app_config').doc('config').get()
    const fileID = (cfg.data.swimConfig && cfg.data.swimConfig.qrFileID) || ''
    if (!fileID) return { ok: true, url: '' }
    const res = await cloud.getTempFileURL({ fileList: [fileID] })
    return { ok: true, url: res.fileList[0].tempFileURL || '' }
  }

  return { ok: false, error: '未知操作' }
}
