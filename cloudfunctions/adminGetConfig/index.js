const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENID = 'o7s523QK_QoQcwGJJfp1cfESqLFY'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (OPENID !== ADMIN_OPENID) return { ok: false, error: '无权限' }

  const cfgRes = await db.collection('app_config').doc('config').get()
  const cfg = cfgRes.data
  return {
    ok: true,
    config: {
      ...cfg.swimConfig,
      categories: cfg.categories || [],
      categoryCredentials: cfg.categoryCredentials || {},
      adminPassword: cfg.adminPassword || '',
      promo: cfg.promo || null
    }
  }
}
