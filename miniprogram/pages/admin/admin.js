const api = require('../../utils/api')

Page({
  data: {
    authed: false,
    adminPwd: '',
    errorMsg: '',

    // tab
    tab: 'config',

    // 配置
    qrPreview: '',
    guideText: '',
    unitPrice: '22.98',
    swimUser: '',
    swimPwd: '',
    newAdminPwd: '',

    // 通行码
    passcodes: [],
    newCodeName: '',
    newCodeType: 'shared',
    newCodeMax: '',
    newCodeExpire: '',
    expandedId: '',
    codeDetail: { boundUsers: [] },

    // 用户
    users: [],

    // 日志
    logs: []
  },

  onLoad() {
    const saved = wx.getStorageSync('adminPwd')
    if (saved) {
      this.setData({ adminPwd: saved })
    }
  },

  // ── 密码校验 ──
  onPwdInput(e) { this.setData({ adminPwd: e.detail.value, errorMsg: '' }) },

  async doVerify() {
    wx.showLoading({ title: '验证中...' })
    try {
      const res = await api.verifyAdmin(this.data.adminPwd)
      wx.hideLoading()
      if (res.ok) {
        wx.setStorageSync('adminPwd', this.data.adminPwd)
        this.setData({ authed: true, errorMsg: '' })
        this.loadAll()
      } else {
        wx.removeStorageSync('adminPwd')
        this.setData({ errorMsg: '密码错误' })
      }
    } catch {
      wx.hideLoading()
      this.setData({ errorMsg: '验证失败' })
    }
  },

  // ── Tab ──
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab, expandedId: '' })
    if (tab === 'config') this.loadConfig()
    if (tab === 'passcodes') this.loadPasscodes()
    if (tab === 'users') this.loadUsers()
    if (tab === 'logs') this.loadLogs()
  },

  async loadAll() {
    await this.loadConfig()
    await this.loadPasscodes()
    await this.loadUsers()
  },

  // ── 配置 ──
  async loadConfig() {
    try {
      const cfg = await api.getAdminConfig()
      this.setData({
        swimUser: cfg.username || '',
        swimPwd: cfg.password || '',
        guideText: cfg.guideText || '',
        unitPrice: cfg.unitPrice != null ? String(cfg.unitPrice) : '22.98',
        qrPreview: cfg.paymentQR ? `https://erdinger.top/api/swim/qr-image/qr.png` : ''
      })
    } catch { /* ignore */ }
  },

  onSwimUser(e) { this.setData({ swimUser: e.detail.value }) },
  onSwimPwd(e) { this.setData({ swimPwd: e.detail.value }) },
  onNewAdminPwd(e) { this.setData({ newAdminPwd: e.detail.value }) },
  onGuideText(e) { this.setData({ guideText: e.detail.value }) },
  onUnitPrice(e) { this.setData({ unitPrice: e.detail.value }) },

  async saveGuideText() {
    wx.showLoading({ title: '保存中...' })
    try {
      await api.updateAdminConfig({ guideText: this.data.guideText })
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async saveUnitPrice() {
    const price = parseFloat(this.data.unitPrice)
    if (isNaN(price) || price <= 0) {
      wx.showToast({ title: '请输入有效单价', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      await api.updateAdminConfig({ unitPrice: price })
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async pickQR() {
    const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    if (!res.tempFilePaths || res.tempFilePaths.length === 0) return

    wx.showLoading({ title: '上传中...' })
    try {
      const data = await api.uploadQR({ filePath: res.tempFilePaths[0] })
      wx.hideLoading()
      this.setData({ qrPreview: `https://erdinger.top/api/swim/qr-image/qr.png?t=${Date.now()}` })
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
  },

  async saveSwimConfig() {
    wx.showLoading({ title: '保存中...' })
    try {
      await api.updateAdminConfig({ username: this.data.swimUser, password: this.data.swimPwd })
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async saveAdminPwd() {
    if (!this.data.newAdminPwd) {
      wx.showToast({ title: '请输入新密码', icon: 'none' })
      return
    }
    wx.showLoading({ title: '更新中...' })
    try {
      await api.updateAdminPassword(this.data.newAdminPwd)
      wx.hideLoading()
      this.setData({ newAdminPwd: '' })
      wx.showToast({ title: '密码已更新', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '更新失败', icon: 'none' })
    }
  },

  // ── 通行码 ──
  onNewCodeName(e) { this.setData({ newCodeName: e.detail.value }) },
  setCodeType(e) { this.setData({ newCodeType: e.currentTarget.dataset.type }) },
  onNewCodeMax(e) { this.setData({ newCodeMax: e.detail.value }) },
  onNewCodeExpire(e) { this.setData({ newCodeExpire: e.detail.value }) },
  clearExpire() { this.setData({ newCodeExpire: '' }) },

  async loadPasscodes() {
    try {
      const list = await api.listPasscodes()
      this.setData({ passcodes: list })
    } catch { /* ignore */ }
  },

  async doCreateCode() {
    const { newCodeName, newCodeType, newCodeMax, newCodeExpire } = this.data
    if (!newCodeName) return

    wx.showLoading({ title: '创建中...' })
    try {
      await api.createPasscode({
        name: newCodeName,
        type: newCodeType,
        maxUses: parseInt(newCodeMax) || 0,
        expireAt: newCodeExpire ? new Date(newCodeExpire).toISOString() : null
      })
      wx.hideLoading()
      this.setData({ newCodeName: '', newCodeMax: '', newCodeExpire: '' })
      wx.showToast({ title: '已创建', icon: 'success' })
      this.loadPasscodes()
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '创建失败', icon: 'none' })
    }
  },

  async doDeleteCode(e) {
    const { id, name } = e.currentTarget.dataset
    const res = await wx.showModal({
      title: '确认删除',
      content: `删除通行码「${name}」？\n已绑定的客户将立即失效。`,
      confirmColor: '#ef4444'
    })
    if (!res.confirm) return

    wx.showLoading({ title: '删除中...' })
    try {
      await api.deletePasscode(id)
      wx.hideLoading()
      wx.showToast({ title: '已删除', icon: 'success' })
      this.loadPasscodes()
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  async toggleCodeDetail(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.expandedId === id) {
      this.setData({ expandedId: '', codeDetail: { boundUsers: [] } })
      return
    }
    wx.showLoading({ title: '加载中...' })
    try {
      const detail = await api.getPasscodeDetail(id)
      wx.hideLoading()
      this.setData({ expandedId: id, codeDetail: detail })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // ── 用户 ──
  async loadUsers() {
    try {
      const list = await api.listUsers()
      this.setData({ users: list })
    } catch { /* ignore */ }
  },

  // ── 日志 ──
  async loadLogs() {
    try {
      const list = await api.getLogs()
      this.setData({ logs: list })
    } catch { /* ignore */ }
  }
})
