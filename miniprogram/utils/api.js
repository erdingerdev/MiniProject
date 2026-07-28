const BASE = 'https://erdinger.top/api'

// ── CloudBase DB（延迟初始化，等 wx.cloud.init 完成）
function getDb() { return wx.cloud ? wx.cloud.database() : null }
function getCmd() { const d = getDb(); return d ? d.command : null }

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + path,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(res.data)
        }
      },
      fail(err) {
        wx.showToast({ title: '网络异常', icon: 'none' })
        reject(err)
      }
    })
  })
}

const getUserPasscodeStatusCB = async (openid) => {
  if (!getDb()) throw new Error('CloudBase 未初始化')
  const userRes = await getDb().collection('app_users').where({ _openid: openid }).get()
  if (userRes.data.length === 0) return { hasPasscode: false, passcodes: [] }
  const user = userRes.data[0]
  const ids = user.boundPasscodeIds || []
  if (ids.length === 0) return { hasPasscode: false, passcodes: [] }
  const pcRes = await getDb().collection('passcodes').where({ _id: getCmd().in(ids) }).get()
  const passcodes = pcRes.data.map(p => ({
    id: p._id, name: p.name, category: p.category,
    status: p.deleted ? 'deleted' : (p.expireAt && new Date(p.expireAt) < new Date()) ? 'expired' : 'active'
  }))
  const active = passcodes.filter(p => p.status === 'active')
  return { hasPasscode: passcodes.length > 0, passcodes, activeCount: active.length }
}
const getSwimSettingsCB = async () => {
  const res = await wx.cloud.callFunction({ name: 'getSwimSettings2' })
  return res.result
}
const getBindStatusCB = async (openid) => {
  if (!getDb()) throw new Error('CloudBase 未初始化')
  const userRes = await getDb().collection('app_users').where({ _openid: openid }).get()
  const ids = (userRes.data[0] && userRes.data[0].boundPasscodeIds) || []
  if (ids.length === 0) return { bound: false, passcodes: [], validCount: 0 }
  const pcRes = await getDb().collection('passcodes').where({ _id: getCmd().in(ids) }).get()
  const cfgRes = await getDb().collection('app_config').doc('config').get()
  const creds = cfgRes.data.categoryCredentials || {}
  const passcodes = pcRes.data.filter(p => !p.deleted).map(p => {
    const meta = creds[p.category] || {}
    const valid = !(p.expireAt && new Date(p.expireAt) < new Date()) && !(p.maxUses > 0 && (p.usageCount || 0) >= p.maxUses)
    return { id: p._id, name: p.name, category: p.category, valid, unitPrice: meta.unitPrice || 22.98 }
  })
  return { bound: passcodes.some(p => p.valid), passcodes, validCount: passcodes.filter(p => p.valid).length }
}
const getCredentialsCB = async (passcodeId, openid) => {
  if (!getDb()) throw new Error('CloudBase 未初始化')
  const pc = await getDb().collection('passcodes').doc(passcodeId).get()
  if (!pc.data || pc.data.deleted) throw new Error('passcode not found')
  const cfgRes = await getDb().collection('app_config').doc('config').get()
  const creds = (cfgRes.data.categoryCredentials || {})[pc.data.category] || {}
  return { username: creds.username || '', password: creds.password || '', unitPrice: creds.unitPrice || 22.98 }
}
const bindPasscodeCB = async (codeName, openid, nickname, avatar) => {
  if (!getDb()) throw new Error('CloudBase 未初始化')
  const pcRes = await getDb().collection('passcodes').where({ name: codeName, deleted: false }).get()
  if (pcRes.data.length === 0) throw { error: '通行码不存在' }
  const pc = pcRes.data[0]
  if (pc.type === 'exclusive') {
    const cfRes = await wx.cloud.callFunction({ name: 'adminCheckPasscode', data: { action: 'checkExclusive', data: { passcodeId: pc._id } } })
    if (cfRes.result.ok && cfRes.result.bound) throw { error: '该通行码已被他人绑定' }
  }
  const userRes = await getDb().collection('app_users').where({ _openid: openid }).get()
  if (userRes.data.length > 0) {
    const user = userRes.data[0]
    if (!user.boundPasscodeIds.includes(pc._id)) {
      const ids = [...user.boundPasscodeIds, pc._id]
      await getDb().collection('app_users').where({ _openid: openid }).update({
        data: { boundPasscodeIds: ids, nickname: nickname || user.nickname, avatar: avatar || user.avatar }
      })
    }
  } else {
    await getDb().collection('app_users').add({ data: { _openid: openid, openid, nickname, avatar, boundPasscodeIds: [pc._id] } })
  }
  return await getBindStatusCB(openid)
}
const confirmPaymentCB = async (openid, passcodeId, passcodeName, peopleCount, extra = {}) => {
  if (!getDb()) throw new Error('CloudBase 未初始化')
  const res = await getDb().collection('orders').add({ data: {
    openid, passcodeId, passcodeName, peopleCount,
    pool: extra.pool || passcodeName || '',
    username: extra.username || '',
    password: extra.password || '',
    unitPrice: extra.unitPrice || 0,
    totalPrice: extra.totalPrice || 0,
    paidAt: extra.paidAt || Date.now(),
    timeStr: extra.timeStr || '',
    type: 'payment', timestamp: new Date().toISOString(), redeemed: false
  }})
  // 同步写入打卡记录
  getDb().collection('checkins').add({ data: {
    openid, type: 'payment', peopleCount, timestamp: new Date().toISOString()
  }}).catch(() => {})
  return { ok: true, orderId: res._id }
}
const getAdminConfigCB = async () => {
  if (!getDb()) throw new Error('CloudBase 未初始化')
  const res = await getDb().collection('app_config').doc('config').get()
  const cfg = res.data
  return {
    ...cfg.swimConfig,
    categories: cfg.categories || [],
    categoryCredentials: cfg.categoryCredentials || {}
  }
}
const verifyAdminCB = async (password) => {
  console.log('verifyAdminCB called, db ready:', !!getDb())
  if (!getDb()) throw new Error('CloudBase 未初始化')
  const res = await getDb().collection('app_config').doc('config').get()
  console.log('verifyAdminCB result:', res.data ? 'got data' : 'no data', 'pwd match:', res.data.adminPassword === password)
  return { ok: res.data.adminPassword === password }
}
const updateAdminConfigCB = async (data) => {
  const updates = {}
  if (data.paymentQR !== undefined) updates['swimConfig.paymentQR'] = data.paymentQR
  if (data.guideText !== undefined) updates['swimConfig.guideText'] = data.guideText
  if (data.swimEnabled !== undefined) updates['swimConfig.swimEnabled'] = data.swimEnabled
  if (data.categories !== undefined) updates.categories = data.categories
  await getDb().collection('app_config').doc('config').update({ data: updates })
  return { ok: true }
}
const updateAdminPasswordCB = async (newPassword) => {
  await getDb().collection('app_config').doc('config').update({ data: { adminPassword: newPassword } })
  return { ok: true }
}
const setCategoryCredentialsCB = async (category, username, password) => {
  const cfg = await getDb().collection('app_config').doc('config').get()
  const creds = cfg.data.categoryCredentials || {}
  creds[category] = { ...(creds[category] || {}), username, password }
  await getDb().collection('app_config').doc('config').update({ data: { categoryCredentials: creds } })
  return { ok: true }
}
const setCategoryUnitPriceCB = async (category, unitPrice) => {
  const cfg = await getDb().collection('app_config').doc('config').get()
  const creds = cfg.data.categoryCredentials || {}
  creds[category] = { ...(creds[category] || {}), unitPrice }
  await getDb().collection('app_config').doc('config').update({ data: { categoryCredentials: creds } })
  return { ok: true }
}
const saveCategoriesCB = async (categories) => {
  const cfg = await getDb().collection('app_config').doc('config').get()
  const creds = cfg.data.categoryCredentials || {}
  for (const cat of Object.keys(creds)) {
    if (!categories.includes(cat)) delete creds[cat]
  }
  await getDb().collection('app_config').doc('config').update({ data: { categories, categoryCredentials: creds } })
  return { categories }
}
const listPasscodesCB = async (skip = 0, limit = 20, search = '') => {
  let query = getDb().collection('passcodes').where({ deleted: false })
  if (search) {
    query = query.where({ name: getDb().RegExp({ regexp: search, options: 'i' }) })
  }
  const res = await query.orderBy('createdAt', 'desc').skip(skip).limit(limit).get()
  return res.data.map(p => ({
    id: p._id, name: p.name, type: p.type, maxUses: p.maxUses, expireAt: p.expireAt,
    category: p.category, createdAt: p.createdAt ? p.createdAt.slice(0, 19).replace('T', ' ') : '',
    unitPrice: p.unitPrice || 0, usageCount: p.usageCount || 0
  }))
}
const createPasscodeCB = async (data) => {
  const dup = await getDb().collection('passcodes').where({ name: data.name, deleted: false }).get()
  if (dup.data.length > 0) throw { error: '该名称已被使用' }
  const res = await getDb().collection('passcodes').add({ data: {
    name: data.name, type: data.type || 'shared', maxUses: data.maxUses || 0,
    expireAt: data.expireAt || null, category: data.category || 'swim',
    deleted: false, createdAt: new Date().toISOString(), usageCount: 0
  }})
  return { id: res._id }
}
const deletePasscodeCB = async (id) => {
  const cfRes = await wx.cloud.callFunction({ name: 'adminCheckPasscode', data: { action: 'deletePasscode', data: { passcodeId: id } } })
  if (!cfRes.result.ok) throw { error: cfRes.result.error || '删除失败' }
  return { ok: true }
}
const unbindUserCB = async (openid, passcodeId) => {
  await wx.cloud.callFunction({ name: 'adminCheckPasscode', data: { action: 'unbindUser', data: { openid, passcodeId } } })
  return { ok: true }
}
const getPasscodeDetailCB = async (id) => {
  const cfRes = await wx.cloud.callFunction({ name: 'adminCheckPasscode', data: { action: 'getPasscodeDetail', data: { passcodeId: id } } })
  if (!cfRes.result.ok) throw { error: cfRes.result.error || '查询失败' }
  return cfRes.result
}
let _userStatsCache = null
const listUsersCB = async (skip = 0, limit = 20) => {
  // 首次加载时预计算统计缓存（穿码映射 + 使用次数）
  if (!_userStatsCache) {
    const pcMap = {}
    let pcSkip = 0
    while (true) {
      const r = await getDb().collection('passcodes').where({ deleted: false }).skip(pcSkip).limit(20).get()
      if (r.data.length === 0) break
      r.data.forEach(p => { pcMap[p._id] = p.name })
      if (r.data.length < 20) break
      pcSkip += 20
    }
    const logStats = {}
    for (const coll of ['orders', 'checkins', 'usage_logs']) {
      let s = 0
      while (true) {
        const r = await getDb().collection(coll).skip(s).limit(20).get()
        if (r.data.length === 0) break
        r.data.forEach(l => { logStats[l.openid] = (logStats[l.openid] || 0) + (l.peopleCount || 1) })
        if (r.data.length < 20) break
        s += 20
      }
    }
    _userStatsCache = { pcMap, logStats }
  }
  const { pcMap, logStats } = _userStatsCache
  const res = await getDb().collection('app_users').skip(skip).limit(limit).get()
  const list = res.data.map(u => {
    const names = (u.boundPasscodeIds || []).map(id => pcMap[id] || '').filter(Boolean)
    return {
      openid: u.openid, nickname: u.nickname, avatar: u.avatar,
      boundPasscodeName: names.join(', ') || '无',
      totalCount: logStats[u.openid] || 0
    }
  }).sort((a, b) => b.totalCount - a.totalCount)
  return list
}
const countUsersCB = async () => {
  const res = await getDb().collection('app_users').count()
  return res.total || 0
}
const countPasscodesCB = async () => {
  const res = await getDb().collection('passcodes').where({ deleted: false }).count()
  return res.total || 0
}
const getLogsCB = async () => {
  // 保留兼容，但废弃不用
  return []
}
const getOrdersCB = async (skip = 0, limit = 20) => {
  if (!getDb()) throw new Error('CloudBase 未初始化')
  const res = await getDb().collection('orders').orderBy('timestamp', 'desc').skip(skip).limit(limit).get()
  const openids = [...new Set(res.data.map(l => l.openid))]
  let userMap = {}
  if (openids.length > 0) {
    const users = await getDb().collection('app_users').where({ openid: getCmd().in(openids) }).get()
    users.data.forEach(u => { userMap[u.openid] = u.nickname })
  }
  return res.data.map(l => ({
    id: l._id, openid: l.openid, type: l.type || 'payment',
    passcodeId: l.passcodeId, passcodeName: l.passcodeName,
    pool: l.pool || l.passcodeName || '', peopleCount: l.peopleCount || 1,
    unitPrice: l.unitPrice || 0, totalPrice: l.totalPrice || 0,
    username: '', password: '',
    paidAt: l.paidAt || 0, timeStr: l.timeStr || '',
    formattedTime: l.timestamp ? l.timestamp.slice(0, 19).replace('T', ' ') : '',
    nickname: userMap[l.openid] || '匿名', redeemed: l.redeemed || false
  }))
}
const getFeedbacksCB = async (skip = 0, limit = 20) => {
  const res = await getDb().collection('feedback').orderBy('createdAt', 'desc').skip(skip).limit(limit).get()
  return res.data.map(f => ({
    id: f._id,
    openid: f.openid || '',
    nickname: f.nickname || '匿名',
    content: f.content || '',
    createdAt: f.createdAt ? f.createdAt.slice(0, 19).replace('T', ' ') : ''
  }))
}
const getLeaderboardCB = async () => {
  const allLogs = [], batchSize = 20
  let skip = 0
  while (true) {
    const res = await getDb().collection('orders').skip(skip).limit(batchSize).get()
    if (res.data.length === 0) break
    allLogs.push(...res.data)
    if (res.data.length < batchSize) break
    skip += batchSize
  }
  const logs = allLogs
  const allUsers2 = []; let skip2 = 0
  while (true) {
    const res = await getDb().collection('app_users').skip(skip2).limit(batchSize).get()
    if (res.data.length === 0) break
    allUsers2.push(...res.data)
    if (res.data.length < batchSize) break
    skip2 += batchSize
  }
  const users = allUsers2
  const userMap = {}
  users.forEach(u => { userMap[u.openid] = { nickname: u.nickname, avatar: u.avatar } })
  const stats = {}
  logs.forEach(l => {
    if (!stats[l.openid]) stats[l.openid] = { count: 0 }
    stats[l.openid].count += (l.peopleCount || 1)
  })
  Object.keys(stats).forEach(k => {
    stats[k].nickname = (userMap[k] && userMap[k].nickname) || '匿名'
    stats[k].avatar = (userMap[k] && userMap[k].avatar) || ''
  })
  return Object.entries(stats).map(([openid, s]) => ({ openid, ...s })).sort((a, b) => b.count - a.count).slice(0, 50)
}
const getUserStatsCB = async (openid) => {
  const res = await getDb().collection('checkins').where({ openid }).orderBy('timestamp', 'desc').limit(500).get()
  const checkinDates = [...new Set(res.data.map(l => l.timestamp ? l.timestamp.slice(0, 10) : '').filter(Boolean))]
  let maxStreak = 0, streak = 0
  const sorted = checkinDates.sort()
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) { streak = 1; continue }
    const prev = new Date(sorted[i-1]), curr = new Date(sorted[i])
    if ((curr - prev) / 86400000 <= 1) streak++
    else { if (streak > maxStreak) maxStreak = streak; streak = 1 }
  }
  if (streak > maxStreak) maxStreak = streak
  const today = new Date().toISOString().slice(0, 10)
  const todayChecked = checkinDates.includes(today)
  return { checkinDates, totalCount: res.data.length, maxStreak, todayChecked, timestamps: res.data.map(l => l.timestamp) }
}
const getUserCheckinsCB = async (openid, skip = 0, limit = 30) => {
  const [orderRes, checkinRes, usageRes] = await Promise.all([
    getDb().collection('orders').where({ openid }).orderBy('timestamp', 'desc').skip(skip).limit(limit).get(),
    getDb().collection('checkins').where({ openid }).orderBy('timestamp', 'desc').skip(skip).limit(limit).get(),
    getDb().collection('usage_logs').where({ openid }).orderBy('timestamp', 'desc').skip(skip).limit(limit).get()
  ])
  const all = [...orderRes.data, ...checkinRes.data, ...usageRes.data].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return all.slice(0, limit).map(l => ({
    id: l._id,
    type: l.type || 'payment',
    pool: l.pool || '',
    passcodeName: l.passcodeName || '',
    peopleCount: l.peopleCount || 1,
    unitPrice: l.unitPrice || 0,
    totalPrice: l.totalPrice || 0,
    formattedTime: l.timestamp ? l.timestamp.slice(0, 19).replace('T', ' ') : ''
  }))
}
const manualCheckinCB = async (openid) => {
  if (!getDb()) throw new Error('CloudBase 未初始化')
  await getDb().collection('checkins').add({ data: {
    openid, type: 'manual', peopleCount: 1, timestamp: new Date().toISOString()
  }})
  return { ok: true }
}
const uploadAvatarCB = async (filePath) => {
  const cloudPath = 'avatars/avatar-' + Date.now() + '.jpg'
  const res = await wx.cloud.uploadFile({ cloudPath, filePath })
  const urlRes = await wx.cloud.getTempFileURL({ fileList: [res.fileID] })
  return { url: urlRes.fileList[0].tempFileURL, fileID: res.fileID }
}
const uploadQRCB = async (filePath) => {
  const res = await wx.cloud.uploadFile({ cloudPath: 'swim-qr/qr.png', filePath })
  const urlRes = await wx.cloud.getTempFileURL({ fileList: [res.fileID] })
  return { url: urlRes.fileList[0].tempFileURL, fileID: res.fileID }
}
const getQRUrlCB = async () => {
  try {
    const cfg = await getAdminConfigCB()
    if (cfg.qrFileID) {
      const res = await wx.cloud.getTempFileURL({ fileList: [cfg.qrFileID] })
      return res.fileList[0].tempFileURL || ''
    }
    return ''
  } catch { return '' }
}
const uploadAndSaveQR = async (filePath) => {
  const uploadRes = await wx.cloud.uploadFile({ cloudPath: 'swim-qr/qr.png', filePath })
  await getDb().collection('app_config').doc('config').update({ data: { 'swimConfig.qrFileID': uploadRes.fileID } })
  const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
  return { url: urlRes.fileList[0].tempFileURL, fileID: uploadRes.fileID }
}

