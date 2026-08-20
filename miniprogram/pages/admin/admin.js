const api = require('../../utils/api')

function formatStamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    authed: false,
    adminPwd: '',
    statusBarHeight: 0,
    errorMsg: '',

    // tab
    tab: 'config',

    // 站台
    stations: [],
    stationRequests: [],
    showStationAdd: false,
    newStationName: '',
    newStationDir: '',

    // 审核
    reviewRoutes: [],
    reviewedRoutes: [],
    showRejectModal: false,
    rejectRouteId: '',
    rejectReason: '',

    // 配置
    qrPreview: '',
    newAdminPwd: '',
    swimEnabled: true,
    theme: 'dark',
    // 活动
    promoTitle: '',
    promoPrice: '',
    promoStartAt: '',
    promoEndAt: '',
    promoEnabled: false,
    promoImage: '',
    promoPreview: '',

    // 通行码
    passcodes: [],
    passcodesPage: 0,
    passcodesHasMore: true,
    passcodesLoading: false,
    totalPasscodes: 0,
    categories: ['swim'],
    categoryCreds: {},
    newCodeCategory: 'swim',
    newCodeName: '',
    newCodeType: 'exclusive',
    newCodeMax: '',
    newCodeExpire: '',
    codeFilterCategory: '全部',
    codeSearchKey: '',
    expandedId: '',
    codeDetail: { boundUsers: [] },
    swipedUserId: '',

    // 用户
    users: [],
    usersPage: 0,
    usersHasMore: true,
    usersLoading: false,
    totalUsers: 0,

    // 打卡记录（点击用户查看）
    checkinUser: '',
    checkinNickname: '',
    checkins: [],
    checkinsPage: 0,
    checkinsHasMore: true,
    checkinsLoading: false,

    // 订单
    orders: [],
    ordersPage: 0,
    ordersHasMore: true,
    ordersLoading: false,

    // 意见
    feedbacks: [],
    feedbacksPage: 0,
    feedbacksHasMore: true,
    feedbacksLoading: false
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    const saved = wx.getStorageSync('adminPwd')
    this.setData({ statusBarHeight: sys.statusBarHeight })
    if (saved) {
      this.setData({ adminPwd: saved })
    }
  },

  onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    if (this.data.authed) {
      this.loadConfig()
      this.loadPasscodes(true)
      if (this.data.tab === 'logs') this.loadOrders(true)
      if (this.data.tab === 'feedbacks') this.loadFeedbacks(true)
      if (this.data.tab === 'users') { this.loadUsers(true) }
    }
  },

  // ── 密码校验 ──
  onPwdInput(e) { this.setData({ adminPwd: e.detail.value, errorMsg: '' }) },

  async doVerify() {
    wx.showLoading({ title: '验证中...' })
    try {
      const cfRes = await wx.cloud.callFunction({ name: 'adminUpdateConfig', data: { action: 'verifyPwd', data: { pwd: this.data.adminPwd } } })
      wx.hideLoading()
      if (cfRes.result.ok) {
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

  goBack() { wx.navigateBack() },

  // ── Tab ──
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab, expandedId: '' })
    if (tab === 'config') this.loadConfig()
    if (tab === 'stations') { this.loadStations(); this.loadStationRequests() }
    if (tab === 'review') this.loadReviewRoutes()
    if (tab === 'passcodes') { this.loadPasscodes(true); this.loadPasscodeCount() }
    if (tab === 'users') { this.loadUsers(true) }
    if (tab === 'logs') this.loadOrders(true)
    if (tab === 'feedbacks') this.loadFeedbacks(true)
  },

  // ── 审核管理 ──
  async loadReviewRoutes() {
    wx.showLoading({ title: '加载中...' })
    try {
      const [pending, approved, rejected] = await Promise.all([
        wx.cloud.callFunction({ name: 'carpoolAdminGetRoutes', data: { status: 'pending' } }),
        wx.cloud.callFunction({ name: 'carpoolAdminGetRoutes', data: { status: 'approved' } }),
        wx.cloud.callFunction({ name: 'carpoolAdminGetRoutes', data: { status: 'rejected' } })
      ])
      const allReviewed = [...(approved.result.routes || []), ...(rejected.result.routes || [])]
      this.setData({
        reviewRoutes: pending.result.routes || [],
        reviewedRoutes: allReviewed.sort((a, b) => b.createdAt - a.createdAt)
      })
    } catch (e) {
      console.error('loadReviewRoutes error:', e)
    }
    wx.hideLoading()
  },
  async doReviewRoute(e) {
    const { id, action } = e.currentTarget.dataset
    if (action === 'reject') {
      this.setData({ showRejectModal: true, rejectRouteId: id, rejectReason: '' })
      return
    }
    const title = action === 'approve' ? '确认通过' : '确认删除'
    wx.showModal({
      title,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        try {
          await wx.cloud.callFunction({ name: 'carpoolAdminReview', data: { routeId: id, action: action } })
          wx.hideLoading()
          this.loadReviewRoutes()
        } catch { wx.hideLoading(); wx.showToast({ title: '操作失败', icon: 'none' }) }
      }
    })
  },
  hideRejectModal() { this.setData({ showRejectModal: false }) },
  onRejectReasonInput(e) { this.setData({ rejectReason: e.detail.value }) },
  async confirmReject() {
    const { rejectRouteId: id, rejectReason: reason } = this.data
    wx.showLoading({ title: '处理中...' })
    try {
      await wx.cloud.callFunction({ name: 'carpoolAdminReview', data: { routeId: id, action: 'reject', reason } })
      wx.hideLoading()
      this.setData({ showRejectModal: false })
      this.loadReviewRoutes()
    } catch { wx.hideLoading(); wx.showToast({ title: '操作失败', icon: 'none' }) }
  },

  // ── 站台管理 ──
  async loadStations() {
    try {
      const res = await wx.cloud.callFunction({ name: 'carpoolAdminStations', data: { action: 'list' } })
      this.setData({ stations: res.result.stations || [] })
    } catch {}
  },
  showStationSheet() { this.setData({ showStationAdd: true, newStationName: '', newStationDir: '' }) },
  hideStationSheet() { this.setData({ showStationAdd: false }) },
  onStationNameInput(e) { this.setData({ newStationName: e.detail.value }) },
  onStationDirInput(e) { this.setData({ newStationDir: e.detail.value }) },
  async doAddStation() {
    if (!this.data.newStationName.trim()) return
    wx.showLoading({ title: '添加中...' })
    try {
      await wx.cloud.callFunction({ name: 'carpoolAdminStations', data: { action: 'add', name: this.data.newStationName.trim(), direction: this.data.newStationDir.trim() } })
      wx.hideLoading()
      this.setData({ showStationAdd: false })
      this.loadStations()
    } catch { wx.hideLoading(); wx.showToast({ title: '添加失败', icon: 'none' }) }
  },
  async doDeleteStation(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '确认删除？', success: async (res) => {
      if (!res.confirm) return
      try {
        await wx.cloud.callFunction({ name: 'carpoolAdminStations', data: { action: 'delete', stationId: id } })
        this.loadStations()
      } catch { wx.showToast({ title: '删除失败', icon: 'none' }) }
    }})
  },

  // ── 站点审核 ──
  async loadStationRequests() {
    try {
      const res = await wx.cloud.callFunction({ name: 'carpoolGetStationRequests', data: { status: 'pending' } })
      const requests = (res.result.requests || []).map(r => ({
        ...r,
        createdAtFormatted: formatStamp(r.createdAt)
      }))
      this.setData({ stationRequests: requests })
    } catch {}
  },

  async doReviewStation(e) {
    const { id, action } = e.currentTarget.dataset
    const label = action === 'approve' ? '通过' : '拒绝'
    wx.showModal({ title: `确认${label}该站点申请？`, success: async (res) => {
      if (!res.confirm) return
      wx.showLoading({ title: `${label}中...` })
      try {
        const ret = await wx.cloud.callFunction({ name: 'carpoolReviewStation', data: { requestId: id, action } })
        wx.hideLoading()
        if (ret.result.ok) {
          wx.showToast({ title: `${label}成功`, icon: 'success' })
          this.loadStationRequests()
          if (action === 'approve') this.loadStations()
        } else {
          wx.showToast({ title: ret.result.error || '操作失败', icon: 'none' })
        }
      } catch { wx.hideLoading(); wx.showToast({ title: '操作失败', icon: 'none' }) }
    }})
  },

  async loadAll() {
    await this.loadConfig()
    await this.loadPasscodes(true)
    await this.loadUsers(true)
    await this.loadOrders(true)
  },

  // ── 配置 ──
  async loadConfig() {
    try {
      const res = await wx.cloud.callFunction({ name: 'adminGetConfig' })
      const cfg = res.result.config
      if (!cfg) return
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
      // QR 链接缓存（getTempFileURL 慢，缓存到过期为止）
      const qrCache = wx.getStorageSync('admin_qr_cache') || {}
      const now = Date.now()
      let qrUrl = ''
      if (qrCache.url && qrCache.expire > now) {
        qrUrl = qrCache.url
      } else {
        const qrRes = await wx.cloud.callFunction({ name: 'adminUpdateConfig', data: { action: 'getQRUrl', data: {} } })
        qrUrl = qrRes.result.url || ''
        if (qrUrl) wx.setStorageSync('admin_qr_cache', { url: qrUrl, expire: now + 7000000 }) // ~2h
      }
      this.setData({ qrPreview: qrUrl, swimEnabled: cfg.swimEnabled !== false })
      // 活动配置
      const promo = cfg.promo || null
      this.setData({
        promoTitle: promo ? promo.title : '',
        promoPrice: promo ? String(promo.price) : '',
        promoStartAt: promo ? promo.startAt : '',
        promoEndAt: promo ? promo.endAt : '',
        promoEnabled: promo ? !!promo.enabled : false,
        promoImage: promo ? promo.image : ''
      })
      if (promo && promo.image) {
        try {
          const imgRes = await wx.cloud.getTempFileURL({ fileList: [promo.image] })
          if (imgRes.fileList && imgRes.fileList[0]) this.setData({ promoPreview: imgRes.fileList[0].tempFileURL })
        } catch {}
      }
    } catch { /* ignore */ }
  },

  onNewAdminPwd(e) { this.setData({ newAdminPwd: e.detail.value }) },

  async toggleSwimEnabled(e) {
    const enabled = e.detail.value
    this.setData({ swimEnabled: enabled })
    try {
      await wx.cloud.callFunction({ name: 'adminUpdateConfig', data: { action: 'updateConfig', data: { swimEnabled: enabled } } })
    } catch {
      this.setData({ swimEnabled: !enabled })
      wx.showToast({ title: '切换失败', icon: 'none' })
    }
  },

  // ── 活动设置 ──
  onPromoTitle(e) { this.setData({ promoTitle: e.detail.value }) },
  onPromoPrice(e) { this.setData({ promoPrice: e.detail.value }) },
  onPromoStartAt(e) { this.setData({ promoStartAt: e.detail.value }) },
  onPromoEndAt(e) { this.setData({ promoEndAt: e.detail.value }) },
  onPromoToggle(e) { this.setData({ promoEnabled: e.detail.value }) },
  async onPickPromoImage() {
    const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    if (!res.tempFilePaths || res.tempFilePaths.length === 0) return
    wx.showLoading({ title: '上传中...' })
    try {
      const uploadRes = await wx.cloud.uploadFile({ cloudPath: 'promo/promo-' + Date.now() + '.jpg', filePath: res.tempFilePaths[0] })
      const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
      wx.hideLoading()
      this.setData({ promoImage: uploadRes.fileID, promoPreview: urlRes.fileList[0].tempFileURL })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
  },
  async savePromo() {
    const { promoTitle, promoPrice, promoStartAt, promoEndAt, promoEnabled, promoImage } = this.data
    if (!promoTitle.trim()) { wx.showToast({ title: '请填活动标题', icon: 'none' }); return }
    const price = Number(promoPrice)
    if (!promoPrice || isNaN(price) || price < 19.98 || price > 23) {
      wx.showToast({ title: '活动价需在 19.98~23 之间', icon: 'none' }); return
    }
    if (!promoStartAt || !promoEndAt) { wx.showToast({ title: '请选起止日期', icon: 'none' }); return }
    if (promoStartAt > promoEndAt) { wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' }); return }
    wx.showLoading({ title: '保存中...' })
    try {
      await wx.cloud.callFunction({
        name: 'adminUpdateConfig',
        data: {
          action: 'updateConfig',
          data: {
            promo: {
              title: promoTitle.trim(),
              price,
              startAt: promoStartAt,
              endAt: promoEndAt,
              enabled: promoEnabled,
              image: promoImage
            }
          }
        }
      })
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
      const uploadRes = await wx.cloud.uploadFile({ cloudPath: 'swim-qr/qr.png', filePath: res.tempFilePaths[0] })
      const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
      await wx.cloud.callFunction({ name: 'adminUpdateConfig', data: { action: 'updateConfig', data: { qrFileID: uploadRes.fileID } } })
      wx.hideLoading()
      this.setData({ qrPreview: urlRes.fileList[0].tempFileURL })
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch(e) {
      wx.hideLoading()
      console.error('QR upload error:', e)
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
      await wx.cloud.callFunction({ name: 'adminUpdateConfig', data: { action: 'updatePwd', data: { pwd: this.data.newAdminPwd } } })
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

  async loadPasscodes(reset) {
    if (this.data.passcodesLoading) return
    const page = reset ? 0 : this.data.passcodesPage
    this.setData({ passcodesLoading: true })
    try {
      const search = reset ? this.data.codeSearchKey : (this.data.codeSearchKey || '')
      const list = await api.listPasscodesCB(page * 20, 20, search)
      const passcodes = reset ? list : this.data.passcodes.concat(list)
      this.setData({
        passcodes,
        passcodesPage: page + 1,
        passcodesHasMore: list.length >= 20,
        passcodesLoading: false
      })
    } catch {
      this.setData({ passcodesLoading: false })
    }
  },
  onFilterCodeCategory(e) {
    this.setData({ codeFilterCategory: e.currentTarget.dataset.cat })
  },
  onCodeSearchInput(e) {
    this.setData({ codeSearchKey: e.detail.value })
  },
  onCodeSearchConfirm() {
    this.setData({ passcodes: [], passcodesPage: 0, passcodesHasMore: true })
    this.loadPasscodes(true)
  },
  async loadPasscodeCount() {
    try {
      const total = await api.countPasscodesCB()
      this.setData({ totalPasscodes: total })
    } catch {}
  },
  onPasscodeScrollToLower() {
    if (this.data.passcodesHasMore && !this.data.passcodesLoading) {
      this.loadPasscodes(false)
    }
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
      const name = this.data.newCodeName
      this.setData({ newCodeName: '', newCodeMax: '', newCodeExpire: '' })
      wx.setClipboardData({ data: name })
      wx.showToast({ title: '已创建并复制', icon: 'success' })
      this.loadPasscodes(true)
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
      this.loadPasscodes(true)
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
  async loadUsers(reset) {
    if (this.data.usersLoading) return
    const page = reset ? 0 : this.data.usersPage
    this.setData({ usersLoading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'adminGetUsers', data: { skip: page * 20, limit: 20 } })
      const list = res.result.list || []
      const users = reset ? list : this.data.users.concat(list)
      this.setData({
        users,
        totalUsers: res.result.total || 0,
        usersPage: page + 1,
        usersHasMore: list.length >= 20,
        usersLoading: false
      })
    } catch {
      this.setData({ usersLoading: false })
    }
  },
  onUserScrollToLower() {
    if (this.data.usersHasMore && !this.data.usersLoading) {
      this.loadUsers(false)
    }
  },

  async showUserCheckins(e) {
    const { openid, nickname } = e.currentTarget.dataset
    this.setData({ checkinUser: openid, checkinNickname: nickname, checkins: [], checkinsPage: 0, checkinsHasMore: true })
    this.loadCheckins(true)
  },
  async loadCheckins(reset) {
    if (this.data.checkinsLoading) return
    const page = reset ? 0 : this.data.checkinsPage
    this.setData({ checkinsLoading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'adminGetCheckins', data: { openid: this.data.checkinUser, skip: page * 30, limit: 30 } })
      const list = res.result.list || []
      const checkins = reset ? list : this.data.checkins.concat(list)
      this.setData({
        checkins,
        checkinsPage: page + 1,
        checkinsHasMore: list.length >= 30,
        checkinsLoading: false
      })
    } catch {
      this.setData({ checkinsLoading: false })
    }
  },
  onCheckinScrollToLower() {
    if (this.data.checkinsHasMore && !this.data.checkinsLoading) {
      this.loadCheckins(false)
    }
  },
  backToUsers() {
    this.setData({ checkinUser: '', checkins: [] })
  },

  // ── 订单 ──
  async loadOrders(reset) {
    if (this.data.ordersLoading) return
    const page = reset ? 0 : this.data.ordersPage
    this.setData({ ordersLoading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'adminGetOrders', data: { skip: page * 20, limit: 20 } })
      const list = res.result.list || []
      const orders = reset ? list : this.data.orders.concat(list)
      this.setData({
        orders,
        ordersPage: page + 1,
        ordersHasMore: list.length >= 20,
        ordersLoading: false
      })
    } catch (e) {
      console.error('loadOrders 失败:', e)
      this.setData({ ordersLoading: false })
    }
  },
  onOrderScrollToLower() {
    if (this.data.ordersHasMore && !this.data.ordersLoading) {
      this.loadOrders(false)
    }
  },
  // ── 意见 ──
  async loadFeedbacks(reset) {
    if (this.data.feedbacksLoading) return
    const page = reset ? 0 : this.data.feedbacksPage
    this.setData({ feedbacksLoading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'adminGetFeedbacks', data: { skip: page * 20, limit: 20 } })
      const list = res.result.list || []
      const feedbacks = reset ? list : this.data.feedbacks.concat(list)
      this.setData({
        feedbacks,
        feedbacksPage: page + 1,
        feedbacksHasMore: list.length >= 20,
        feedbacksLoading: false
      })
    } catch {
      this.setData({ feedbacksLoading: false })
    }
  },
  onFeedbackScrollToLower() {
    if (this.data.feedbacksHasMore && !this.data.feedbacksLoading) {
      this.loadFeedbacks(false)
    }
  },
})
