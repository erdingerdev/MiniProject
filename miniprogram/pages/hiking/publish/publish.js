const app = getApp()

Page({
  data: {
    theme: 'dark',
    statusBarHeight: 0,
    navBarTotalHeight: 0,
    scrolled: false,
    images: [],
    title: '',
    content: ''
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

  // ── 图片 ──
  addImages() {
    const remain = 18 - this.data.images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多 18 张图片', icon: 'none' })
      return
    }
    wx.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      success: (res) => {
        this.setData({ images: this.data.images.concat(res.tempFilePaths) })
      }
    })
  },
  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.images.slice()
    images.splice(index, 1)
    this.setData({ images })
  },

  // ── 标题 / 正文 ──
  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },
  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  // ── 发布 ──
  async save() {
    wx.hideKeyboard()  // 点击发布先收起键盘，避免输入框穿透重新聚焦
    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    const content = this.data.content.trim()
    if (!content) {
      wx.showToast({ title: '请写点路线内容', icon: 'none' })
      return
    }

    if (this._saving) return
    this._saving = true
    wx.showLoading({ title: '发布中...', mask: true })

    try {
      // 1. 逐张上传图片到云存储 hiking/ 目录
      const fileIDs = []
      for (let i = 0; i < this.data.images.length; i++) {
        const p = this.data.images[i]
        const ext = (p.match(/\.(\w+)$/) || [])[1] || 'jpg'
        const cloudPath = `hiking/${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}.${ext}`
        const up = await wx.cloud.uploadFile({ cloudPath, filePath: p })
        fileIDs.push(up.fileID)
      }
      // 2. 调云函数（内部做机审 + 频控 + 写库）
      const res = await wx.cloud.callFunction({
        name: 'hikingPublishRoute',
        data: {
          title,
          content,
          images: fileIDs,
          nickname: app.globalData.nickname || '',
          avatar: app.globalData.avatar || ''
        }
      })
      const result = res.result || {}
      wx.hideLoading()
      if (result.ok) {
        wx.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1200)
      } else {
        wx.showToast({ title: result.error || '发布失败', icon: 'none', duration: 2500 })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
    }
    this._saving = false
  },

  goBack() {
    wx.navigateBack()
  }
})
