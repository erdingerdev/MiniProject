const app = getApp()
const api = require('../../../utils/api-carpool')

Page({
  data: {
    theme: 'dark',
    statusBarHeight: 0,
    navBarHeight: 0,

    type: 'driver',  // driver | passenger
    stations: [],
    countOptions: [1, 2, 3],

    // 表单
    origin: '',
    originIndex: -1,
    destination: '',
    destIndex: -1,
    departTime: '',
    peopleCount: 1,
    contact: '',
    note: '',

    // 时间选择器
    hours: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
    minutes: Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')),
    timeHourIndex: 8,
    timeMinuteIndex: 0,

    submitting: false,
    hasExisting: false
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync()
    const theme = wx.getStorageSync('theme') || 'dark'
    const type = options.type || 'driver'
    const countOptions = [1, 2, 3]
    this.setData({
      theme,
      statusBarHeight: sys.statusBarHeight,
      navBarHeight: sys.statusBarHeight + 44,
      type,
      countOptions
    })
    this.loadStations()
    this.checkExisting()
  },

  async loadStations() {
    try {
      const res = await api.getStations()
      this.setData({ stations: res.stations || [] })
    } catch {}
  },

  async checkExisting() {
    try {
      const res = await api.getMyRoute()
      if (res.route && res.route.status !== 'rejected') {
        this.setData({ hasExisting: true })
      }
    } catch {}
  },

  // 切换发布类型
  switchType(e) {
    const type = e.currentTarget.dataset.type
    const countOptions = [1, 2, 3]
    this.setData({ type, countOptions, peopleCount: 1 })
  },

  // 表单输入
  onOriginChange(e) { this.setData({ originIndex: e.detail.value }) },
  onDestChange(e) { this.setData({ destIndex: e.detail.value }) },
  onCountChange(e) { this.setData({ peopleCount: Number(e.currentTarget.dataset.value) || 1 }) },
  onContactInput(e) { this.setData({ contact: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  // ── 时间选择器 ──
  onTimeChange(e) {
    const [h, m] = e.detail.value
    this.setData({ timeHourIndex: h, timeMinuteIndex: m, departTime: this.data.hours[h] + ':' + this.data.minutes[m] })
  },
  onTimeColumnChange(e) {
    const { column, value } = e.detail
    if (column === 0) this.setData({ timeHourIndex: value })
    else this.setData({ timeMinuteIndex: value })
  },

  // ── 提交 ──
  async submit() {
    const { type, stations, originIndex, destIndex, departTime, peopleCount, contact, note } = this.data
    if (originIndex < 0 || destIndex < 0) return wx.showToast({ title: '请选择起终点', icon: 'none' })
    if (originIndex === destIndex) return wx.showToast({ title: '起终点不能相同', icon: 'none' })
    if (!departTime) return wx.showToast({ title: '请选择出发时间', icon: 'none' })
    if (!contact.trim()) return wx.showToast({ title: '请填写联系方式', icon: 'none' })

    if (this.data.submitting) return
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })
    try {
      const res = await api.publishRoute({
        type,
        nickname: app.globalData.nickname || '',
        avatar: app.globalData.avatar || '',
        origin: stations[originIndex].name,
        destination: stations[destIndex].name,
        departTime,
        peopleCount,
        contact: contact.trim(),
        note: note.trim()
      })
      wx.hideLoading()
      if (res.ok) {
        wx.showToast({ title: '发布成功，等待审核', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1200)
      } else {
        wx.showToast({ title: res.error || '发布失败', icon: 'none' })
      }
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
    this.setData({ submitting: false })
  },

  goBack() {
    wx.navigateBack()
  },

  noop() {}
})
