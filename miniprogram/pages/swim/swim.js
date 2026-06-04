const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    status: 'loading',
    codeName: '',
    errorMsg: '',
    qrUrl: '',
    passcodeId: '',
    passcodeName: '',
    credentials: { username: '', password: '' },
    tempAvatar: '',
    tempNickname: '',
    guideLines: [],
    peopleCount: 1,
    unitPrice: '22.98',
    totalPrice: '22.98'
  },

  onLoad(options) {
    this._from = options.from || ''
  },

  async onShow() {
    if (['loading', 'needLogin', 'needPasscode'].includes(this.data.status)) {
      await this.initFlow()
    }
  },

  async initFlow() {
    if (!app.globalData.openid) {
      // 静默自动登录：如果用户之前授权过，自动拿 openid
      const stored = wx.getStorageSync('userInfo')
      if (stored && stored.nickname) {
        try {
          await app.doLogin()
          app.globalData.nickname = stored.nickname
          app.globalData.avatar = stored.avatar || ''
          // 有昵称但没头像，强制进入设置资料页
          if (!app.globalData.avatar || app.globalData.avatar.startsWith('wxfile://') || app.globalData.avatar.startsWith('http://tmp/')) {
            this.setData({
              tempAvatar: '',
              tempNickname: stored.nickname,
              status: 'needProfile'
            })
            return
          }
        } catch {
          this.setData({ status: 'needLogin' })
          return
        }
      } else {
        this.setData({ status: 'needLogin' })
        return
      }
    }
    try {
      const st = await api.getBindStatus(app.globalData.openid)
      if (st.bound) {
        this.setData({ passcodeId: st.passcodeId, passcodeName: st.passcodeName, status: 'choosePeople' })
        this.loadConfig()
      } else {
        this.setData({ status: 'needPasscode' })
      }
    } catch {
      this.setData({ status: 'needPasscode' })
    }
  },

  // ── 微信登录 ──
  async handleLogin() {
    wx.showLoading({ title: '登录中...' })
    try {
      await app.doLogin()
      wx.hideLoading()

      // 先看是否有历史头像（从 storage 恢复的）
      const stored = wx.getStorageSync('userInfo') || {}
      this.setData({
        tempAvatar: app.globalData.avatar || stored.avatar || '',
        tempNickname: app.globalData.nickname || stored.nickname || '',
        status: 'needProfile'
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    }
  },

  // ── 选择头像 ──
  onChooseAvatar(e) {
    this.setData({ tempAvatar: e.detail.avatarUrl })
  },

  // ── 昵称输入（type=nickname 会自动填入微信昵称） ──
  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value })
  },
  onNicknameBlur(e) {
    if (e.detail.value) {
      this.setData({ tempNickname: e.detail.value })
    }
  },

  // ── 确认资料 → 校验必填 ──
  async finishProfile() {
    const nickname = this.data.tempNickname
    const avatarPath = this.data.tempAvatar

    if (!avatarPath) {
      wx.showToast({ title: '请点击获取头像', icon: 'none' })
      return
    }
    if (!nickname || nickname === '微信用户' || nickname === '微信昵称') {
      wx.showToast({ title: '请点击昵称输入框获取微信昵称', icon: 'none' })
      return
    }

    // 上传头像到服务器获取永久 URL
    let avatarUrl = avatarPath
    if (avatarPath.startsWith('wxfile://') || avatarPath.startsWith('http://tmp/')) {
      wx.showLoading({ title: '上传头像...' })
      try {
        // 压缩图片：限制 400px 宽 + 60% 质量
        let uploadPath = avatarPath
        try {
          const compressRes = await new Promise(function (resolve, reject) {
            wx.compressImage({ src: avatarPath, quality: 60, compressedWidth: 400, success: resolve, fail: reject })
          })
          uploadPath = compressRes.tempFilePath
        } catch {}
        const res = await api.uploadAvatar(uploadPath)
        avatarUrl = 'https://erdinger.top' + res.url
        wx.hideLoading()
      } catch {
        wx.hideLoading()
        wx.showToast({ title: '头像上传失败，请重试', icon: 'none' })
        return
      }
    }

    app.globalData.nickname = nickname
    app.globalData.avatar = avatarUrl

    wx.setStorageSync('userInfo', { nickname, avatar: avatarUrl })

    // 同步头像到服务器
    if (avatarUrl && !avatarUrl.startsWith('wxfile://') && !avatarUrl.startsWith('http://tmp/')) {
      api.updateProfile(app.globalData.openid, nickname, avatarUrl).catch(() => {})
    }

    // 从 mine 页过来的，完成资料后返回
    if (this._from === 'mine') {
      wx.redirectTo({ url: '/pages/mine/mine' })
      return
    }

    try {
      const st = await api.getBindStatus(app.globalData.openid)
      if (st.bound) {
        this.setData({ passcodeId: st.passcodeId, passcodeName: st.passcodeName, status: 'choosePeople' })
        this.loadConfig()
        return
      }
    } catch {}
    this.setData({ status: 'needPasscode' })
  },

  // ── 输入通行码 ──
  onCodeInput(e) {
    this.setData({ codeName: e.detail.value, errorMsg: '' })
  },

  async submitCode() {
    const { codeName } = this.data
    if (!codeName) return
    wx.showLoading({ title: '验证中...' })
    try {
      const res = await api.bindPasscode(
        codeName, app.globalData.openid, app.globalData.nickname, app.globalData.avatar
      )
      wx.hideLoading()
      this.setData({
        passcodeId: res.passcodeId, passcodeName: res.passcodeName,
        status: 'choosePeople', codeName: '', errorMsg: ''
      })
      this.loadConfig()
    } catch (e) {
      wx.hideLoading()
      this.setData({ errorMsg: e.error || '验证失败' })
    }
  },

  selectCount(e) {
    const count = e.currentTarget.dataset.count
    const total = (count * parseFloat(this.data.unitPrice)).toFixed(2)
    this.setData({ peopleCount: count, totalPrice: total })
  },

  confirmPeople() {
    this.setData({ status: 'showQR' })
  },

  async loadConfig() {
    try {
      const cfg = await api.getAdminConfig()
      if (cfg.paymentQR) {
        this.setData({ qrUrl: `https://erdinger.top/api/swim/qr-image/qr.png?t=${Date.now()}` })
      }
      if (cfg.guideText) {
        this.setData({ guideLines: cfg.guideText.split('\n') })
      }
      if (cfg.unitPrice != null) {
        const price = String(cfg.unitPrice)
        const total = (this.data.peopleCount * parseFloat(price)).toFixed(2)
        this.setData({ unitPrice: price, totalPrice: total })
      }
    } catch {}
  },

  previewQR() {
    wx.previewImage({
      urls: [this.data.qrUrl],
      current: this.data.qrUrl,
      showmenu: true
    })
  },

  saveQR() {
    wx.showLoading({ title: '保存中...' })
    wx.downloadFile({
      url: this.data.qrUrl,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading()
            wx.showToast({ title: '已保存到相册', icon: 'success' })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '保存失败，请重试', icon: 'none' })
          }
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败，请重试', icon: 'none' })
      }
    })
  },

  async confirmPayment() {
    wx.showLoading({ title: '请稍候...' })
    try {
      await api.confirmPayment(app.globalData.openid, this.data.passcodeId, this.data.passcodeName, this.data.peopleCount)
      const cred = await api.getCredentials()
      wx.hideLoading()
      this.setData({ status: 'showCredentials', credentials: cred })
    } catch {
      wx.hideLoading()
      try {
        const cred = await api.getCredentials()
        this.setData({ status: 'showCredentials', credentials: cred })
      } catch {
        wx.showToast({ title: '获取失败，请重试', icon: 'none' })
      }
    }
  },

  async refreshCredentials() {
    wx.showLoading({ title: '刷新中...' })
    try {
      const cred = await api.getCredentials()
      wx.hideLoading()
      this.setData({ credentials: cred })
      wx.showToast({ title: '已更新', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '刷新失败', icon: 'none' })
    }
  }
})
