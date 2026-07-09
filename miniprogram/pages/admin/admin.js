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
    newAdminPwd: '',
    swimEnabled: true,
    theme: 'dark',

    // 通行码
    passcodes: [],
    categories: ['swim'],
    categoryCreds: {},
    newCodeCategory: 'swim',
    newCodeName: '',
    newCodeType: 'shared',
    newCodeMax: '',
    newCodeExpire: '',
    codeFilterCategory: '全部',
    expandedId: '',
    codeDetail: { boundUsers: [] },
    swipedUserId: '',

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

  onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
    if (this.data.authed) {
      this.loadConfig()
      this.loadPasscodes()
    }
  },

  // ── 密码校验 ──
  onPwdInput(e) { this.setData({ adminPwd: e.detail.value, errorMsg: '' }) },

  async doVerify() {
    wx.showLoading({ title: '验证中...' })
    try {
      const res = await api.verifyAdminCB(this.data.adminPwd)
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
      const cfg = await api.getAdminConfigCB()
      // 缓存分类账号密码
      this._categoryCredentials = cfg.categoryCredentials || {}
      const creds = {}
      for (const cat of (cfg.categories || [])) {
        creds[cat] = (cfg.categoryCredentials && cfg.categoryCredentials[cat]) || { username: '', password: '', unitPrice: 22.98 }
      }
      // 从服务端加载分类
      if (cfg.categories && cfg.categories.length) {
        this.setData({ categories: cfg.categories, categoryCreds: creds, newCodeCategory: cfg.categories[0] })
      }
      this.setData({
        guideText: cfg.guideText || '',
        qrPreview: await api.getQRUrlCB().catch(() => ''),
        swimEnabled: cfg.swimEnabled !== false
      })
    } catch { /* ignore */ }
  },

  onNewAdminPwd(e) { this.setData({ newAdminPwd: e.detail.value }) },
  onGuideText(e) { this.setData({ guideText: e.detail.value }) },

  async toggleSwimEnabled(e) {
    const enabled = e.detail.value
    this.setData({ swimEnabled: enabled })
    try {
      await api.updateAdminConfigCB({ swimEnabled: enabled })
    } catch {
      this.setData({ swimEnabled: !enabled })
      wx.showToast({ title: '切换失败', icon: 'none' })
    }
  },

  async saveGuideText() {
    wx.showLoading({ title: '保存中...' })
    try {
      await api.updateAdminConfigCB({ guideText: this.data.guideText })
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
      const data = await api.uploadAndSaveQR(res.tempFilePaths[0])
      wx.hideLoading()
      this.setData({ qrPreview: data.url })
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
  },

  async saveAdminPwd() {
    if (!this.data.newAdminPwd) {
      wx.showToast({ title: '请输入新密码', icon: 'none' })
      return
    }
    wx.showLoading({ title: '更新中...' })
    try {
      await api.updateAdminPasswordCB(this.data.newAdminPwd)
      wx.hideLoading()
      this.setData({ newAdminPwd: '' })
      wx.showToast({ title: '密码已更新', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '更新失败', icon: 'none' })
    }
  },

  // ── 通行码 ──
  selectCategory(e) {
    this.setData({ newCodeCategory: e.currentTarget.dataset.cat })
  },

  onAddCategory() {
    wx.navigateTo({ url: '/pages/admin/category-edit/category-edit' })
  },

  onEditCategory(e) {
    const cat = e.currentTarget.dataset.cat
    const creds = (this._categoryCredentials && this._categoryCredentials[cat]) || { username: '', password: '', unitPrice: 22.98 }
    wx.navigateTo({
      url: '/pages/admin/category-edit/category-edit?category=' + encodeURIComponent(cat) +
        '&username=' + encodeURIComponent(creds.username || '') +
        '&password=' + encodeURIComponent(creds.password || '') +
        '&unitPrice=' + encodeURIComponent(String(creds.unitPrice ?? 22.98))
    })
  },
  onCopyCodeName(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.name,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },
  onNewCodeName(e) { this.setData({ newCodeName: e.detail.value }) },
  setCodeType(e) { this.setData({ newCodeType: e.currentTarget.dataset.type }) },
  onNewCodeMax(e) { this.setData({ newCodeMax: e.detail.value }) },
  onNewCodeExpire(e) { this.setData({ newCodeExpire: e.detail.value }) },
  onNewCodeCategory(e) { this.setData({ newCodeCategory: e.detail.value }) },
  clearExpire() { this.setData({ newCodeExpire: '' }) },

  async loadPasscodes() {
    try {
      const list = await api.listPasscodesCB()
      // 最新创建的排在前面
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      // 从已有通行证中收集分类，保持本地列表
      const catSet = new Set(this.data.categories)
      list.forEach(p => { if (p.category) catSet.add(p.category) })
      this.setData({ passcodes: list, categories: [...catSet] })
    } catch { /* ignore */ }
  },

  async doCreateCode() {
    const { newCodeName, newCodeType, newCodeMax, newCodeExpire, newCodeCategory } = this.data
    if (!newCodeName) return

    wx.showLoading({ title: '创建中...' })
    try {
      await api.createPasscodeCB({
        name: newCodeName,
        type: newCodeType,
        maxUses: parseInt(newCodeMax) || 0,
        expireAt: newCodeExpire ? new Date(newCodeExpire).toISOString() : null,
        category: newCodeCategory || 'swim',
      })
      wx.hideLoading()
      this.setData({ newCodeName: '', newCodeMax: '', newCodeExpire: '' })
      wx.showToast({ title: '已创建', icon: 'success' })
      this.loadPasscodes()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.error || '创建失败', icon: 'none' })
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
      await api.deletePasscodeCB(id)
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
      this.setData({ expandedId: '', codeDetail: { boundUsers: [] }, swipedUserId: '' })
      return
    }
    wx.showLoading({ title: '加载中...' })
    try {
      const detail = await api.getPasscodeDetailCB(id)
      wx.hideLoading()
      this.setData({ expandedId: id, codeDetail: detail, swipedUserId: '' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 分类筛选
  onFilterCodeCategory(e) {
    const cat = e.currentTarget.dataset.cat
    this.setData({ codeFilterCategory: cat, expandedId: '', swipedUserId: '' })
  },

  // 左滑移除用户
  onDetailRowTouchStart(e) {
    this._touchX = e.touches[0].clientX
    this._touchY = e.touches[0].clientY
  },
  onDetailRowTouchMove(e) {
    const dx = e.touches[0].clientX - this._touchX
    const dy = e.touches[0].clientY - this._touchY
    if (Math.abs(dx) > Math.abs(dy) && dx < -30) {
      this.setData({ swipedUserId: e.currentTarget.dataset.openid })
    }
  },
  onDetailRowTouchEnd() {
    // keep swiped state; tap elsewhere resets
  },
  async onRemoveUser(e) {
    const openid = e.currentTarget.dataset.openid
    const passcodeId = this.data.expandedId
    const res = await wx.showModal({
      title: '确认移除',
      content: '移除该用户的绑定？',
      confirmColor: '#ef4444'
    })
    if (!res.confirm) return
    wx.showLoading({ title: '移除中...' })
    try {
      await api.unbindUserCB(openid, passcodeId)
      wx.hideLoading()
      wx.showToast({ title: '已移除', icon: 'success' })
      this.setData({ swipedUserId: '' })
      // refresh detail
      const detail = await api.getPasscodeDetailCB(passcodeId)
      this.setData({ codeDetail: detail })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '移除失败', icon: 'none' })
    }
  },

  // ── 用户 ──
  async loadUsers() {
    try {
      const list = await api.listUsersCB()
      this.setData({ users: list })
    } catch { /* ignore */ }
  },

  // ── 日志 ──
  async loadLogs() {
    try {
      const list = await api.getLogsCB()
      this.setData({ logs: list })
    } catch { /* ignore */ }
  }
})
