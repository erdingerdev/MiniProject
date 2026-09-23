'use strict'

/**
 * wxDraftPush —— 通过 CloudBase 固定公网出口 IP 调微信公众号“保存草稿”接口。
 *
 * 入参(event):
 * {
 *   appid: string,          // 公众号 AppID
 *   secret: string,         // 公众号 AppSecret
 *   articles: [             // 1 ~ 8 篇
 *     {
 *       title: string,
 *       author: string,
 *       digest: string,
 *       content: string,          // HTML，可含本地图片占位 src（配合 images 上传替换）
 *       content_source_url: string,
 *       need_open_comment: number,
 *       only_fans_can_comment: number,
 *       thumb_media_id: string,   // 可选；为空时用 thumb 上传
 *       thumb: { filename, contentType, data(base64) },
 *       images: { "images/xxx.png": { filename, contentType, data(base64) } }
 *     }
 *   ]
 * }
 *
 * 返回: { ok: true, media_id, article_count } 或 { ok: false, error }
 */
const https = require('https')
const { URL } = require('url')

const WECHAT_BASE = 'https://api.weixin.qq.com'

let tokenCache = { appid: '', token: '', expiresAt: 0 }

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET'
    const headers = options.headers || {}
    const body = options.body || null
    const timeout = options.timeout || 30000

    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers: body ? { 'Content-Length': Buffer.byteLength(body), ...headers } : headers,
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data
          try {
            data = JSON.parse(text)
          } catch (err) {
            data = { _raw: text.slice(0, 500) }
          }
          resolve({ status: res.statusCode || 0, data })
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(timeout, () => req.destroy(new Error('微信接口请求超时')))
    if (body) req.write(body)
    req.end()
  })
}

function buildMultipart(fields, files) {
  const boundary = '----wxDraftPush' + Date.now().toString(16) + Math.random().toString(16).slice(2)
  const chunks = []
  const encoder = new TextEncoder()
  const push = (text) => chunks.push(encoder.encode(text))

  for (const [key, value] of Object.entries(fields || {})) {
    push(`--${boundary}\r\n`)
    push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`)
    push(`${value}\r\n`)
  }
  for (const [key, file] of Object.entries(files || {})) {
    push(`--${boundary}\r\n`)
    push(`Content-Disposition: form-data; name="${key}"; filename="${String(file.filename || 'file')}"\r\n`)
    push(`Content-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`)
    chunks.push(Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || '', 'base64'))
    push('\r\n')
  }
  push(`--${boundary}--\r\n`)

  return { boundary, body: Buffer.concat(chunks) }
}

function decodeImage(file) {
  if (!file || !file.data) return null
  return {
    filename: String(file.filename || 'image'),
    contentType: String(file.contentType || 'image/jpeg'),
    data: Buffer.from(String(file.data), 'base64'),
  }
}

async function getAccessToken(appid, secret) {
  const now = Date.now()
  if (tokenCache.appid === appid && tokenCache.token && tokenCache.expiresAt > now + 120000) {
    return tokenCache.token
  }
  const url =
    `${WECHAT_BASE}/cgi-bin/token?grant_type=client_credential` +
    `&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
  const res = await requestJson(url)
  const data = res.data || {}
  if (!data.access_token) {
    throw new Error(`获取 access_token 失败: ${JSON.stringify(data)}`)
  }
  tokenCache = {
    appid,
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 7200) * 1000,
  }
  return tokenCache.token
}

async function uploadContentImage(token, file) {
  const url = `${WECHAT_BASE}/cgi-bin/media/uploadimg?access_token=${encodeURIComponent(token)}`
  const { boundary, body } = buildMultipart({}, { media: file })
  const res = await requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
    timeout: 60000,
  })
  const data = res.data || {}
  if (!data.url) {
    throw new Error(`上传正文图片失败: ${JSON.stringify(data)}`)
  }
  return data.url
}

async function uploadThumb(token, file) {
  const url =
    `${WECHAT_BASE}/cgi-bin/material/add_material` +
    `?access_token=${encodeURIComponent(token)}&type=image`
  const { boundary, body } = buildMultipart({}, { media: file })
  const res = await requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
    timeout: 60000,
  })
  const data = res.data || {}
  if (!data.media_id) {
    throw new Error(`上传封面素材失败: ${JSON.stringify(data)}`)
  }
  return data.media_id
}

async function addDraft(token, articles) {
  const url = `${WECHAT_BASE}/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`
  const res = await requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ articles }),
    timeout: 60000,
  })
  const data = res.data || {}
  if (!data.media_id) {
    throw new Error(`新增草稿失败: ${JSON.stringify(data)}`)
  }
  return data.media_id
}

exports.main = async (event) => {
  try {
    const appid = String((event && event.appid) || '').trim()
    const secret = String((event && event.secret) || '').trim()
    const articles = Array.isArray(event && event.articles) ? event.articles : []

    if (!appid || !secret) return { ok: false, error: '缺少 appid 或 secret' }
    if (articles.length < 1 || articles.length > 8) {
      return { ok: false, error: 'articles 数量必须在 1-8 之间' }
    }

    const token = await getAccessToken(appid, secret)
    const prepared = []

    for (const item of articles) {
      let content = String(item.content || '')
      const images = item.images || {}

      for (const [src, rawFile] of Object.entries(images)) {
        const file = decodeImage(rawFile)
        if (!file) continue
        const cdnUrl = await uploadContentImage(token, file)
        content = content.split(src).join(cdnUrl)
      }

      let thumbMediaId = String(item.thumb_media_id || '').trim()
      if (!thumbMediaId) {
        const thumb = decodeImage(item.thumb)
        if (!thumb) throw new Error('文章缺少封面图片 thumb 或 thumb_media_id')
        thumbMediaId = await uploadThumb(token, thumb)
      }

      if (!String(item.title || '').trim()) throw new Error('文章缺少 title')
      if (content.length > 20000) throw new Error(`正文字符数超过 2 万: ${content.length}`)

      prepared.push({
        article_type: 'news',
        title: String(item.title),
        author: String(item.author || ''),
        digest: String(item.digest || ''),
        content,
        content_source_url: String(item.content_source_url || ''),
        thumb_media_id: thumbMediaId,
        need_open_comment: Number(item.need_open_comment || 0),
        only_fans_can_comment: Number(item.only_fans_can_comment || 0),
      })
    }

    const mediaId = await addDraft(token, prepared)
    return { ok: true, media_id: mediaId, article_count: prepared.length }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
}
