const app = getApp()

Page({
  data: {
    theme: 'dark',
    carpoolUnread: 0,
    statusBarHeight: 0,
    navBarHeight: 0
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    const theme = wx.getStorageSync('theme') || 'dark'
    this.setData({
      theme,
      statusBarHeight: sys.statusBarHeight,
      navBarHeight: sys.statusBarHeight + 44
    })
  },

  async onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    this.loadUnread()
  },

  async loadUnread() {
    if (!app.globalData.openid) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'carpoolGetInteractions',
        data: { openid: app.globalData.openid }
      })
      const data = res.result || {}
      this.setData({ carpoolUnread: data.unreadCount || 0 })
    } catch {}
  },

  goBack() {
    wx.navigateBack()
  },

  async goCarpool() {
    if (!(await app.ensureProfile())) {
      wx.navigateTo({ url: '/pages/login/login?from=carpool' })
      return
    }
    wx.navigateTo({ url: '/pages/carpool/list/list' })
  },

  async goFeedback() {
    if (!(await app.ensureProfile())) {
      wx.navigateTo({ url: '/pages/login/login?from=feedback' })
      return
    }
    wx.navigateTo({ url: '/pages/feedback/feedback' })
  }
})
