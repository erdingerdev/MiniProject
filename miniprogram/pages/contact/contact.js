const api = require('../../utils/api')

Page({
  data: {
    qrUrl: '',
    theme: 'dark'
  },

  onLoad() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
  },

  onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    this.loadQR()
  },

  async loadQR() {
    try {
      const qrUrl = await api.getQRUrlCB()
      if (qrUrl) this.setData({ qrUrl })
    } catch {}
  }
})
