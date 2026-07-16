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
    themeTransing: false
  },

  onLoad() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
    this.genStarDots()
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
    this.loadPasscodeStatus()
    this.loadInactiveStatus()
    this.loadSwimSettings()
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
      this.setData({ swimEnabled: res.swimEnabled !== false })
    } catch {}
  },

  goLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' })
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
