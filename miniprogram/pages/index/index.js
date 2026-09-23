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
    stubTop: 0,
    animShrinkDy: 0,
    ticketCardStyle: '',
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
    showPromo: false,
    promoImage: '',
    promoActive: false,
    timeTipVisible: false,
    timeTipOut: false,
    timeTipText: '',
    ticketAnimPhase: '',
    animTicket: { pool: '', username: '', password: '' },
    carpoolUnread: 0,
    heroSubText: '行到水穷处，坐看云起时',
    heroCursor: '',
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
    this.startHeroTyping()
  },

  // ── 副标题打字动画（首次初始化执行一次）──
  startHeroTyping() {
    if (wx.getStorageSync('hero_typed') === '1') {
      this.setData({ heroSubText: '行到水穷处，坐看云起时', heroCursor: '' })
      return
    }
    const full = '行到水穷处，坐看云起时'
    let i = 0
    this.setData({ heroSubText: '', heroCursor: '_' })
    this._typeTimer = setInterval(() => {
      i++
      this.setData({ heroSubText: full.slice(0, i) })
      if (i >= full.length) {
        clearInterval(this._typeTimer)
        this._typeTimer = null
        this.setData({ heroCursor: '' })
        wx.setStorageSync('hero_typed', '1')
      }
    }, 120)
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

    // 确保有完整资料（本地优先，服务端兜底）
    await app.ensureProfile()
    this.setData({
      avatar: app.globalData.avatar || '',
      nickname: app.globalData.nickname || ''
    })
    // 先加载数据，再处理出票动画
    this.loadPasscodeStatus()
    this.loadInactiveStatus()
    this.loadSwimSettings()
    this.loadTickets()
    // 支付成功后回到首页，优先出票动画
    if (app.globalData.pendingTicket) {
      const ticket = app.globalData.pendingTicket
      app.globalData.pendingTicket = null
      // 等渲染完成后获取位置再启动动画
      setTimeout(() => {
        this.updateStubPosition()
        this.setData({ animTicket: ticket, showTicketAnim: true, ticketAnimPhase: 'print' })
        setTimeout(() => {
          this.startShrinkAnim()
        }, 1700)
        setTimeout(() => {
          this.setData({ showTicketAnim: false, ticketAnimPhase: '', ticketCardStyle: '' })
          this.saveTicket(ticket)
          this.loadTickets()
        }, 2700)
      }, 300)
    }
    this.loadCarpoolUnread()
  },

  async loadCarpoolUnread() {
    if (!app.globalData.openid) return
    try {
      const res = await wx.cloud.callFunction({ name: 'carpoolGetInteractions', data: { openid: app.globalData.openid } })
      const data = res.result || {}
      this.setData({ carpoolUnread: data.unreadCount || 0 })
    } catch {}
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

  async goSwim() {
    if (!this.data.swimEnabled) {
      wx.showToast({ title: '系统维护中，请直接联系国哥', icon: 'none', duration: 2500 })
      return
    }
    if (!(await app.ensureProfile())) {
      wx.navigateTo({ url: '/pages/login/login?from=swim' })
      return
    }
    wx.navigateTo({ url: '/pages/swim/swim' })
  },

  // ── 活动弹窗 ──
  checkPromo(promo) {
    const active = api.isPromoActive(promo)
    this.setData({ promoActive: active })
    if (!active) return
    if (!promo.image) return
    // 同一活动只弹一次
    const key = 'promo_seen_' + (promo.title || 'default')
    if (wx.getStorageSync(key) === '1') return
    wx.setStorageSync(key, '1')
    // 图片 fileID 转临时链接
    if (promo.image.startsWith('cloud://')) {
      wx.cloud.getTempFileURL({ fileList: [promo.image] }).then(res => {
        const url = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
        if (url) this.setData({ showPromo: true, promoImage: url })
      }).catch(() => {})
    } else {
      this.setData({ showPromo: true, promoImage: promo.image })
    }
  },
  hidePromo() {
    this.setData({ showPromo: false })
  },
  onPromoTap() {
    this.hidePromo()
    this.goSwim()
  },

  goLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' })
  },

  onTitleLongPress() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

  async loadSwimSettings() {
    try {
      const res = await api.getSwimSettingsCB()
      this.setData({ swimEnabled: res.swimEnabled === true })
      this.checkPromo(res.promo)
    } catch {
      this.setData({ swimEnabled: false })
    }
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
  startShrinkAnim() {
    const sys = wx.getSystemInfoSync()
    const rpxRate = 750 / sys.windowWidth
    // 票根中心水平位置：750rpx - 50rpx = 700rpx，屏幕中心 375rpx，差 325rpx
    const moveX = 325

    // 查询已渲染的 ticket-card 和 swim-card，计算精确的垂直偏移
    const query = wx.createSelectorQuery()
    query.select('.ticket-card').boundingClientRect()
    query.select('.swim-card').boundingClientRect()
    query.exec(res => {
      const ticketCard = res[0]
      const swimCard = res[1]
      if (!ticketCard || !swimCard) return
      // ticket-card 中心 → swim-card 中心
      const ticketCY = ticketCard.top + ticketCard.height / 2
      const swimCY = swimCard.top + swimCard.height / 2
      const dy = Math.round((swimCY - ticketCY) * rpxRate)
      // 票根 100×100rpx，卡片宽 560rpx 高不定
      const cardW = ticketCard.width * rpxRate
      const cardH = ticketCard.height * rpxRate
      const sx = (100 / cardW).toFixed(4)
      const sy = (100 / cardH).toFixed(4)
      this.setData({ ticketAnimPhase: 'shrink', ticketCardStyle: '' })
      setTimeout(() => {
        this.setData({ ticketCardStyle: `transition: transform 0.3s ease-out; transform: translateY(${dy}rpx) scaleX(${sx}) scaleY(${sy});` })
      }, 50)
      setTimeout(() => {
        this.setData({ ticketCardStyle: `transition: transform 0.4s ease-in; transform: translate(${moveX}rpx, ${dy}rpx) scaleX(${sx}) scaleY(${sy});` })
      }, 350)
    })
  },

  showTimeTip(text) {
    this.setData({ timeTipVisible: true, timeTipOut: false, timeTipText: text })
  },
  hideTimeTip() {
    this.setData({ timeTipOut: true })
    setTimeout(() => this.setData({ timeTipVisible: false, timeTipOut: false }), 280)
  },

  goHub() {
    wx.navigateTo({ url: '/pages/hub/hub' })
  },

  goMine() {
    wx.navigateTo({ url: '/pages/mine/mine' })
  },

  goHiking() {
    wx.navigateTo({ url: '/pages/hiking/list/list' })
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
    this.setData({ tickets }, () => this.updateStubPosition())
    wx.setStorageSync('myTickets', tickets)
  },

  updateStubPosition() {
    const sys = wx.getSystemInfoSync()
    const rpxRate = 750 / sys.windowWidth
    const stubH = 100 / rpxRate

    const query = wx.createSelectorQuery()
    query.select('.swim-card').boundingClientRect()
    query.exec(res => {
      const card = res[0]
      if (!card) return
      // 票根垂直居中于卡片
      const stubCY = card.top + card.height / 2
      const stubTop = stubCY - stubH / 2
      // slot 固定在屏幕垂直中心（top: 50% - 180rpx, height: 360rpx → center = 50%）
      const slotCY = sys.windowHeight / 2
      const animShrinkDy = Math.round((stubCY - slotCY) * rpxRate)
      this.setData({ stubTop, animShrinkDy })
    })
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
      const lastDate = await api.getLastCheckinCB(app.globalData.openid)
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
