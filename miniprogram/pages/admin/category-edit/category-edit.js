const api = require('../../../utils/api')

Page({
  data: {
    isAdd: true,
    oldName: '',
    theme: 'dark',
    categoryName: '',
    username: '',
    password: '',
    unitPrice: '22.98'
  },

  onLoad(options) {
    const theme = wx.getStorageSync('theme') || 'dark'
    if (this.data.theme !== theme) this.setData({ theme })
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#080b11' : '#442E9A'
    })
    const cat = decodeURIComponent(options.category || '')
    if (cat) {
      this.setData({
        isAdd: false,
        oldName: cat,
        categoryName: cat,
        username: decodeURIComponent(options.username || ''),
        password: decodeURIComponent(options.password || ''),
        unitPrice: decodeURIComponent(options.unitPrice || '22.98')
      })
      wx.setNavigationBarTitle({ title: '编辑分类' })
    } else {
      wx.setNavigationBarTitle({ title: '新增分类' })
    }
  },

  onNameInput(e) { this.setData({ categoryName: e.detail.value }) },
  onUserInput(e) { this.setData({ username: e.detail.value }) },
  onPwdInput(e) { this.setData({ password: e.detail.value }) },
  onPriceInput(e) { this.setData({ unitPrice: e.detail.value }) },

  _getCategories() {
    const pages = getCurrentPages()
    const prev = pages[pages.length - 2]
    return (prev && prev.data.categories) || []
  },

  async doSave() {
    const name = this.data.categoryName.trim()
    if (!name) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' })
      return
    }

    const categories = this._getCategories()

    if (this.data.isAdd) {
      if (categories.includes(name)) {
        wx.showToast({ title: '分类名已存在', icon: 'none' })
        return
      }
      wx.showLoading({ title: '保存中...' })
      try {
        await api.saveCategoriesCB([...categories, name])
        await api.setCategoryCredentialsCB(name, this.data.username, this.data.password)
        await api.setCategoryUnitPriceCB(name, parseFloat(this.data.unitPrice) || 22.98)
        wx.hideLoading()
        wx.showToast({ title: '已创建', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      } catch {
        wx.hideLoading()
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    } else {
      const oldName = this.data.oldName
      if (name !== oldName && categories.includes(name)) {
        wx.showToast({ title: '分类名已存在', icon: 'none' })
        return
      }
      wx.showLoading({ title: '保存中...' })
      try {
        const newCats = categories.map(c => c === oldName ? name : c)
        await api.saveCategoriesCB(newCats)
        await api.setCategoryCredentialsCB(name, this.data.username, this.data.password)
        await api.setCategoryUnitPriceCB(name, parseFloat(this.data.unitPrice) || 22.98)
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      } catch {
        wx.hideLoading()
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }
  },

  async doDelete() {
    const res = await wx.showModal({
      title: '确认删除',
      content: `删除分类「${this.data.oldName}」？`,
      confirmColor: '#ef4444'
    })
    if (!res.confirm) return

    const categories = this._getCategories()
    const newCats = categories.filter(c => c !== this.data.oldName)

    wx.showLoading({ title: '删除中...' })
    try {
      await api.saveCategoriesCB(newCats)
      wx.hideLoading()
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  }
})
