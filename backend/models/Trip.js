const mongoose = require('mongoose')

const activitySchema = new mongoose.Schema({ time: { type: String, trim: true, maxlength: 30, default: '' }, title: { type: String, required: true, trim: true, maxlength: 200 }, description: { type: String, trim: true, maxlength: 1000, default: '' }, estimatedCost: { type: Number, min: 0, default: 0 } }, { _id: false })

const itineraryDaySchema = new mongoose.Schema({
  day: { type: Number, required: true, min: 1 },
  title: { type: String, trim: true, default: '' },
  activities: { type: [activitySchema], default: [] },
  estimatedDayCost: { type: Number, min: 0, default: 0 },
}, { _id: false })

const tripSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  partners: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, name: { type: String, required: true, trim: true }, email: { type: String, required: true, trim: true, lowercase: true } }],
  destination: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
  startLocation: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
  days: { type: Number, required: true, min: 1, max: 30 }, travelers: { type: Number, required: true, min: 1, max: 20 }, budget: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR'], default: 'INR' }, preference: { type: String, required: true, trim: true },
  travelDates: { start: Date, end: Date }, status: { type: String, enum: ['planning', 'ready'], default: 'planning' },
  itinerary: { summary: { type: String, default: '' }, days: { type: [itineraryDaySchema], default: [] }, tips: { type: [String], default: [] }, generatedAt: Date },
  budgetBreakdown: { transportation: Number, accommodation: Number, food: Number, activities: Number, localTransport: Number, miscellaneous: Number, estimatedTotal: Number }, weather: { type: mongoose.Schema.Types.Mixed, default: null }, transport: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true })

module.exports = mongoose.model('Trip', tripSchema)
