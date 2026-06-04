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
    inactiveDays: 0
  },

  async onShow() {
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
  },

  async loadPasscodeStatus() {
    if (!app.globalData.openid) return
    try {
      const res = await api.getUserPasscodeStatus(app.globalData.openid)
      if (!res.hasPasscode) {
        this.setData({ passcodeStatusText: '未获得通行码', passcodeStatusColor: '#52525b' })
      } else if (res.show) {
        const active = res.status === 'active'
        this.setData({
          passcodeStatusText: res.passcodeName + ' · ' + (active ? '生效中' : '已删除'),
          passcodeStatusColor: active ? '#34d399' : '#f87171'
        })
      } else {
        this.setData({ passcodeStatusText: '', passcodeStatusColor: '#52525b' })
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
    wx.navigateTo({ url: '/pages/swim/swim' })
  },

  goLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

  goMine() {
    if (!app.globalData.openid || !app.globalData.nickname || !app.globalData.avatar) {
      wx.navigateTo({ url: '/pages/swim/swim?from=mine' })
      return
    }
    wx.navigateTo({ url: '/pages/mine/mine' })
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
