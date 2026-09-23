const app = getApp()

Page({
  data: {
    status: 'needLogin',   // needLogin | needProfile
    statusBarHeight: 0,
    theme: 'dark',
    tempAvatar: '',
    tempNickname: ''
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync()
    const theme = wx.getStorageSync('theme') || 'dark'
    this.setData({
      theme,
      statusBarHeight: sys.statusBarHeight
    })
    this._from = options.from || ''
  },

  onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
  },

  goBack() {
    wx.navigateBack()
  },

  // ── 微信登录按钮 → 进入资料设置 ──
  handleLogin() {
    this.setData({
      tempAvatar: '',
      tempNickname: '',
      status: 'needProfile'
    })
  },

  // ── 选择头像 ──
  onChooseAvatar(e) {
    this.setData({ tempAvatar: e.detail.avatarUrl })
  },

  // ── 昵称输入 ──
  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value })
  },
  onNicknameBlur(e) {
    if (e.detail.value) {
      this.setData({ tempNickname: e.detail.value })
    }
  },

  // ── 确认资料 ──
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
    if (nickname.startsWith('wxid_')) {
      wx.showToast({ title: '请填写真实昵称（勿填微信号）', icon: 'none' })
      return
    }

    wx.showLoading({ title: '登录中...', mask: true })

    // 真正登录
    if (!app.globalData.openid) {
      try { await app.doLogin() } catch {
        wx.hideLoading()
        wx.showToast({ title: '登录失败', icon: 'none' })
        return
      }
    }

    let avatarUrl = avatarPath
    if (avatarPath.startsWith('wxfile://') || avatarPath.startsWith('http://tmp/')) {
      try {
        let uploadPath = avatarPath
        try {
          const compressRes = await new Promise(function (resolve, reject) {
            wx.compressImage({ src: avatarPath, quality: 60, compressedWidth: 400, success: resolve, fail: reject })
          })
          uploadPath = compressRes.tempFilePath
        } catch {}
        const api = require('../../utils/api')
        const res = await api.uploadAvatarCB(uploadPath)
        avatarUrl = res.url
      } catch {
        wx.hideLoading()
        wx.showToast({ title: '头像上传失败，请重试', icon: 'none' })
        return
      }
    }

    app.globalData.nickname = nickname
    app.globalData.avatar = avatarUrl
    wx.setStorageSync('userInfo', { nickname, avatar: avatarUrl })

    // 更新服务端资料
    if (avatarUrl && !avatarUrl.startsWith('wxfile://') && !avatarUrl.startsWith('http://tmp/')) {
      const api = require('../../utils/api')
      api.updateProfileCB(app.globalData.openid, nickname, avatarUrl).catch(() => {})
    }

    // 根据来源跳转
    wx.hideLoading()
    if (this._from === 'swim') {
      wx.redirectTo({ url: '/pages/swim/swim' })
      return
    }
    if (this._from === 'carpool') {
      wx.redirectTo({ url: '/pages/carpool/list/list' })
      return
    }
    if (this._from === 'feedback') {
      wx.redirectTo({ url: '/pages/feedback/feedback' })
      return
    }

    // 默认返回上一页
    wx.navigateBack()
  }
})
