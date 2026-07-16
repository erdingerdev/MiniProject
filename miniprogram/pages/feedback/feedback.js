const app = getApp()
const db = wx.cloud ? wx.cloud.database() : null

Page({
  data: {
    content: '',
    list: [],
    theme: 'dark'
  },

  onLoad() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
    this.loadList()
  },

  onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
  },

  async loadList() {
    if (!db) return
    try {
      const res = await db.collection('feedback').orderBy('createdAt', 'desc').limit(50).get()
      this.setData({ list: res.data.map(f => ({
        ...f,
        createdAt: f.createdAt ? f.createdAt.slice(0, 16).replace('T', ' ') : ''
      })) })
    } catch (e) {
      // collection may not exist yet
    }
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
      this.setData({ content: '' })
      this.loadList()
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
  }
})
