const { z } = require('zod')
const Trip = require('../models/Trip')
const User = require('../models/User')
const TripMember = require('../models/TripMember')
const Expense = require('../models/Expense')
const asyncHandler = require('../utils/asyncHandler')
const { calculateBudget } = require('../utils/budgetCalculator')
const tripSchema = z.object({ destination: z.string().trim().min(2).max(200), startLocation: z.string().trim().min(2).max(200), days: z.coerce.number().int().min(1).max(30), travelers: z.coerce.number().int().min(1).max(20), budget: z.coerce.number().finite().nonnegative(), preference: z.enum(['Adventure', 'Relaxation', 'Family', 'Couple', 'Luxury', 'Budget', 'Nature', 'Culture', 'Food', 'Mixed']), travelDates: z.object({ start: z.coerce.date().optional(), end: z.coerce.date().optional() }).optional(), partnerEmails: z.array(z.string().trim().email().max(254)).max(50).optional().default([]) })
const findOwned = (id, user) => Trip.findOne({ _id: id, user })
const findAccessible = async (id, user) => {
  const membership = await TripMember.findOne({ trip: id, user }).select('role')
  if (!membership) {
    const ownedTrip = await findOwned(id, user)
    if (!ownedTrip) return null
    await TripMember.updateOne({ trip: ownedTrip._id, user }, { $set: { role: 'OWNER' } }, { upsert: true })
    return { trip: await Trip.findById(id).populate('user', 'name email'), role: 'OWNER' }
  }
  const trip = await Trip.findById(id).populate('user', 'name email')
  return trip ? { trip, role: membership.role } : null
}
const listTrips = asyncHandler(async (req, res) => {
  const ownedTrips = await Trip.find({ user: req.user._id }).select('_id')
  if (ownedTrips.length) await TripMember.bulkWrite(ownedTrips.map((trip) => ({ updateOne: { filter: { trip: trip._id, user: req.user._id }, update: { $set: { role: 'OWNER' } }, upsert: true } })))
  const memberships = await TripMember.find({ user: req.user._id }).sort({ createdAt: -1 }).populate('trip')
  const trips = memberships.filter(({ trip }) => trip).map(({ trip, role }) => ({ ...trip.toObject(), membershipRole: role }))
  res.json({ success: true, trips })
})
const createTrip = asyncHandler(async (req, res) => {
  const data = tripSchema.parse(req.body)
  const partnerEmails = [...new Set(data.partnerEmails.map((email) => email.toLowerCase()))].filter((email) => email !== req.user.email.toLowerCase())
  const users = partnerEmails.length ? await User.find({ email: { $in: partnerEmails } }).select('name email') : []
  const foundByEmail = new Map(users.map((user) => [user.email, user]))
  const missingEmails = partnerEmails.filter((email) => !foundByEmail.has(email))
  if (missingEmails.length) return res.status(400).json({ success: false, message: `No registered user found with: ${missingEmails.join(', ')}` })
  const { partnerEmails: ignoredPartnerEmails, ...tripData } = data
  const partners = partnerEmails.map((email) => { const user = foundByEmail.get(email); return { user: user._id, name: user.name, email: user.email } })
  const trip = await Trip.create({ ...tripData, user: req.user._id, partners, budgetBreakdown: calculateBudget(data) })
  // Persist the owner and every registered partner. The compound index makes retries safe.
  await TripMember.bulkWrite([
    { updateOne: { filter: { trip: trip._id, user: req.user._id }, update: { $set: { role: 'OWNER' } }, upsert: true } },
    ...partners.map((partner) => ({ updateOne: { filter: { trip: trip._id, user: partner.user }, update: { $set: { role: 'VIEWER' } }, upsert: true } })),
  ])
  res.status(201).json({ success: true, trip })
})
const getTrip = asyncHandler(async (req, res) => {
  const access = await findAccessible(req.params.id, req.user._id)
  if (!access) return res.status(404).json({ success: false, message: 'Trip not found' })
  const expenses = await Expense.find({ trip: access.trip._id }).sort({ date: -1 })
  res.json({ success: true, trip: { ...access.trip.toObject(), membershipRole: access.role }, expenses })
})
const updateTrip = asyncHandler(async (req, res) => { const trip = await findOwned(req.params.id, req.user._id); if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' }); const data = tripSchema.partial().parse(req.body); Object.assign(trip, data); if (Object.keys(data).some((key) => ['days', 'travelers', 'budget', 'destination', 'startLocation'].includes(key))) trip.budgetBreakdown = calculateBudget(trip); await trip.save(); res.json({ success: true, trip }) })
const deleteTrip = asyncHandler(async (req, res) => { const trip = await findOwned(req.params.id, req.user._id); if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' }); await Expense.deleteMany({ trip: trip._id }); await TripMember.deleteMany({ trip: trip._id }); await trip.deleteOne(); res.json({ success: true, message: 'Trip deleted' }) })
module.exports = { listTrips, createTrip, getTrip, updateTrip, deleteTrip, findOwned, findAccessible }
