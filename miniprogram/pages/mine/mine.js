const app = getApp()
const api = require('../../utils/api')

const MILESTONES = [
  { count: 1,  emoji: '🌊', text: '第一次下水，水花四溅的瞬间' },
  { count: 2,  emoji: '🤔', text: '第二次了，看来不是一时兴起' },
  { count: 3,  emoji: '🔥', text: '三顾泳池，有点意思了' },
  { count: 5,  emoji: '💪', text: '第五次打卡，渐入佳境' },
  { count: 10, emoji: '🏅', text: '十次了，泳池新晋老面孔' },
  { count: 15, emoji: '🧬', text: '十五次，已经形成肌肉记忆了' },
  { count: 20, emoji: '🏄', text: '二十次，两袖清风，一身湿透' },
  { count: 30, emoji: '🎯', text: '三十而立……不，三十而游' },
  { count: 50, emoji: '🏊', text: '五十次！国哥都要叫你一声师傅' },
  { count: 80, emoji: '👑', text: '八十次，泳池就是你家客厅' },
  { count: 100, emoji: '🐉', text: '百次入水，浪里白条，水中小白龙' },
]

const COLD_KNOWLEDGE = [
  '游泳一小时消耗的热量 ≈ 两碗半米饭，游完可以理直气壮加餐',
  '水的密度是空气的 800 倍，在水中运动阻力是陆上的 12 倍',
  '自由泳是速度最快的泳姿，蝶泳是消耗热量最高的泳姿',
  '泳池的氯气味其实是氯和汗液反应产生的，不是氯本身的味道',
  '鲨鱼皮泳衣在 2009 年被国际泳联禁止，因为破纪录太容易了',
  '人体在水中散热速度是空气中的 25 倍，所以泳后容易饿',
  '蛙泳是最古老的泳姿，古希腊时期就有了',
  '奥运会标准泳池长 50 米，水温必须保持 25-28°C',
  '游泳是所有运动中关节损伤率最低的运动之一',
  '声音在水里的传播速度比空气中快约 4 倍',
  '菲尔普斯一天训练消耗约 8000-10000 千卡，顶普通人一周饭量',
  '游泳是少数同时锻炼心肺和全身肌肉的运动，运动效果非常全面',
  '经常游泳的人肺活量平均比不运动的人高 30%',
  '泳池看起来是蓝的不是因为水蓝，是池底和池壁的颜色',
  '人体脂肪密度比水小，体脂率高的人浮力更好',
  '高强度间歇游泳产生的后燃效应，运动后仍持续消耗热量',
  '蝶泳诞生于 1933 年，是四种泳姿中最年轻的一种',
  '仰泳是唯一面部朝上的泳姿，也是最省力的自救泳姿',
  '世界第一个室内公共泳池建于 1828 年的英国利物浦',
  '游泳一公里消耗的热量 ≈ 陆地跑四公里',
  '六个月内的婴儿入水会自动闭气和划水，是天生的游泳反射',
  '现存最古老的游泳壁画在埃及撒哈拉沙漠，距今约 7000 年',
  '人在水中体重只有陆上的十分之一，关节几乎不受冲击',
  '自由泳约 70% 的推进力来自手臂划水，30% 来自打腿',
  '游泳时心跳比安静状态快 50%-70%，长期坚持能降低静息心率',
  '硅胶泳帽不只为减少阻力，主要是保护头发不被氯水损伤',
  '蛙泳腿部动作产生的推进力占 60% 以上，手臂只占 40%',
  '冷水游泳能激活棕色脂肪，持续帮助身体消耗额外热量',
  '游泳能改善胰岛素敏感性，对控制血糖有帮助',
  '经常游泳的人静息心率比普通人低 10-15 次/分，心脏泵血效率更高',
]

