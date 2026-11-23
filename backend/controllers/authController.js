const { z } = require('zod')
const User = require('../models/User')
const Profile = require('../models/Profile')
const generateToken = require('../utils/generateToken')
const asyncHandler = require('../utils/asyncHandler')

const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(8).max(72) })
const loginSchema = z.object({ email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(8).max(72) })
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' }
const safeUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt })

const register = asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body)
  if (await User.exists({ email: input.email })) return res.status(409).json({ success: false, message: 'Email already exists' })
  const user = await User.create(input)
  try { await Profile.create({ user: user._id }) } catch (error) { await User.findByIdAndDelete(user._id); throw error }
  const token = generateToken(user._id.toString())
  res.cookie('travelai_token', token, cookieOptions)
  return res.status(201).json({ success: true, user: safeUser(user), token })
})

const login = asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body)
  const user = await User.findOne({ email: input.email }).select('+password')
  if (!user || !(await user.comparePassword(input.password))) return res.status(401).json({ success: false, message: 'Invalid email or password' })
  const token = generateToken(user._id.toString())
  res.cookie('travelai_token', token, cookieOptions)
  return res.json({ success: true, user: safeUser(user), token })
})

const logout = (req, res) => { res.clearCookie('travelai_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }); return res.json({ success: true, message: 'Logged out' }) }
const me = asyncHandler(async (req, res) => res.json({ success: true, user: safeUser(req.user) }))
module.exports = { register, login, logout, me }
