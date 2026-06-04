const api = require('../../utils/api')

Page({
  data: {
    list: []
  },

  async onShow() {
    try {
      const list = await api.getLeaderboard()
      this.setData({ list })
    } catch {}
  }
})
