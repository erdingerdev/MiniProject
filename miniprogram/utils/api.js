const BASE = 'https://erdinger.top/api'

// ── CloudBase 数据库实例 ──
const db = wx.cloud ? wx.cloud.database() : null
const _ = db ? db.command : null

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
  },

  // ===== CloudBase 原生方法 =====
  // 获取用户通行证状态
  async getUserPasscodeStatusCB(openid) {
    if (!db) throw new Error('CloudBase 未初始化')
    const userRes = await db.collection('app_users').where({ openid }).get()
    if (userRes.data.length === 0) return { hasPasscode: false, passcodes: [] }
    const user = userRes.data[0]
    const ids = user.boundPasscodeIds || []
    if (ids.length === 0) return { hasPasscode: false, passcodes: [] }
    const pcRes = await db.collection('passcodes').where({ _id: _.in(ids) }).get()
    const passcodes = pcRes.data.map(p => ({
      id: p._id, name: p.name, category: p.category,
      status: p.deleted ? 'deleted' : (p.expireAt && new Date(p.expireAt) < new Date()) ? 'expired' : 'active'
    }))
    const active = passcodes.filter(p => p.status === 'active')
    return { hasPasscode: passcodes.length > 0, passcodes, activeCount: active.length }
  },

  // 获取游泳设置
  async getSwimSettingsCB() {
    if (!db) throw new Error('CloudBase 未初始化')
    const res = await db.collection('app_config').doc('config').get()
    const cfg = res.data
    return { swimEnabled: (cfg.swimConfig && cfg.swimConfig.swimEnabled !== false) }
  },

  // 获取绑定状态 + 通行证列表
  async getBindStatusCB(openid) {
    if (!db) throw new Error('CloudBase 未初始化')
    const userRes = await db.collection('app_users').where({ openid }).get()
    const ids = (userRes.data[0] && userRes.data[0].boundPasscodeIds) || []
    if (ids.length === 0) return { bound: false, passcodes: [], validCount: 0 }
    const pcRes = await db.collection('passcodes').where({ _id: _.in(ids) }).get()
    const cfgRes = await db.collection('app_config').doc('config').get()
    const creds = cfgRes.data.categoryCredentials || {}
    const passcodes = pcRes.data.filter(p => !p.deleted).map(p => {
      const meta = creds[p.category] || {}
      const valid = !(p.expireAt && new Date(p.expireAt) < new Date()) && !(p.maxUses > 0 && (p.usageCount || 0) >= p.maxUses)
      return { id: p._id, name: p.name, category: p.category, valid, unitPrice: meta.unitPrice || 22.98 }
    })
    return { bound: passcodes.some(p => p.valid), passcodes, validCount: passcodes.filter(p => p.valid).length }
  },

  // 获取账号密码
  async getCredentialsCB(passcodeId, openid) {
    if (!db) throw new Error('CloudBase 未初始化')
    const pc = await db.collection('passcodes').doc(passcodeId).get()
    if (!pc.data || pc.data.deleted) throw new Error('passcode not found')
    const cfgRes = await db.collection('app_config').doc('config').get()
    const creds = (cfgRes.data.categoryCredentials || {})[pc.data.category] || {}
    return { username: creds.username || '', password: creds.password || '', unitPrice: creds.unitPrice || 22.98 }
  },

  // 绑定通行码
  async bindPasscodeCB(codeName, openid, nickname, avatar) {
    if (!db) throw new Error('CloudBase 未初始化')
    const pcRes = await db.collection('passcodes').where({ name: codeName, deleted: false }).get()
    if (pcRes.data.length === 0) throw { error: '通行码不存在' }
    const pc = pcRes.data[0]
    if (pc.type === 'exclusive') {
      const userRes = await db.collection('app_users').where({ boundPasscodeIds: pc._id }).get()
      if (userRes.data.length > 0) throw { error: '该通行码已被他人绑定' }
    }
    const userRes = await db.collection('app_users').where({ openid }).get()
    if (userRes.data.length > 0) {
      const user = userRes.data[0]
      if (!user.boundPasscodeIds.includes(pc._id)) {
        await db.collection('app_users').doc(user._id).update({
          data: { boundPasscodeIds: _.push(pc._id), nickname: nickname || user.nickname, avatar: avatar || user.avatar }
        })
      }
    } else {
      await db.collection('app_users').add({ data: { openid, nickname, avatar, boundPasscodeIds: [pc._id] } })
    }
    const status = await this.getBindStatusCB(openid)
    return { ...status, passcodeId: pc._id, passcodeName: pc.name, passcodeCategory: pc.category }
  },

  // 确认付款 + 记录日志
  async confirmPaymentCB(openid, passcodeId, passcodeName, peopleCount) {
    if (!db) throw new Error('CloudBase 未初始化')
    await db.collection('usage_logs').add({ data: {
      openid, passcodeId, passcodeName, peopleCount, timestamp: new Date().toISOString()
    }})
    return { ok: true }
  },

  // 获取完整配置（收款码、引导文案等）
  async getAdminConfigCB() {
    if (!db) throw new Error('CloudBase 未初始化')
    const res = await db.collection('app_config').doc('config').get()
    const cfg = res.data
    return {
      ...cfg.swimConfig,
      categories: cfg.categories || [],
      categoryCredentials: cfg.categoryCredentials || {}
    }
  },

  // 验证管理员密码
  async verifyAdminCB(password) {
    const res = await db.collection('app_config').doc('config').get()
    return { ok: res.data.adminPassword === password }
  },

  // 更新配置
  async updateAdminConfigCB(data) {
    const cfg = await db.collection('app_config').doc('config').get()
    const updates = {}
    if (data.paymentQR !== undefined) updates['swimConfig.paymentQR'] = data.paymentQR
    if (data.guideText !== undefined) updates['swimConfig.guideText'] = data.guideText
    if (data.swimEnabled !== undefined) updates['swimConfig.swimEnabled'] = data.swimEnabled
    if (data.categories !== undefined) updates.categories = data.categories
    await db.collection('app_config').doc('config').update({ data: updates })
    return { ok: true }
  },

  async updateAdminPasswordCB(newPassword) {
    await db.collection('app_config').doc('config').update({ data: { adminPassword: newPassword } })
    return { ok: true }
  },

  async setCategoryCredentialsCB(category, username, password) {
    const cfg = await db.collection('app_config').doc('config').get()
    const creds = cfg.data.categoryCredentials || {}
    creds[category] = { ...(creds[category] || {}), username, password }
    await db.collection('app_config').doc('config').update({ data: { categoryCredentials: creds } })
    return { ok: true }
  },

  async setCategoryUnitPriceCB(category, unitPrice) {
    const cfg = await db.collection('app_config').doc('config').get()
    const creds = cfg.data.categoryCredentials || {}
    creds[category] = { ...(creds[category] || {}), unitPrice }
    await db.collection('app_config').doc('config').update({ data: { categoryCredentials: creds } })
    return { ok: true }
  },

  async saveCategoriesCB(categories) {
    const cfg = await db.collection('app_config').doc('config').get()
    const creds = cfg.data.categoryCredentials || {}
    for (const cat of Object.keys(creds)) {
      if (!categories.includes(cat)) delete creds[cat]
    }
    await db.collection('app_config').doc('config').update({ data: { categories, categoryCredentials: creds } })
    return { categories }
  },

  // 通行码管理
  async listPasscodesCB() {
    const res = await db.collection('passcodes').where({ deleted: false }).get()
    return res.data.map(p => {
      const today = new Date().toISOString().slice(0, 10)
      return {
        id: p._id, name: p.name, type: p.type, maxUses: p.maxUses, expireAt: p.expireAt,
        category: p.category, createdAt: p.createdAt ? p.createdAt.slice(0, 19).replace('T', ' ') : '',
        usageCount: p.usageCount || 0
      }
    })
  },

  async createPasscodeCB(data) {
    const dup = await db.collection('passcodes').where({ name: data.name, deleted: false }).get()
    if (dup.data.length > 0) throw { error: '该名称已被使用' }
    const res = await db.collection('passcodes').add({ data: {
      name: data.name, type: data.type || 'shared', maxUses: data.maxUses || 0,
      expireAt: data.expireAt || null, category: data.category || 'swim',
      deleted: false, createdAt: new Date().toISOString(), usageCount: 0
    }})
    return { id: res._id, ...data }
  },

  async deletePasscodeCB(id) {
    await db.collection('passcodes').doc(id).update({ data: { deleted: true } })
    const userRes = await db.collection('app_users').where({ boundPasscodeIds: id }).get()
    for (const user of userRes.data) {
      await db.collection('app_users').doc(user._id).update({
        data: { boundPasscodeIds: _.pull(id) }
      })
    }
    return { ok: true }
  },

  async unbindUserCB(openid, passcodeId) {
    const userRes = await db.collection('app_users').where({ openid }).get()
    if (userRes.data.length > 0) {
      await db.collection('app_users').doc(userRes.data[0]._id).update({
        data: { boundPasscodeIds: _.pull(passcodeId) }
      })
    }
    return { ok: true }
  },

  async getPasscodeDetailCB(id) {
    const pc = await db.collection('passcodes').doc(id).get()
    if (!pc.data || pc.data.deleted) throw { error: 'not found' }
    const users = await db.collection('app_users').where({ boundPasscodeIds: id }).get()
    const logs = await db.collection('usage_logs').where({ passcodeId: id }).get()
    const boundUsers = users.data.map(u => {
      const uLogs = logs.data.filter(l => l.openid === u.openid)
      const total = uLogs.reduce((s, l) => s + (l.peopleCount || 1), 0)
      return { openid: u.openid, nickname: u.nickname, avatar: u.avatar, totalCount: total }
    })
    return { usageCount: logs.data.length, boundUsers }
  },

  async listUsersCB() {
    const users = await db.collection('app_users').get()
    const pcs = await db.collection('passcodes').where({ deleted: false }).get()
    const pcMap = {}
    pcs.data.forEach(p => { pcMap[p._id] = p.name })
    return users.data.map(u => {
      const names = (u.boundPasscodeIds || []).map(id => pcMap[id] || '').filter(Boolean)
      return {
        openid: u.openid, nickname: u.nickname, avatar: u.avatar,
        boundPasscodeName: names.join(', ') || '无'
      }
    })
  },

  async getLogsCB() {
    const res = await db.collection('usage_logs').orderBy('timestamp', 'desc').limit(200).get()
    const users = await db.collection('app_users').get()
    const userMap = {}
    users.data.forEach(u => { userMap[u.openid] = u.nickname })
    return res.data.map(l => ({
      id: l._id, openid: l.openid, passcodeId: l.passcodeId, passcodeName: l.passcodeName,
      peopleCount: l.peopleCount, formattedTime: l.timestamp ? l.timestamp.slice(0, 19).replace('T', ' ') : '',
      nickname: userMap[l.openid] || '匿名'
    }))
  },

  // 排行榜
  async getLeaderboardCB() {
    const logs = await db.collection('usage_logs').get()
    const users = await db.collection('app_users').get()
    const userMap = {}
    users.data.forEach(u => { userMap[u.openid] = { nickname: u.nickname, avatar: u.avatar } })
    const stats = {}
    logs.data.forEach(l => {
      if (!stats[l.openid]) stats[l.openid] = { count: 0, nickname: '', avatar: '' }
      stats[l.openid].count += (l.peopleCount || 1)
    })
    Object.keys(stats).forEach(k => {
      stats[k].nickname = (userMap[k] && userMap[k].nickname) || '匿名'
      stats[k].avatar = (userMap[k] && userMap[k].avatar) || ''
    })
    return Object.entries(stats).map(([openid, s]) => ({ openid, ...s }))
      .sort((a, b) => b.count - a.count).slice(0, 50)
  },

  // 打卡/统计
  async getUserStatsCB(openid) {
    const logs = await db.collection('usage_logs').where({ openid }).get()
    let lastDate = null
    logs.data.forEach(l => {
      const d = l.timestamp ? l.timestamp.slice(0, 10) : ''
      if (!lastDate || d > lastDate) lastDate = d
    })
    const today = new Date().toISOString().slice(0, 10)
    const todayCount = logs.data.filter(l => l.timestamp && l.timestamp.startsWith(today)).length
    return { lastCheckinDate: lastDate, todayChecked: todayCount > 0, todayCount }
  },

  async manualCheckinCB(openid) {
    await db.collection('usage_logs').add({ data: {
      openid, passcodeId: 'manual', passcodeName: '手动打卡', peopleCount: 1, timestamp: new Date().toISOString()
    }})
    return { ok: true }
  }
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
  }
}