Page({
  data: {
    year: 0,
    month: 0,
    days: [],
    nextDays: [],
    todayChecked: false,
    makeupLoading: false,
    checkinDates: [],
    totalCount: 0,
    monthlyCount: 0,
    maxStreak: 0,
    touchStartX: 0,
    animating: false,
    animDir: '',
    titleEmoji: '',
    titleText: '',
    // popup
    showPopup: false,
    popupType: '',     // 'milestone' | 'knowledge' | 'checked'
    popupEmoji: '',
    popupTitle: '',
    popupText: '',
  },

  onShow() {
    if (!this.data.year) {
      const now = new Date()
      this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 })
    }
    this.loadStats()
  },

  async loadStats() {
    const openid = app.globalData.openid
    if (!openid) return
    try {
      const stats = await api.getUserStats(openid)
      const checkinDates = stats.checkinDates || []
      const today = new Date()
      const todayStr = today.toISOString().slice(0, 10)
      const todayChecked = checkinDates.includes(todayStr)

      const title = this.computeTitle(stats.timestamps || [], checkinDates, stats.totalCount || 0)
      const summary = this.getOneLineSummary(stats.totalCount || 0, stats.maxStreak || 0, checkinDates, stats.timestamps || [])

      this.setData({
        checkinDates,
        totalCount: stats.totalCount || 0,
        maxStreak: stats.maxStreak || 0,
        todayChecked,
        titleEmoji: title.emoji,
        titleText: title.text,
      })
      this.buildDays()
      this.checkPopup(stats.totalCount || 0, todayChecked, summary)
    } catch {}
  },

  computeTitle(timestamps, checkinDates, totalCount) {
    if (!timestamps.length) return { emoji: '🌱', text: '初来乍到' }

    const now = new Date()
    const dayOfWeek = now.getDay()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek)
    weekStart.setHours(0, 0, 0, 0)
    const weekStartTime = weekStart.getTime()

    let thisWeekCount = 0
    for (const ts of timestamps) {
      if (new Date(ts).getTime() >= weekStartTime) thisWeekCount++
    }

    if (thisWeekCount >= 3) return { emoji: '🔥', text: '一周三练' }
    if (thisWeekCount >= 1) return { emoji: '👌', text: '劳逸结合' }

    let morningCount = 0, nightCount = 0, afternoonCount = 0
    for (const ts of timestamps) {
      const hour = new Date(ts).getHours()
      if (hour < 10) morningCount++
      else if (hour >= 20) nightCount++
      else if (hour >= 12 && hour < 16) afternoonCount++
    }
    const n = timestamps.length
    if (morningCount / n > 0.5) return { emoji: '🌅', text: '早起冠军' }
    if (nightCount / n > 0.5) return { emoji: '🌙', text: '深夜潜水艇' }
    if (afternoonCount / n > 0.5) return { emoji: '☀️', text: '午后畅游' }

    let weekdayCount = 0, weekendCount = 0
    for (const d of checkinDates) {
      const day = new Date(d).getDay()
      if (day === 0 || day === 6) weekendCount++
      else weekdayCount++
    }
    if (checkinDates.length > 0) {
      if (weekendCount / checkinDates.length > 0.6) return { emoji: '🎉', text: '周末战神' }
      if (weekdayCount / checkinDates.length > 0.6) return { emoji: '💼', text: '工作日战士' }
    }

    if (totalCount <= 4) return { emoji: '🌱', text: '初来乍到' }
    if (totalCount <= 14) return { emoji: '🏖️', text: '泳池常客' }
    if (totalCount <= 29) return { emoji: '🏊', text: '水中老手' }
    return { emoji: '🐉', text: '浪里白条' }
  },

  getOneLineSummary(totalCount, maxStreak, checkinDates, timestamps) {
    const pool = [
      '今天又游了一次，比自己想象中更自律',
      '泳池里的每一米，都算数',
      '游完泳的那种通透感，是其他运动给不了的',
      '大汗淋漓之后，水能接住你所有的疲惫',
      '游泳一小时消耗的热量 ≈ 两碗半米饭，放心加餐',
      '每次入水，都是一次和自己的对话',
      '水下的世界很安静，只有你和你的呼吸',
      '游泳是唯一在失重状态下完成的运动',
      '泳池不会辜负你的每一次训练',
      '游完泳的饥饿感，是身体在说谢谢',
      '最难的永远是下水前的那一瞬间，下水后就简单了',
      '每一次触壁转身，都是一次小小的胜利',
      '水花四溅的那一刻，所有烦恼都留在岸上了',
      '坚持游泳的人，身上有一种特别的韧劲',
      '游泳教会你的不只是技术，还有独处的耐心',
      '今天的泳池，因为你而更热闹了一点',
      '游完之后那种筋疲力尽又心满意足的感觉，太爽了',
      '水的阻力是你最好的教练，它从不撒谎',
      '每一次呼吸换气，都是在和自己的身体对话',
      '泳道里的节奏感，是生活中最踏实的节拍',
      '不管今天游了多少，下水的你已经赢了',
      '运动带来的愉悦感，可以持续一整天',
      '出汗的感觉，说明身体还在认真地活着',
      '累的时候来游一游，水会帮你化解一切',
      '今天你和水之间的默契，又加深了一点点',
      '会游泳的人，身上都带着一股从容',
      '在水里的时间，是最纯粹属于自己的时间',
    ]

    return pool[Math.floor(Math.random() * pool.length)]
  },

  // ── Popup (milestone > knowledge > checked-in, once per day) ──

  checkPopup(totalCount, todayChecked, summary) {
    const today = new Date().toISOString().slice(0, 10)
    const lastPopupDate = wx.getStorageSync('popup_date')
    if (lastPopupDate === today) return

    // 1. milestone
    const shown = wx.getStorageSync('milestones_shown') || []
    for (let i = MILESTONES.length - 1; i >= 0; i--) {
      const m = MILESTONES[i]
      if (totalCount >= m.count && !shown.includes(m.count)) {
        shown.push(m.count)
        wx.setStorageSync('milestones_shown', shown)
        wx.setStorageSync('popup_date', today)
        this.setData({
          showPopup: true,
          popupType: 'milestone',
          popupEmoji: m.emoji,
          popupTitle: String(m.count),
          popupText: m.text,
        })
        return
      }
    }

    if (!todayChecked) return

    // 2. cold knowledge (20%)
    if (Math.random() < 0.2) {
      const idx = Math.floor(Math.random() * COLD_KNOWLEDGE.length)
      wx.setStorageSync('popup_date', today)
      this.setData({
        showPopup: true,
        popupType: 'knowledge',
        popupEmoji: '💡',
        popupTitle: '游泳冷知识',
        popupText: COLD_KNOWLEDGE[idx],
      })
      setTimeout(() => this.setData({ showPopup: false }), 3000)
      return
    }

    // 3. checked-in popup with dynamic summary
    wx.setStorageSync('popup_date', today)
    this.setData({
      showPopup: true,
      popupType: 'checked',
      popupEmoji: '✅',
      popupTitle: '今日已打卡',
      popupText: summary || '今天又游了一次，比自己想象中更自律',
    })
    setTimeout(() => this.setData({ showPopup: false }), 3000)
  },

  closePopup() {
    this.setData({ showPopup: false })
  },

  // ── Calendar ──

  computeDays(year, month) {
    const { checkinDates } = this.data
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    const firstDay = new Date(year, month - 1, 1).getDay()
    const daysInMonth = new Date(year, month, 0).getDate()
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate()

    const days = []
    const checkSet = new Set(checkinDates)

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i
      const m = String(prevMonth).padStart(2, '0')
      const d = String(day).padStart(2, '0')
      const dateStr = `${prevYear}-${m}-${d}`
      days.push({ day, isCurrentMonth: false, isToday: dateStr === todayStr, checked: checkSet.has(dateStr) })
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const m = String(month).padStart(2, '0')
      const d = String(day).padStart(2, '0')
      const dateStr = `${year}-${m}-${d}`
      days.push({ day, isCurrentMonth: true, isToday: dateStr === todayStr, checked: checkSet.has(dateStr) })
    }

    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    let nextDay = 1
    while (days.length < 42) {
      const m = String(nextMonth).padStart(2, '0')
      const d = String(nextDay).padStart(2, '0')
      const dateStr = `${nextYear}-${m}-${d}`
      days.push({ day: nextDay, isCurrentMonth: false, isToday: dateStr === todayStr, checked: checkSet.has(dateStr) })
      nextDay++
    }

    return days
  },

  buildDays() {
    const { year, month, checkinDates } = this.data
    const key = `${year}-${String(month).padStart(2, '0')}`
    this.setData({
      days: this.computeDays(year, month),
      monthlyCount: checkinDates.filter(d => d.startsWith(key)).length
    })
  },

  prevMonth() { this.animateAndShift(-1) },
  nextMonth() { this.animateAndShift(1) },

  shiftMonth(delta) {
    let { year, month } = this.data
    month += delta
    if (month < 1) { month = 12; year-- }
    if (month > 12) { month = 1; year++ }
    this.setData({ year, month })
    this.buildDays()
  },

  animateAndShift(delta) {
    let newYear = this.data.year
    let newMonth = this.data.month + delta
    if (newMonth < 1) { newMonth = 12; newYear-- }
    if (newMonth > 12) { newMonth = 1; newYear++ }

    const nextDays = this.computeDays(newYear, newMonth)
    const dir = delta > 0 ? 'left' : 'right'
    const key = `${newYear}-${String(newMonth).padStart(2, '0')}`
    const monthlyCount = this.data.checkinDates.filter(d => d.startsWith(key)).length

    this.setData({ animating: true, animDir: dir, nextDays })

    setTimeout(() => {
      this.setData({ year: newYear, month: newMonth, days: nextDays, monthlyCount, nextDays: [], animating: false, animDir: '' })
    }, 300)
  },

  onTouchStart(e) {
    this.setData({ touchStartX: e.touches[0].clientX })
  },

  onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - this.data.touchStartX
    if (Math.abs(dx) > 50) {
      this.animateAndShift(dx > 0 ? -1 : 1)
    }
  },

  async doMakeup() {
    const openid = app.globalData.openid
    if (!openid) return
    this.setData({ makeupLoading: true })
    try {
      await api.manualCheckin(openid)
      wx.showToast({ title: '打卡成功', icon: 'success' })
      await this.loadStats()
    } catch (e) {
      wx.showToast({ title: e.data?.error || '打卡失败', icon: 'none' })
    } finally {
      this.setData({ makeupLoading: false })
    }
  }
})
