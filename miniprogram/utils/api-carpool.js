const app = getApp()

function call(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({ name, data: { ...data, openid: app.globalData.openid } })
      .then(res => resolve(res.result))
      .catch(reject)
  })
}

// 站点
export function getStations() { return call('carpoolGetStations') }

// 路线
export function publishRoute(data) { return call('carpoolPublishRoute', data) }
export function getRoutes(page = 1) { return call('carpoolGetRoutes', { page }) }
export function getMyRoute() { return call('carpoolGetMyRoute') }
export function deleteRoute() { return call('carpoolDeleteRoute') }

// 互动
export function interact(routeId, nickname) { return call('carpoolInteract', { routeId, nickname }) }
export function cancelInteract(routeId) { return call('carpoolCancelInteract', { routeId }) }
export function kickPassenger(interactionId) { return call('carpoolKickPassenger', { interactionId }) }
export function getInteractions() { return call('carpoolGetInteractions') }
export function markRead(interactionIds) { return call('carpoolMarkRead', { interactionIds }) }

// 管理员
export function adminGetRoutes(status = 'pending', page = 1) { return call('carpoolAdminGetRoutes', { status, page }) }
export function adminReview(routeId, action, reason) { return call('carpoolAdminReview', { routeId, action, reason }) }
export function adminStations(action, data) { return call('carpoolAdminStations', { action, ...data }) }