module.exports = {
  // 微信登录
  wxLogin(code) {
    return request('POST', '/login', { code })
  },

  // ===== 游泳票 =====
  bindPasscode(codeName, openid, nickname, avatar) {
    return request('POST', '/swim/bind', { codeName, openid, nickname, avatar })
  },
  getCredentials(passcodeId, openid) {
    let query = ''
    if (passcodeId) query = `?passcodeId=${passcodeId}`
    else if (openid) query = `?openid=${openid}`
    return request('GET', '/swim/credentials' + query)
  },
  confirmPayment(openid, passcodeId, passcodeName, peopleCount) {
    return request('POST', '/swim/confirm', { openid, passcodeId, passcodeName, peopleCount })
  },
  getBindStatus(openid) {
    return request('GET', `/swim/status?openid=${openid}`)
  },
  getSwimSettings() {
    return request('GET', '/swim/settings')
  },
  getUserPasscodeStatus(openid) {
    return request('GET', `/user/status?openid=${openid}`)
  },
  updateProfile(openid, nickname, avatar) {
    return request('POST', '/user/profile', { openid, nickname, avatar })
  },

  // ===== 管理端 =====
  verifyAdmin(password) {
    return request('POST', '/admin/verify', { password })
  },
  getAdminConfig() {
    return request('GET', '/admin/config')
  },
  saveCategories(categories) {
    return request('POST', '/admin/config', { action: 'saveCategories', categories })
  },
  setCategoryCredentials(category, username, password) {
    return request('POST', '/admin/config', { action: 'setCategoryCredentials', category, username, password })
  },
  setCategoryUnitPrice(category, unitPrice) {
    return request('POST', '/admin/config', { action: 'setCategoryUnitPrice', category, unitPrice })
  },
  updateAdminConfig(data) {
    return request('POST', '/admin/config', data)
  },
  updateAdminPassword(newPassword) {
    return request('POST', '/admin/config', { action: 'updateAdminPassword', newPassword })
  },
  listPasscodes() {
    return request('GET', '/admin/passcodes')
  },
  createPasscode(data) {
    return request('POST', '/admin/passcodes', data)
  },
  deletePasscode(id) {
    return request('DELETE', `/admin/passcodes?id=${id}`)
  },
  unbindUser(openid, passcodeId) {
    return request('POST', '/admin/passcodes', { action: 'unbindUser', openid, passcodeId })
  },
  getPasscodeDetail(id) {
    return request('GET', `/admin/passcodes?id=${id}`)
  },
  listUsers() {
    return request('GET', '/admin/users')
  },
  getLogs() {
    return request('GET', '/admin/logs')
  },
  getLeaderboard() {
    return request('GET', '/leaderboard')
  },

  // ===== 打卡/统计 =====
  getUserStats(openid) {
    return request('GET', `/user/stats?openid=${openid}`)
  },
  manualCheckin(openid) {
    return request('POST', '/user/checkin', { openid })
  },
  uploadAvatar(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: BASE + '/admin/upload-avatar',
        filePath,
        name: 'file',
        timeout: 30000,
        success(res) {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(res)
            return
          }
          try {
            resolve(JSON.parse(res.data))
          } catch (e) {
            reject(res)
          }
        },
        fail(err) {
          reject(err)
        }
      })
    })
  },
  uploadQR(formData) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: BASE + '/admin/upload-qr',
        filePath: formData.filePath,
        name: 'file',
        success(res) {
          try {
            resolve(JSON.parse(res.data))
          } catch (e) {
            reject(res)
          }
        },
        fail(err) {
          reject(err)
        }
      })
    })
  },
  getUserPasscodeStatusCB,
  getSwimSettingsCB,
  getBindStatusCB,
  getCredentialsCB,
  bindPasscodeCB,
  confirmPaymentCB,
  getAdminConfigCB,
  verifyAdminCB,
  updateAdminConfigCB,
  updateAdminPasswordCB,
  setCategoryCredentialsCB,
  setCategoryUnitPriceCB,
  saveCategoriesCB,
  listPasscodesCB,
  createPasscodeCB,
  deletePasscodeCB,
  unbindUserCB,
  getPasscodeDetailCB,
  listUsersCB,
  countUsersCB,
  countPasscodesCB,
  getLogsCB,
  getOrdersCB,
  getFeedbacksCB,
  getLeaderboardCB,
  getUserStatsCB,
  getUserCheckinsCB,
  manualCheckinCB,
  uploadAvatarCB,
  uploadQRCB,
  getQRUrlCB,
  uploadAndSaveQR
}

