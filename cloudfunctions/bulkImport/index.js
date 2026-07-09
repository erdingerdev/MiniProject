const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { action, collection, documents } = event
  
  const db = cloud.database()
  
  if (action === 'insertBatch') {
    // Insert documents in batches
    const results = []
    for (const doc of documents) {
      try {
        await db.collection(collection).add({ data: doc })
        results.push({ id: doc._id || doc.openid, ok: true })
      } catch (e) {
        if (e.errCode === -502003) {
          // Duplicate, try update
          try {
            await db.collection(collection).doc(doc._id || doc.openid).set({ data: doc })
            results.push({ id: doc._id || doc.openid, ok: true, updated: true })
          } catch (e2) {
            results.push({ id: doc._id || doc.openid, ok: false, error: e2.message })
          }
        } else {
          results.push({ id: doc._id || doc.openid, ok: false, error: e.message })
        }
      }
    }
    return { success: true, results }
  }
  
  if (action === 'insertLogs') {
    const results = []
    for (const doc of documents) {
      try {
        await db.collection(collection).add({ data: doc })
        results.push({ ok: true })
      } catch (e) {
        results.push({ ok: false, error: e.message })
      }
    }
    return { success: true, results }
  }
  
  return { success: false, error: 'unknown action' }
}
