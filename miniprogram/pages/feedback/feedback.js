const app = getApp()
const db = wx.cloud ? wx.cloud.database() : null

Page({
  data: {
    content: '',
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
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
  },

  async doSubmit() {
    const content = this.data.content.trim()
    if (!content) return
    if (!db) { wx.showToast({ title: '提交失败', icon: 'none' }); return }

    wx.showLoading({ title: '提交中...' })
    try {
      await db.collection('feedback').add({ data: {
        openid: app.globalData.openid || '',
        nickname: app.globalData.nickname || '匿名',
        content,
        createdAt: new Date().toISOString()
      }})
      wx.hideLoading()
      wx.showToast({ title: '感谢反馈！', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1000)
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
  }
})
