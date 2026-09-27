Page({
  data: {
    theme: 'dark',
    statusBarHeight: 0,
    navBarTotalHeight: 0,
    scrolled: false
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    const theme = wx.getStorageSync('theme') || 'dark'
    const rpxRate = sys.windowWidth / 750
    this.setData({
      theme,
      statusBarHeight: sys.statusBarHeight,
      navBarTotalHeight: sys.statusBarHeight + 44 + 8 + 40 * rpxRate
    })
  },

  onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
  },

  onPageScroll(e) {
    const scrolled = e.scrollTop > 20
    if (scrolled !== this.data.scrolled) this.setData({ scrolled })
  },

  goBack() {
    wx.navigateBack()
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/hiking/publish/publish' })
  }
})
