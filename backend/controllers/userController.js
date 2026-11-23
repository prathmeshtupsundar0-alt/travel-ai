const asyncHandler = require('../utils/asyncHandler')
const { z } = require('zod')
const User = require('../models/User')
const getProfile = asyncHandler(async (req, res) => res.json({ success: true, user: { id: req.user._id, name: req.user.name, email: req.user.email, createdAt: req.user.createdAt } }))
const lookupUser = asyncHandler(async (req, res) => { const { email } = z.object({ email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()) }).parse(req.query); const user = await User.findOne({ email }).select('name email'); if (!user) return res.status(404).json({ success: false, message: 'No registered user found with this email.' }); return res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } }) })
module.exports = { getProfile, lookupUser }
