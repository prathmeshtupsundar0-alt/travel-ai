const jwt = require('jsonwebtoken')

module.exports = function generateToken(userId) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters long.')
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
}
