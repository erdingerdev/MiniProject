const BASE = 'https://erdinger.top/api'

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + path,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(res.data)
        }
      },
      fail(err) {
        wx.showToast({ title: '网络异常', icon: 'none' })
        reject(err)
      }
    })
  })
}

module.exports = {
  // 微信登录
  wxLogin(code) {
    return request('POST', '/login', { code })
  },

  // ===== 游泳票 =====
  bindPasscode(codeName, openid, nickname, avatar) {
    return request('POST', '/swim/bind', { codeName, openid, nickname, avatar })
  },
  getCredentials() {
    return request('GET', '/swim/credentials')
  },
  confirmPayment(openid, passcodeId, passcodeName, peopleCount) {
    return request('POST', '/swim/confirm', { openid, passcodeId, passcodeName, peopleCount })
  },
  getBindStatus(openid) {
    return request('GET', `/swim/status?openid=${openid}`)
  },
  getUserPasscodeStatus(openid) {
    return request('GET', `/user/status?openid=${openid}`)
  },
  updateProfile(openid, nickname, avatar) {
    return request('POST', '/user/profile', { openid, nickname, avatar })
  },

  // ===== 管理端 =====
  verifyAdmin(password) {
    return request('POST', '/admin/verify', { password })
  },
  getAdminConfig() {
    return request('GET', '/admin/config')
  },
  updateAdminConfig(data) {
    return request('POST', '/admin/config', data)
  },
  updateAdminPassword(newPassword) {
    return request('POST', '/admin/config', { action: 'updateAdminPassword', newPassword })
  },
  listPasscodes() {
    return request('GET', '/admin/passcodes')
  },
  createPasscode(data) {
    return request('POST', '/admin/passcodes', data)
  },
  deletePasscode(id) {
    return request('DELETE', `/admin/passcodes?id=${id}`)
  },
  getPasscodeDetail(id) {
    return request('GET', `/admin/passcodes?id=${id}`)
  },
  listUsers() {
    return request('GET', '/admin/users')
  },
  getLogs() {
    return request('GET', '/admin/logs')
  },
  getLeaderboard() {
    return request('GET', '/leaderboard')
  },

  // ===== 打卡/统计 =====
  getUserStats(openid) {
    return request('GET', `/user/stats?openid=${openid}`)
  },
  manualCheckin(openid) {
    return request('POST', '/user/checkin', { openid })
  },
  uploadAvatar(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: BASE + '/admin/upload-avatar',
        filePath,
        name: 'file',
        timeout: 30000,
        success(res) {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(res)
            return
          }
          try {
            resolve(JSON.parse(res.data))
          } catch (e) {
            reject(res)
          }
        },
        fail(err) {
          reject(err)
        }
      })
    })
  },
  uploadQR(formData) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: BASE + '/admin/upload-qr',
        filePath: formData.filePath,
        name: 'file',
        success(res) {
          try {
            resolve(JSON.parse(res.data))
          } catch (e) {
            reject(res)
          }
        },
        fail(err) {
          reject(err)
        }
      })
    })
  }
}
