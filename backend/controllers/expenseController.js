const mongoose = require('mongoose')
const { z } = require('zod')
const Expense = require('../models/Expense')
const { findAccessible, findEditable } = require('./tripController')
const asyncHandler = require('../utils/asyncHandler')

const schema = z.object({
  category: z.enum(['Transportation', 'Accommodation', 'Food', 'Activities', 'Local Transport', 'Shopping', 'Miscellaneous']),
  title: z.string().trim().min(1).max(150),
  amount: z.coerce.number().positive(),
  date: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
})

const list = asyncHandler(async (req, res) => {
  if (!(await findAccessible(req.params.tripId, req.user._id))) {
    return res.status(404).json({ success: false, message: 'Trip not found' })
  }
  res.json({ success: true, expenses: await Expense.find({ trip: req.params.tripId }).sort({ date: -1 }) })
})

const create = asyncHandler(async (req, res) => {
  const { error } = await findEditable(req.params.tripId, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })
  const expense = await Expense.create({ ...schema.parse(req.body), trip: req.params.tripId, user: req.user._id })
  res.status(201).json({ success: true, expense })
})

const update = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.expenseId)) {
    return res.status(404).json({ success: false, message: 'Expense not found' })
  }
  const expense = await Expense.findById(req.params.expenseId)
  if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' })
  const { error } = await findEditable(expense.trip, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })
  const rawPatch = schema.partial().parse(req.body)
  const patch = Object.fromEntries(Object.entries(rawPatch).filter(([, v]) => v !== undefined))
  Object.assign(expense, patch)
  await expense.save()
  res.json({ success: true, expense })
})

const remove = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.expenseId)) {
    return res.status(404).json({ success: false, message: 'Expense not found' })
  }
  const expense = await Expense.findById(req.params.expenseId)
  if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' })
  const { error } = await findEditable(expense.trip, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })
  await expense.deleteOne()
  res.json({ success: true, message: 'Expense deleted' })
})

module.exports = { list, create, update, remove }
