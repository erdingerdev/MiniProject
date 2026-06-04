# 部署状态

## 已完成

- [x] API 路由已集成到 Next.js 项目 (`AIProject/src/app/api/`)
- [x] 已构建并部署到服务器 (`erdinger.top`)
- [x] 域名占位符已替换为 `erdinger.top`

## 架构

```
手机微信客户端
    │
    ▼ (HTTPS)
erdinger.top (OpenResty, 443端口)
    │
    ▼ proxy_pass http://127.0.0.1:3000
Next.js Docker 容器 (site-web)
    ├── /              → 个人主页
    ├── /api/health    → 健康检查
    ├── /api/user      → 用户信息
    └── /api/login     → 微信登录
```

无需额外进程，无需改 Nginx。

## 部署命令备忘

```bash
# 本地构建 + 打包
cd AIProject && npm run build
tar -czf /tmp/site-prebuilt.tar.gz .next/standalone .next/static public Dockerfile.prebuilt

# 上传到服务器
scp /tmp/site-prebuilt.tar.gz root@47.121.176.85:/root/site-prebuilt.tar.gz

# 服务器上部署
ssh root@47.121.176.85
cd /root/site
tar -xzf /root/site-prebuilt.tar.gz
docker-compose up -d --build
```

## 微信小程序配置 (待你注册后)

1. 去 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册小程序，拿到 AppID 和 AppSecret
2. 在小程序后台 → 开发管理 → 开发设置 → **服务器域名**：
   - `request合法域名` 填写: `https://erdinger.top`
3. 把 AppID 填入 `miniprogram/project.config.json` 的 `appid` 字段
4. 把 AppID 和 AppSecret 填入 WX_APPID 和 WX_SECRET 环境变量（目前先用占位符也能跑）
5. 用微信开发者工具打开 `miniprogram/` 目录即可预览
