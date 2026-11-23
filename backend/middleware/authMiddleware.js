const jwt = require('jsonwebtoken')
const User = require('../models/User')
const asyncHandler = require('../utils/asyncHandler')

const protect = asyncHandler(async (req, res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  const token = req.cookies.travelai_token || bearer
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.sub)
    if (!user) return res.status(401).json({ success: false, message: 'Authentication required' })
    req.user = user
    next()
  } catch { return res.status(401).json({ success: false, message: 'Authentication required' }) }
})

module.exports = { protect }
