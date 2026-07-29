const app = getApp()
const api = require('../../utils/api')

function formatTime(d) {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}:${s}`
}

Page({
  data: {
    status: 'loading',
    codeName: '',
    errorMsg: '',
    passcodeId: '',
    passcodeName: '',
    passcodeCategory: '',
    credentials: { username: '', password: '' },
    tempAvatar: '',
    tempNickname: '',
    peopleCount: 1,
    unitPrice: '22.98',
    totalPrice: '22.98',
    passcodes: [],
    selectedPasscodeId: '',
    showPoolPicker: false,
    showBindDialog: false,
    theme: 'dark',
    newBindCodeName: '',
    timeTipVisible: false,
    timeTipOut: false,
    timeTipText: ''
  },

  onLoad(options) {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
    this._from = options.from || ''
  },

  async onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
    if (['loading', 'needLogin', 'needPasscode', 'needProfile'].includes(this.data.status)) {
      await this.initFlow()
    }
  },

  async initFlow() {
    if (!app.globalData.openid) {
      const stored = wx.getStorageSync('userInfo')
      if (stored && stored.nickname) {
        try {
          await app.doLogin()
          app.globalData.nickname = stored.nickname
          app.globalData.avatar = stored.avatar || ''
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
      const st = await api.getBindStatusCB(app.globalData.openid)
      if (st.bound && st.passcodes && st.passcodes.length > 0) {
        // 筛选有效通行证
        const validPasscodes = st.passcodes.filter(p => p.valid)
        if (validPasscodes.length === 0) {
          this.setData({ status: 'needPasscode', passcodes: st.passcodes })
          return
        }
        // 优先恢复上次选中的通行证
        const savedId = wx.getStorageSync('selectedPasscodeId')
        let selected = validPasscodes.find(p => p.id === savedId) || validPasscodes[0]
        const price = String(selected.unitPrice)
        const total = (this.data.peopleCount * parseFloat(price)).toFixed(2)
        this.setData({
          _realUnitPrice: price,
          passcodes: st.passcodes,
          selectedPasscodeId: selected.id,
          passcodeId: selected.id,
          passcodeName: selected.name,
          passcodeCategory: selected.category,
          unitPrice: price,
          totalPrice: total,
          status: 'choosePeople'
        })

      } else {
        this.setData({ status: 'needPasscode' })
      }
    } catch (e) {
      console.error('CloudBase initFlow error:', e)
      this.setData({ status: 'needPasscode' })
    }
  },

  // ── 微信登录 ──
  async handleLogin() {
    // 不在这里登录，只跳到资料设置页
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

    // 确认资料后才真正登录
    if (!app.globalData.openid) {
      try { await app.doLogin() } catch { wx.showToast({ title: '登录失败', icon: 'none' }); return }
    }

    let avatarUrl = avatarPath
    if (avatarPath.startsWith('wxfile://') || avatarPath.startsWith('http://tmp/')) {
      wx.showLoading({ title: '上传头像...' })
      try {
        let uploadPath = avatarPath
        try {
          const compressRes = await new Promise(function (resolve, reject) {
            wx.compressImage({ src: avatarPath, quality: 60, compressedWidth: 400, success: resolve, fail: reject })
          })
          uploadPath = compressRes.tempFilePath
        } catch {}
        const res = await api.uploadAvatarCB(uploadPath)
        avatarUrl = res.url
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

    if (avatarUrl && !avatarUrl.startsWith('wxfile://') && !avatarUrl.startsWith('http://tmp/')) {
      api.updateProfile(app.globalData.openid, nickname, avatarUrl).catch(() => {})
    }

    if (this._from === 'mine') {
      wx.redirectTo({ url: '/pages/mine/mine' })
      return
    }

    try {
      const st = await api.getBindStatusCB(app.globalData.openid)
      if (st.bound && st.passcodes && st.passcodes.length > 0) {
        const validPasscodes = st.passcodes.filter(p => p.valid)
        if (validPasscodes.length === 0) {
          this.setData({ status: 'needPasscode', passcodes: st.passcodes })
          return
        }
        const savedId = wx.getStorageSync('selectedPasscodeId')
        const selected = validPasscodes.find(p => p.id === savedId) || validPasscodes[0]
        const price = String(selected.unitPrice)
        const total = (this.data.peopleCount * parseFloat(price)).toFixed(2)
        this.setData({
          passcodes: st.passcodes,
          selectedPasscodeId: selected.id,
          passcodeId: selected.id,
          passcodeName: selected.name,
          passcodeCategory: selected.category,
          _realUnitPrice: price, unitPrice: price,
          totalPrice: total,
          status: 'choosePeople'
        })

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
      const res = await api.bindPasscodeCB(
        codeName, app.globalData.openid, app.globalData.nickname, app.globalData.avatar
      )
      wx.hideLoading()
      // 从响应中获取所有 passcodes
      if (res.passcodes && res.passcodes.length > 0) {
        const validPasscodes = res.passcodes.filter(p => p.valid)
        const selected = validPasscodes.length > 0 ? validPasscodes[0] : res.passcodes[0]
        const price = String(selected.unitPrice)
        const total = (this.data.peopleCount * parseFloat(price)).toFixed(2)
        wx.setStorageSync('selectedPasscodeId', selected.id)
        this.setData({
          passcodes: res.passcodes,
          selectedPasscodeId: selected.id,
          passcodeId: selected.id,
          passcodeName: selected.name,
          passcodeCategory: selected.category,
          _realUnitPrice: price, unitPrice: price,
          totalPrice: total,
          status: 'choosePeople',
          codeName: '',
          errorMsg: ''
        })

      } else {
        this.setData({
          passcodeId: res.passcodeId, passcodeName: res.passcodeName, passcodeCategory: res.passcodeCategory,
          status: 'choosePeople', codeName: '', errorMsg: ''
        })

      }
    } catch (e) {
      wx.hideLoading()
      this.setData({ errorMsg: e.error || '验证失败' })
    }
  },

  // ── 选择人数 ──
  selectCount(e) {
    const count = e.currentTarget.dataset.count
    const price = String(this.data._realUnitPrice || this.data.unitPrice)
    const total = (count * parseFloat(price)).toFixed(2)
    this.setData({ peopleCount: count, unitPrice: price, totalPrice: total })
  },

  async confirmPeople() {
    // 时段限制：周一至五 11:30-21:00，周六日 08:30-21:00
    const now = new Date()
    const day = now.getDay()
    const time = now.getHours() * 60 + now.getMinutes()
    const isWeekend = day === 0 || day === 6
    const openTime = isWeekend ? '9:00' : '12:00'
    const buyStart = isWeekend ? 510 : 690
    const buyEnd = 1260
    if (time < buyStart) {
      const text = isWeekend ? '周末 09:00 开馆\n08:30 之后再来买票吧' : '周中 12:00 开馆\n11:30 之后再来买票吧'
      this.showTimeTip(text)
      return
    }
    if (time >= buyEnd) {
      this.showTimeTip('22:00 闭馆\n明天再来吧')
      return
    }
    wx.showLoading({ title: '创建订单...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'wxPay',
        data: {
          openid: app.globalData.openid,
          amount: parseFloat(this.data.totalPrice),
          nickname: app.globalData.nickname,
          pool: this.data.passcodeCategory,
          peopleCount: this.data.peopleCount
        }
      })
      wx.hideLoading()
      if (!res.result.ok) {
        wx.showToast({ title: res.result.error || '支付失败', icon: 'none' })
        return
      }
      // 调起微信支付
      const payment = res.result.payment
      wx.requestPayment({
        timeStamp: payment.timeStamp,
        nonceStr: payment.nonceStr,
        package: payment.package,
        signType: payment.signType,
        paySign: payment.paySign,
        success: async () => {
          wx.showLoading({ title: '处理中...' })
          try {
            const cred = await api.getCredentialsCB(this.data.selectedPasscodeId, app.globalData.openid)
            const ticket = {
              pool: this.data.passcodeCategory || this.data.passcodeName,
              username: cred.username,
              password: cred.password,
              unitPrice: parseFloat(this.data.unitPrice),
              totalPrice: parseFloat(this.data.totalPrice),
              peopleCount: this.data.peopleCount,
              paidAt: Date.now(),
              timeStr: formatTime(new Date())
            }
            const result = await api.confirmPaymentCB(app.globalData.openid, this.data.passcodeId, this.data.passcodeName, this.data.peopleCount, ticket)
            ticket._orderId = result.orderId
            wx.hideLoading()
            app.globalData.pendingTicket = ticket
            const pages = getCurrentPages()
            wx.navigateBack({ delta: pages.length - 1 })
          } catch {
            wx.hideLoading()
            wx.showToast({ title: '处理失败，请联系国哥', icon: 'none', duration: 2500 })
          }
        },
        fail: () => {
          wx.showToast({ title: '支付取消', icon: 'none' })
        }
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '支付失败，请直接联系国哥', icon: 'none', duration: 2500 })
    }
  },

  // ── 时段提示弹窗 ──
  showTimeTip(text) {
    this.setData({ timeTipVisible: true, timeTipOut: false, timeTipText: text })
  },
  hideTimeTip() {
    this.setData({ timeTipOut: true })
    setTimeout(() => this.setData({ timeTipVisible: false, timeTipOut: false }), 280)
  },
  noop() {},

  // ── 切换泳池 ──
  onSwitchPool() {
    this.setData({ showPoolPicker: true })
  },

  closePoolPicker() {
    this.setData({ showPoolPicker: false })
  },

  onSelectPool(e) {
    const id = e.currentTarget.dataset.id
    const passcode = this.data.passcodes.find(p => p.id === id)
    if (!passcode) return
    if (!passcode.valid) {
      wx.showToast({ title: '该通行码已失效', icon: 'none' })
      return
    }
    const price = String(passcode.unitPrice)
    const total = (this.data.peopleCount * parseFloat(price)).toFixed(2)
    wx.setStorageSync('selectedPasscodeId', passcode.id)
    this.setData({
      selectedPasscodeId: passcode.id,
      passcodeId: passcode.id,
      passcodeName: passcode.name,
      passcodeCategory: passcode.category,
      _realUnitPrice: price, unitPrice: price,
      totalPrice: total,
      showPoolPicker: false
    })
  },

  // ── 刷新账号密码 ──
  async refreshCredentials() {
    wx.showLoading({ title: '刷新中...' })
    try {
      const cred = await api.getCredentialsCB(this.data.selectedPasscodeId, app.globalData.openid)
      wx.hideLoading()
      this.setData({ credentials: cred })
      wx.showToast({ title: '已更新', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '刷新失败', icon: 'none' })
    }
  },

  // ── 绑定其他通行码弹窗 ──
  onToggleBindInput() {
    this.setData({ showBindDialog: true, newBindCodeName: '' })
  },

  closeBindDialog() {
    this.setData({ showBindDialog: false, newBindCodeName: '' })
  },

  onBindCodeInput(e) {
    this.setData({ newBindCodeName: e.detail.value })
  },

  async doBindAnother() {
    const name = this.data.newBindCodeName.trim()
    if (!name) return
    wx.showLoading({ title: '验证中...' })
    try {
      const res = await api.bindPasscodeCB(
        name, app.globalData.openid, app.globalData.nickname, app.globalData.avatar
      )
      wx.hideLoading()
      if (res.passcodes && res.passcodes.length > 0) {
        const validPasscodes = res.passcodes.filter(p => p.valid)
        const selected = validPasscodes.length > 0 ? validPasscodes[0] : res.passcodes[0]
        const price = String(selected.unitPrice)
        const total = (this.data.peopleCount * parseFloat(price)).toFixed(2)
        wx.setStorageSync('selectedPasscodeId', selected.id)
        this.setData({
          passcodes: res.passcodes,
          selectedPasscodeId: selected.id,
          passcodeId: selected.id,
          passcodeName: selected.name,
          passcodeCategory: selected.category,
          _realUnitPrice: price, unitPrice: price,
          totalPrice: total,
          showBindDialog: false,
          newBindCodeName: ''
        })
        wx.showToast({ title: '绑定成功', icon: 'success' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.error || '绑定失败', icon: 'none' })
    }
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' })
  },

  goMine() {
    if (!app.globalData.openid || !app.globalData.nickname || !app.globalData.avatar) {
      wx.showToast({ title: '请先完善资料', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/mine/mine' })
  }
})
