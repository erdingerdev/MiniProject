const app = getApp()
const api = require('../../utils/api')

function rand(min, max) {
  return Math.floor(Math.random() * (max - min) + min)
}

Page({
  data: {
    avatar: '',
    nickname: '',
    dots: [],
    passcodeStatusText: '',
    passcodeStatusColor: '#52525b',
    inactiveDays: 0,
    swimEnabled: true,
    theme: 'dark',
    starDots: [],
    themeTransing: false,
    clockTime: '',
    earthLeft: 0,
    earthTop: 0,
    // 票系统
    tickets: [],
    showTicketList: false,
    ticketListClosing: false,
    removingId: 0,
    showTicketAnim: false,
    // 核销输入
    showRedeemInput: false,
    redeemTicketId: 0,
    redeemRemainCount: '',
    showQRModal: false,
    contactQRUrl: '',
    timeTipVisible: false,
    timeTipOut: false,
    timeTipText: '',
    ticketAnimPhase: '',
    animTicket: { pool: '', username: '', password: '' }
  },

  onLoad() {
    this.startClock()
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
    this.genStarDots()
    this.genEarthPos()
  },

  genEarthPos() {
    const w = wx.getSystemInfoSync().windowWidth
    const h = wx.getSystemInfoSync().windowHeight
    const rpxRatio = 750 / w
    const vw = 750  // rpx width
    const vh = h * rpxRatio  // rpx height
    // 随机位置，保证部分可见
    const size = 160
    this.setData({
      earthLeft: Math.random() * (vw - 40) - size * 0.6,
      earthTop: Math.random() * (vh - 40) - size * 0.6
    })
  },

  genStarDots() {
    let dots = []
    while (true) {
      dots = []
      for (let i = 0; i < 12; i++) {
        dots.push({
          left: Math.random() * 90,
          top: 5 + Math.random() * 70,
          delay: (Math.random() * 3).toFixed(1),
          peak: (1.5 + Math.random() * 2).toFixed(1)
        })
      }
      const leftCount = dots.filter(d => d.left < 50).length
      if (leftCount >= 7) break
    }
    this.setData({ starDots: dots })
  },

  async onShow() {
    // 时钟可能在 onHide 时被清除，重新启动
    if (!this._clockTimer) this.startClock()
    // 同步主题
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) {
      this.setData({ theme })
    }
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
    const u = app.globalData
    this.setData({
      avatar: u.avatar || '',
      nickname: u.nickname || ''
    })
    this.genDots()

    // 确保已登录再检查通行码状态
    if (!app.globalData.openid) {
      const stored = wx.getStorageSync('userInfo')
      if (stored && stored.nickname) {
        try {
          await app.doLogin()
          app.globalData.nickname = stored.nickname
          app.globalData.avatar = stored.avatar || ''
          this.setData({
            avatar: u.avatar || '',
            nickname: u.nickname || ''
          })
        } catch {
          return
        }
      } else {
        return
      }
    }
    // 支付成功后回到首页，优先出票动画，结束后再加载数据
    if (app.globalData.pendingTicket) {
      const ticket = app.globalData.pendingTicket
      app.globalData.pendingTicket = null
      this.setData({ animTicket: ticket, showTicketAnim: true, ticketAnimPhase: 'print' })
      setTimeout(() => {
        this.setData({ ticketAnimPhase: 'shrink' })
      }, 1700)
      setTimeout(() => {
        this.setData({ showTicketAnim: false, ticketAnimPhase: '' })
        this.saveTicket(ticket)
        this.loadPasscodeStatus()
        this.loadInactiveStatus()
        this.loadTickets()
        this.loadSwimSettings()
      }, 2700)
    } else {
      this.loadPasscodeStatus()
      this.loadInactiveStatus()
      this.loadTickets()
      this.loadSwimSettings()
    }
  },

  async loadPasscodeStatus() {
    if (!app.globalData.openid) return
    try {
      const res = await api.getUserPasscodeStatusCB(app.globalData.openid)
      if (!res.hasPasscode || !res.passcodes || res.passcodes.length === 0) {
        wx.removeStorageSync('selectedPasscodeId')
        this.setData({ passcodeStatusText: '未获得通行码', passcodeStatusColor: '#52525b' })
      } else {
        const savedId = wx.getStorageSync('selectedPasscodeId')
        let selected = savedId ? res.passcodes.find(p => p.id === savedId) : null
        // 如果缓存指向已删除的通行证，清除并切换到第一个
        if (selected && selected.status === 'deleted') {
          wx.removeStorageSync('selectedPasscodeId')
          selected = res.passcodes.find(p => p.status !== 'deleted') || selected
        }
        if (!selected) selected = res.passcodes[0]
        const label = selected.category || selected.name || '未知'
        if (selected.status === 'active') {
          this.setData({
            passcodeStatusText: label + ' · 生效中',
            passcodeStatusColor: '#34d399'
          })
        } else if (selected.status === 'deleted') {
          this.setData({
            passcodeStatusText: label + ' · 已删除',
            passcodeStatusColor: '#f87171'
          })
        } else {
          this.setData({
            passcodeStatusText: label + ' · 已过期',
            passcodeStatusColor: '#f87171'
          })
        }
      }
    } catch {
      this.setData({ passcodeStatusText: '' })
    }
  },

  genDots() {
    const dots = []
    const w = 750
    const h = 1600
    for (let i = 0; i < 30; i++) {
      dots.push({
        x: rand(0, w),
        y: rand(0, h),
        s: rand(2, 6),
        o: (Math.random() * 0.3 + 0.1).toFixed(2),
        d: (Math.random() * 3).toFixed(1)
      })
    }
    this.setData({ dots })
  },

  startClock() {
    this.updateClock()
    this._clockTimer = setInterval(() => this.updateClock(), 1000)
  },

  updateClock() {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    this.setData({ clockTime: h + ':' + m })
  },

  goSwim() {
    if (!this.data.swimEnabled) {
      wx.showToast({ title: '系统维护中，请直接联系国哥', icon: 'none', duration: 2500 })
      return
    }
    wx.navigateTo({ url: '/pages/swim/swim' })
  },

  async loadSwimSettings() {
    try {
      const res = await api.getSwimSettingsCB()
      this.setData({ swimEnabled: res.swimEnabled === true })
    } catch {
      // 查询失败时保守关闭入口
      this.setData({ swimEnabled: false })
    }
  },

  goLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' })
  },

  // ── 标题 8 连击 → 后台管理 ──
  onTitleLongPress() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

  // ── 联系国哥 ──
  async showContactQR() {
    this.setData({ showQRModal: true })
    if (!this.data.contactQRUrl) {
      try {
        const url = await api.getQRUrlCB()
        this.setData({ contactQRUrl: url })
      } catch { /* ignore */ }
    }
  },
  hideContactQR() {
    this.setData({ showQRModal: false })
  },
  noop() {},
  showTimeTip(text) {
    this.setData({ timeTipVisible: true, timeTipOut: false, timeTipText: text })
  },
  hideTimeTip() {
    this.setData({ timeTipOut: true })
    setTimeout(() => this.setData({ timeTipVisible: false, timeTipOut: false }), 280)
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' })
  },

  goMine() {
    if (!app.globalData.openid || !app.globalData.nickname || !app.globalData.avatar) {
      wx.navigateTo({ url: '/pages/swim/swim?from=mine' })
      return
    }
    wx.navigateTo({ url: '/pages/mine/mine' })
  },

  onHide() {
    if (this._clockTimer) { clearInterval(this._clockTimer); this._clockTimer = null }
  },

  onUnload() {
    if (this._clockTimer) { clearInterval(this._clockTimer); this._clockTimer = null }
  },

  onToggleTheme() {
    if (this.data.themeTransing) return
    const next = this.data.theme === 'dark' ? 'light' : 'dark'
    this.setData({ theme: next, themeTransing: true })
    wx.setStorageSync('theme', next)
    app.globalData.theme = next
    setTimeout(() => this.setData({ themeTransing: false }), 1900)
  },

  onShareAppMessage() {
    return {
      title: '得闲意 — 行到水穷处，坐看云起时',
      path: '/pages/index/index'
    }
  },

  // ── 票系统 ──
  saveTicket(ticket) {
    let tickets = this.data.tickets.concat(ticket)
    // 去重（CB 恢复的订单和 pendingTicket 可能是同一条）
    const seen = new Set()
    tickets = tickets.filter(t => {
      const key = t.paidAt + '_' + t.username
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    // 过滤超2小时和已核销
    const now = Date.now()
    tickets = tickets.filter(t => !t.redeemed && now - t.paidAt < 7200000)
    this.setData({ tickets })
    wx.setStorageSync('myTickets', tickets)
  },

  async loadTickets() {
    let tickets = wx.getStorageSync('myTickets') || []
    // CB 恢复已禁用（orders 集合仅可写不可读）
    // 用户票据仅存储于本地缓存
    const now = Date.now()
    tickets = tickets.filter(t => !t.redeemed && now - t.paidAt < 7200000)
    this.setData({ tickets })
    wx.setStorageSync('myTickets', tickets)
  },

  showTickets() {
    this.setData({ showTicketList: true })
    this.loadTickets()
  },

  closeTicketList() {
    // 先播退出动画，再移除
    this.setData({ ticketListClosing: true })
    setTimeout(() => {
      this.setData({ showTicketList: false, ticketListClosing: false })
    }, 400)
  },

  redeemTicket(e) {
    const id = e.currentTarget.dataset.id
    // 弹输入框让用户填写剩余次数
    this.setData({ showRedeemInput: true, redeemTicketId: id, redeemRemainCount: '' })
  },
  onRedeemRemainInput(e) {
    const val = e.detail.value.replace(/[^0-9]/g, '')
    this.setData({ redeemRemainCount: val })
  },
  async confirmRedeem() {
    const id = this.data.redeemTicketId
    const remain = this.data.redeemRemainCount.trim()
    const ticket = this.data.tickets.find(t => t.paidAt === id)
    this.setData({ showRedeemInput: false })
    if (!ticket) return
    // 标记移除 → 播放退出动画 → 真正删除
    this.setData({ removingId: id })
    setTimeout(async () => {
      const tickets = this.data.tickets.map(t => {
        if (t.paidAt === id) t.redeemed = true
        return t
      }).filter(t => !t.redeemed)
      this.setData({ tickets, removingId: 0, showTicketList: tickets.length > 0 })
      wx.setStorageSync('myTickets', tickets)
      // 同步 CB：标记订单已核销
      if (wx.cloud && ticket && ticket._orderId) {
        wx.cloud.database().collection('orders').doc(ticket._orderId)
          .update({ data: { redeemed: true } }).catch(() => {})
      }
      // 发送企微通知
      if (wx.cloud && ticket) {
        wx.cloud.callFunction({
          name: 'notifyRedeem',
          data: {
            pool: ticket.pool,
            nickname: app.globalData.nickname,
            peopleCount: ticket.peopleCount,
            remainCount: remain
          }
        }).catch(() => {})
      }
    }, 400)
  },
  cancelRedeem() {
    this.setData({ showRedeemInput: false })
  },

  onShareTimeline() {
    return {
      title: '得闲意 — 行到水穷处，坐看云起时'
    }
  },

  async loadInactiveStatus() {
    if (!app.globalData.openid) return
    try {
      const stats = await api.getUserStats(app.globalData.openid)
      const lastDate = stats.lastCheckinDate
      if (lastDate) {
        const last = new Date(lastDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        last.setHours(0, 0, 0, 0)
        const diff = Math.floor((today - last) / 86400000)
        this.setData({ inactiveDays: diff })
      } else {
        this.setData({ inactiveDays: 999 })
      }
    } catch {}
  }
})
