const jwt = require('jsonwebtoken')
const User = require('../models/User')
const asyncHandler = require('../utils/asyncHandler')

const protect = asyncHandler(async (req, res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null
  const cookieToken = req.cookies?.travelai_token || null
  const candidates = [bearer, cookieToken].filter(Boolean)
  if (candidates.length === 0) {
    return res.status(401).json({ success: false, message: 'Authentication required' })
  }

  for (const token of candidates) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(decoded.sub)
      if (user) {
        req.user = user
        return next()
      }
    } catch {
      // Try next token candidate if available
    }
  }

  return res.status(401).json({ success: false, message: 'Authentication required' })
})

module.exports = { protect }
