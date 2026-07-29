const app = getApp()
const api = require('../../../utils/api-carpool')

Page({
  data: {
    theme: 'dark',
    statusBarHeight: 0,
    navBarHeight: 0,

    // 我的路线
    myRoute: null,
    myInteractions: [],    // 别人对我的互动（toMe）
    myJoinList: [],        // 我发起的互动（fromMe - 查看联系方式用）

    // 列表
    routes: [],
    page: 1,
    loading: false,
    noMore: false,

    // 提醒审核
    reviewReminded: false,

    // 已互动的路线 ID 集合
    interactedRouteIds: [],

    // 弹窗
    showDetail: false,
    detailRoute: null,
    showContact: false,
    contactText: '',
    inviteSent: false,
    cancelRouteId: ''
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    const theme = wx.getStorageSync('theme') || 'dark'
    this.setData({
      theme,
      statusBarHeight: sys.statusBarHeight,
      navBarHeight: sys.statusBarHeight + 44
    })
  },

  async onShow() {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    await this.loadAll()
  },

  async loadAll() {
    wx.showLoading({ title: '加载中...' })
    try {
      const [myRes, listRes, intRes] = await Promise.all([
        api.getMyRoute(),
        api.getRoutes(1),
        api.getInteractions()
      ])
      const interactedIds = (intRes.fromMe || []).map(i => i.routeId)
      // 标记所有互动为已读
      const unreadIds = (myRes.interactions || []).filter(i => !i.read).map(i => i._id)
      if (unreadIds.length > 0) api.markRead(unreadIds).catch(() => {})

      // 从数据库读取是否已提醒
      const route = myRes.route
      const reviewReminded = route ? !!route.reminded : false

      this.setData({
        myRoute: route,
        myInteractions: myRes.interactions || [],
        interactedRouteIds: interactedIds,
        interactionsFromMe: intRes.fromMe || [],
        reviewReminded,
        routes: listRes.routes || [],
        page: 1,
        noMore: (listRes.routes || []).length < 20
      })
    } catch (e) {
      console.error('loadAll error:', e)
    }
    wx.hideLoading()
  },

  // 加载更多
  async loadMore() {
    if (this.data.loading || this.data.noMore) return
    this.setData({ loading: true })
    const page = this.data.page + 1
    try {
      const res = await api.getRoutes(page)
      const routes = this.data.routes.concat(res.routes || [])
      this.setData({ routes, page, loading: false, noMore: (res.routes || []).length < 20 })
    } catch {
      this.setData({ loading: false })
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.loadAll()
    wx.stopPullDownRefresh()
  },

  // ── 弹窗详情 ──
  showRouteDetail(e) {
    const route = e.currentTarget.dataset.route
    // 已互动过 → 直接展示联系方式
    const alreadyInteracted = this.data.interactedRouteIds.indexOf(route._id) >= 0
    if (alreadyInteracted) {
      const intItem = (this.data.interactionsFromMe || []).find(i => i.routeId === route._id)
      if (intItem && intItem.type === 'invite') {
        this.setData({ showDetail: true, detailRoute: route, showContact: true, inviteSent: true })
      } else {
        this.setData({ showDetail: true, detailRoute: route, showContact: true, contactText: intItem ? intItem.routeContact : '' })
      }
    } else {
      this.setData({ showDetail: true, detailRoute: route, showContact: false, contactText: '', inviteSent: false })
    }
  },
  closeDetail() {
    this.setData({ showDetail: false })
  },

  // ── 我想加入 / 我想邀请 ──
  async doInteract() {
    const route = this.data.detailRoute
    if (!route) return
    wx.showLoading({ title: '处理中...' })
    try {
      const res = await api.interact(route._id, app.globalData.nickname || '')
      wx.hideLoading()
      if (res.ok) {
        const ids = this.data.interactedRouteIds
        if (ids.indexOf(route._id) < 0) ids.push(route._id)
        if (res.type === 'invite') {
          this.setData({ showContact: true, contactText: '', inviteSent: true, interactedRouteIds: ids })
        } else {
          this.setData({ showContact: true, contactText: res.contact, interactedRouteIds: ids })
        }
      } else {
        wx.showToast({ title: res.error || '操作失败', icon: 'none' })
      }
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  copyContact() {
    wx.setClipboardData({ data: this.data.contactText })
  },

  // 取消加入/邀请
  cancelJoin() {
    const rid = this.data.detailRoute ? this.data.detailRoute._id : this.data.cancelRouteId
    if (!rid) return
    const title = this.data.inviteSent ? '取消邀请' : '取消加入'
    const content = this.data.inviteSent ? '' : '取消后将无法查看对方联系方式'
    const opts = { title }
    if (content) opts.content = content
    wx.showModal({
      ...opts,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '取消中...' })
        try {
          await api.cancelInteract(rid)
          wx.hideLoading()
          const ids = this.data.interactedRouteIds.filter(id => id !== rid)
          this.setData({ showDetail: false, showContact: false, contactText: '', inviteSent: false, interactedRouteIds: ids, cancelRouteId: '' })
          this.loadAll()
        } catch {
          wx.hideLoading()
          wx.showToast({ title: '取消失败', icon: 'none' })
        }
      }
    })
  },

  // 取消邀请
  cancelInvite() {
    const route = this.data.detailRoute
    if (!route) return
    wx.showModal({
      title: '取消邀请',
      content: '取消后对方将看不到你的信息',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '取消中...' })
        try {
          await api.cancelInteract(route._id)
          wx.hideLoading()
          // 从已互动列表中移除
          const ids = this.data.interactedRouteIds.filter(id => id !== route._id)
          this.setData({ showDetail: false, showContact: false, inviteSent: false, interactedRouteIds: ids })
        } catch {
          wx.hideLoading()
          wx.showToast({ title: '取消失败', icon: 'none' })
        }
      }
    })
  },

  // ── 取消加入/邀请 ──
  async cancelInteract(e) {
    const routeId = e.currentTarget.dataset.rid
    wx.showLoading({ title: '取消中...' })
    try {
      await api.cancelInteract(routeId)
      wx.hideLoading()
      await this.loadAll()
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '取消失败', icon: 'none' })
    }
  },

  // ── 踢出乘客 ──
  kickPassenger(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认移除',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '移除中...' })
        try {
          await api.kickPassenger(id)
          wx.hideLoading()
          await this.loadAll()
        } catch {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // ── 删除我的帖子 ──
  async deleteMyRoute() {
    wx.showModal({
      title: '确认删除',
      content: '删除后所有互动记录将被清除',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        try {
          await api.deleteRoute()
          wx.hideLoading()
          this.setData({ myRoute: null, myInteractions: [] })
          await this.loadAll()
        } catch {
          wx.hideLoading()
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  // ── 发布 ──
  showPublishSheet() {
    this.setData({ showPublishSheet: true })
  },
  closePublishSheet() {
    this.setData({ showPublishSheet: false })
  },
  goPublish() {
    wx.navigateTo({ url: '/pages/carpool/publish/publish?type=driver' })
  },

  // ── 查看路线owner联系方式（仅我发起的互动） ──
  showRouteContact(e) {
    const item = e.currentTarget.dataset.item
    const contact = item.interactorContact || item.routeContact || ''
    this.setData({ showDetail: true, detailRoute: null, showContact: true, contactText: contact, inviteSent: false, cancelRouteId: item.routeId || '' })
  },

  // ── 提醒审核 ──
  async remindReview() {
    const route = this.data.myRoute
    if (!route) return
    wx.showLoading({ title: '发送中...' })
    try {
      await wx.cloud.callFunction({
        name: 'carpoolNotifyReview',
        data: {
          routeId: route._id,
          nickname: route.nickname,
          type: route.type,
          origin: route.origin,
          destination: route.destination,
          departTime: route.departTime,
          peopleCount: route.peopleCount,
          note: route.note || ''
        }
      })
      wx.hideLoading()
      this.setData({ reviewReminded: true })
      wx.showToast({ title: '已提醒', icon: 'success' })
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '发送失败', icon: 'none' })
    }
  },

  goBack() {
    wx.navigateBack()
  },

  noop() {}
})
