const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const cfg = await db.collection('app_config').doc('config').get()
  return {
    swimEnabled: (cfg.data.swimConfig && cfg.data.swimConfig.swimEnabled !== false),
    promo: cfg.data.promo || null
  }
}
