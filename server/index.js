const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// ========== 配置区 ==========
// 小程序 AppID 和 AppSecret (从 mp.weixin.qq.com -> 开发管理 -> 开发设置 获取)
const WX_APPID = process.env.WX_APPID || 'your-appid'
const WX_SECRET = process.env.WX_SECRET || 'your-secret'

// 个人主页数据 (暂时写死，后续可以接数据库)
const homepageData = {
  name: 'Guozhen Chen',
  avatar: 'https://your-domain.com/avatar.jpg',
  bio: '全栈开发者 / 终身学习者',
  email: 'chenguozhen@example.com',
  location: '中国',
  website: 'https://your-domain.com',
  joinDate: '2024-01-01',
  posts: 12,
  stars: 48,
  followers: 36
}

// ========== 路由 ==========

// 微信登录
app.post('/api/login', async (req, res) => {
  const { code } = req.body

  if (!code) {
    return res.status(400).json({ error: '缺少 code' })
  }

  try {
    const response = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: WX_APPID,
        secret: WX_SECRET,
        js_code: code,
        grant_type: 'authorization_code'
      }
    })

    const { openid, session_key, errcode, errmsg } = response.data

    if (errcode) {
      return res.status(400).json({ error: errmsg })
    }

    // 生产环境应使用 JWT 签发 token，这里简化处理
    const token = Buffer.from(`${openid}:${session_key}`).toString('base64')

    res.json({ token, openid })
  } catch (err) {
    console.error('登录失败:', err.message)
    res.status(500).json({ error: '登录失败' })
  }
})

// 获取用户主页信息
app.get('/api/user', (req, res) => {
  res.json(homepageData)
})

// 获取主页数据 (更语义化的别名)
app.get('/api/homepage', (req, res) => {
  res.json(homepageData)
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// ========== 启动 ==========
app.listen(PORT, () => {
  console.log(`小程序 API 服务运行在 http://localhost:${PORT}`)
  console.log(`健康检查: http://localhost:${PORT}/api/health`)
})
