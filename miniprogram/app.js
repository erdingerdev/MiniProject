const api = require('./utils/api')

App({
  globalData: {
    openid: null,
    nickname: '',
    avatar: '',
    token: null
  },

  onLaunch() {
    // 初始化 CloudBase
    if (wx.cloud) {
      wx.cloud.init({
        env: 'erdinger-dev-d0gzsgzbo6e40458d',
        traceUser: true
      })
      console.log('CloudBase 初始化成功')
    }

    // 仅恢复头像昵称用于展示，不恢复 openid（openid 必须通过 wx.login 重新获取）
    const stored = wx.getStorageSync('userInfo')
    if (stored) {
      this.globalData.nickname = stored.nickname || ''
      this.globalData.avatar = stored.avatar || ''
    }
  },

  // 微信登录获取 openid（模拟器超时走 mock，mock 持久化避免每次变）
  async doLogin() {
    return new Promise((resolve, reject) => {
      let done = false
      const timeout = setTimeout(() => {
        if (done) return
        done = true
        const mockId = this.getMockOpenid()
        this.globalData.openid = mockId
        this.globalData.token = 'mock'
        console.warn('wx.login 超时，使用开发模式 openid:', mockId)
        resolve(mockId)
      }, 8000)

      wx.login({
        success: async (loginRes) => {
          if (done) return
          clearTimeout(timeout)
          done = true
          try {
            const res = await wx.cloud.callFunction({ name: 'wxLogin', data: { code: loginRes.code } })
            const data = res.result
            if (data.error) { reject(new Error(data.error)); return }
            this.globalData.token = 'cb_' + data.openid
            this.globalData.openid = data.openid
            resolve(data.openid)
          } catch (e) {
            reject(e)
          }
        },
        fail: (err) => {
          if (done) return
          clearTimeout(timeout)
          done = true
          const mockId = this.getMockOpenid()
          this.globalData.openid = mockId
          this.globalData.token = 'mock'
          console.warn('wx.login 失败，使用开发模式 openid:', mockId, err)
          resolve(mockId)
        }
      })
    })
  },

  getMockOpenid() {
    let id = wx.getStorageSync('mock_openid')
    if (!id) {
      id = 'dev_' + Date.now()
      wx.setStorageSync('mock_openid', id)
    }
    return id
  },

  // 是否已具备完整资料（openid + 昵称 + 头像）
  hasProfile() {
    return !!(this.globalData.openid && this.globalData.nickname && this.globalData.avatar)
  },

  // 确保有完整资料：已有直接返回，否则本地恢复 → 服务端兜底
  async ensureProfile() {
    if (this.hasProfile()) return true
    // 1. 先确保 openid（登录）
    if (!this.globalData.openid) {
      try { await this.doLogin() } catch { return false }
    }
    // 2. 本地缓存有效，直接恢复
    const stored = wx.getStorageSync('userInfo')
    if (stored && stored.nickname && stored.avatar &&
        !stored.avatar.startsWith('wxfile://') && !stored.avatar.startsWith('http://tmp/') &&
        !stored.nickname.startsWith('wxid_')) {
      this.globalData.nickname = stored.nickname
      this.globalData.avatar = stored.avatar
      return true
    }
    // 3. 服务端兜底
    try {
      const user = await api.getUserProfileCB(this.globalData.openid)
      if (user && user.nickname && user.avatar &&
          !user.avatar.startsWith('wxfile://') && !user.avatar.startsWith('http://tmp/') &&
          !user.nickname.startsWith('wxid_')) {
        this.globalData.nickname = user.nickname
        this.globalData.avatar = user.avatar
        wx.setStorageSync('userInfo', { nickname: user.nickname, avatar: user.avatar })
        return true
      }
    } catch {}
    // 4. 都没有
    return false
  },

  // 获取用户头像昵称
  async getUserProfile() {
    return new Promise((resolve) => {
      wx.getUserProfile({
        desc: '用于识别您的身份',
        success: (res) => {
          this.globalData.nickname = res.userInfo.nickName
          this.globalData.avatar = res.userInfo.avatarUrl
          wx.setStorageSync('userInfo', {
            nickname: res.userInfo.nickName,
            avatar: res.userInfo.avatarUrl
          })
          resolve(res.userInfo)
        },
        fail: (err) => {
          console.warn('getUserProfile 失败:', err)
          resolve(null)
        }
      })
    })
  }
})
