const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const DAILY_LIMIT = 3
const MAX_IMAGES = 18
// 敏感词兜底：msgSecCheck 对孤立敏感词可能漏检，这里做关键词拦截
const BLOCKED_WORDS = ['性交', '做爱', '裸体', '裸聊', '色情', '淫秽', '嫖娼', '卖淫', '强奸', '约炮', '一夜情', '援交', '自慰', '口交', '肛交', '黄片', '毛片', '迷奸', '色诱', '开房']

exports.main = async (event) => {
  const { title, content, images, nickname, avatar } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { ok: false, error: '未登录' }

  const titleText = (title || '').trim()
  const contentText = (content || '').trim()
  if (!titleText) return { ok: false, error: '请填写标题' }
  if (!contentText) return { ok: false, error: '请写点路线内容' }

  const imgList = (Array.isArray(images) ? images : [])
    .filter(i => typeof i === 'string' && i.startsWith('cloud://'))
  if (imgList.length > MAX_IMAGES) return { ok: false, error: '图片最多 18 张' }

  // 频控：每日 3 条（集合不存在等异常时视为 0 次，不阻塞发布）
  let publishCount = 0
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const countRes = await db.collection('hiking_publish_logs')
      .where({ openid, createdAt: _.gte(today.getTime()) })
      .count()
    publishCount = countRes.total || 0
  } catch (e) {
    publishCount = 0
  }
  if (publishCount >= DAILY_LIMIT) return { ok: false, error: '今日发布次数已用完，明天再来吧' }

  // 文本安全检测
  const textCheck = await checkText(titleText + '\n' + contentText, openid)
  if (!textCheck.passed) return { ok: false, error: textCheck.error }

  const now = Date.now()
  const route = {
    openid,
    nickname: nickname || '',
    avatar: avatar || '',
    title: titleText,
    content: contentText,
    images: imgList,
    cover: imgList[0] || '',
    status: imgList.length > 0 ? 'pending' : 'approved',
    createdAt: now,
    commentCount: 0
  }
  const res = await db.collection('hiking_routes').add({ data: route })
  const routeId = res._id
  await db.collection('hiking_publish_logs').add({ data: { openid, createdAt: now } })

  // 图片异步检测(mediaCheckAsync 提交，不阻塞发布，结果由消息推送回调下架)
  for (let i = 0; i < imgList.length; i++) {
    await submitImageCheck(imgList[i], routeId, i, openid)
  }

  return { ok: true, routeId }
}

// 文本检测：risky 拦截；接口异常不兜底，返回检测失败让发布方明确感知
async function checkText(content, openid) {
  // 敏感词黑名单兜底
  if (BLOCKED_WORDS.some(w => content.includes(w))) {
    return { passed: false, error: '内容含违规信息，请修改后重试' }
  }
  let res
  try {
    res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid,
      scene: 3,
      content
    })
  } catch (e) {
    console.error('msgSecCheck error:', e)
    return { passed: false, error: '内容安全检测失败，请稍后重试' }
  }
  if (!res || (res.errCode && res.errCode !== 0)) {
    console.error('msgSecCheck bad resp:', res && res.errCode, res && res.errMsg)
    return { passed: false, error: '内容安全检测失败，请稍后重试' }
  }
  const suggest = res.result && res.result.suggest
  const label = res.result && res.result.label
  if (!suggest) return { passed: false, error: '内容安全检测失败，请稍后重试' }
  // 无人工审核：risky 和 review 都拦截；label 非 100/0 也拦截
  if (suggest === 'risky' || suggest === 'review') return { passed: false, error: '内容含违规信息，请修改后重试' }
  if (label !== undefined && label !== 100 && label !== 0) return { passed: false, error: '内容含违规信息，请修改后重试' }
  return { passed: true }
}

// 图片异步检测：提交 mediaCheckAsync，存 trace_id 关联帖子，结果由消息推送回调处理
async function submitImageCheck(fileID, routeId, imageIndex, openid) {
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
    const mediaUrl = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL
    if (!mediaUrl) {
      await recordCheckError(routeId, imageIndex, 'getTempFileURL 失败')
      return
    }
    let checkRes
    try {
      checkRes = await cloud.openapi.security.mediaCheckAsync({
        media_url: mediaUrl,
        media_type: 2,
        version: 2,
        scene: 3,
        openid
      })
    } catch (e) {
      await recordCheckError(routeId, imageIndex, 'mediaCheckAsync异常: ' + (e.errCode || e.errMsg || e.message || JSON.stringify(e)))
      return
    }
    const traceId = checkRes && (checkRes.traceId || checkRes.trace_id || (checkRes.result && (checkRes.result.traceId || checkRes.result.trace_id)))
    if (!traceId) {
      await recordCheckError(routeId, imageIndex, '无traceId: ' + JSON.stringify(checkRes))
      return
    }
    await db.collection('hiking_media_checks').add({
      data: {
        trace_id: traceId,
        routeId,
        imageIndex,
        status: 'pending',
        createdAt: Date.now()
      }
    })
  } catch (e) {
    await recordCheckError(routeId, imageIndex, '外层异常: ' + (e.message || JSON.stringify(e)))
  }
}

async function recordCheckError(routeId, imageIndex, error) {
  try {
    await db.collection('hiking_media_checks').add({
      data: { routeId, imageIndex, status: 'error', error, createdAt: Date.now() }
    })
  } catch (e) {
    console.error('recordCheckError:', e)
  }
}
