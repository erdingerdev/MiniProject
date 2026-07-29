const app = getApp()
const db = wx.cloud ? wx.cloud.database() : null

Page({
  data: {
    content: '',
    theme: 'dark',
    bgStyle: '',
    statusBarHeight: 0
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    const theme = wx.getStorageSync('theme') || 'dark'
    const bgStyle = theme === 'light'
      ? 'background: linear-gradient(160deg, #016B61 0%, #70B2B2 40%, #9ECFD4 70%, #E5E9C5 100%);'
      : ''
    this.setData({ theme, bgStyle, statusBarHeight: sys.statusBarHeight })
  },

  onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    const bgStyle = theme === 'light'
      ? 'background: linear-gradient(160deg, #016B61 0%, #70B2B2 40%, #9ECFD4 70%, #E5E9C5 100%);'
      : ''
    if (this.data.theme !== theme || this.data.bgStyle !== bgStyle) this.setData({ theme, bgStyle })
  },

  goBack() { wx.navigateBack() },

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
