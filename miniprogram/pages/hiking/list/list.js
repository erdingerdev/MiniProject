Page({
  data: {
    theme: 'dark',
    statusBarHeight: 0,
    navBarTotalHeight: 0
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

  goBack() {
    wx.navigateBack()
  },

  goPublish() {
    wx.showToast({ title: '发布功能开发中', icon: 'none' })
  }
})
