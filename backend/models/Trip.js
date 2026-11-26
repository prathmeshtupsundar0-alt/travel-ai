const mongoose = require('mongoose')

const newId = () => new mongoose.Types.ObjectId().toString()

const activitySchema = new mongoose.Schema({
  id: { type: String, default: newId },
  time: { type: String, trim: true, maxlength: 30, default: '' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  estimatedCost: { type: Number, min: 0, default: 0 },
  category: { type: String, trim: true, maxlength: 60, default: 'Activities' },
  location: { type: String, trim: true, maxlength: 200, default: '' },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  durationMinutes: { type: Number, min: 0, default: 90 },
  isOutdoor: { type: Boolean, default: false },
}, { _id: false })

const itineraryDaySchema = new mongoose.Schema({
  day: { type: Number, required: true, min: 1 },
  title: { type: String, trim: true, default: '' },
  activities: { type: [activitySchema], default: [] },
  estimatedDayCost: { type: Number, min: 0, default: 0 },
}, { _id: false })

const packingItemSchema = new mongoose.Schema({
  id: { type: String, default: newId },
  item: { type: String, required: true, trim: true, maxlength: 150 },
  category: { type: String, trim: true, maxlength: 60, default: 'Essentials' },
  packed: { type: Boolean, default: false },
  isCustom: { type: Boolean, default: false },
}, { _id: false })

const reminderSchema = new mongoose.Schema({
  id: { type: String, default: newId },
  day: { type: Number, min: 1, default: 1 },
  date: { type: String, trim: true, maxlength: 20, default: '' },
  time: { type: String, trim: true, maxlength: 30, default: '' },
  timezone: { type: String, trim: true, maxlength: 80, default: 'Asia/Kolkata' },
  advanceMinutes: { type: Number, min: 0, max: 10080, default: 0 },
  advanceMode: { type: String, trim: true, maxlength: 20, default: '0' },
  scheduledAt: { type: Date, default: null },
  notifyAt: { type: Date, default: null },
  scheduledTimeDisplay: { type: String, trim: true, maxlength: 40, default: '' },
  notifyTimeDisplay: { type: String, trim: true, maxlength: 40, default: '' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  type: { type: String, trim: true, maxlength: 60, default: 'General' },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  enabled: { type: Boolean, default: true },
  completed: { type: Boolean, default: false },
  alarmSound: { type: Boolean, default: true },
  notifiedAt: { type: Date, default: null },
  notificationKey: { type: String, trim: true, maxlength: 200, default: '' },
  lastNotifiedKey: { type: String, trim: true, maxlength: 200, default: '' },
  acknowledgedAt: { type: Date, default: null },
  deliveryChannel: { type: String, trim: true, maxlength: 40, default: '' },
  scheduleUpdatedAt: { type: Date, default: Date.now },
}, { _id: false })

const notificationHistorySchema = new mongoose.Schema({
  id: { type: String, default: newId },
  reminderId: { type: String, required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  type: { type: String, trim: true, maxlength: 60, default: 'General' },
  day: { type: Number, min: 1, default: 1 },
  date: { type: String, trim: true, maxlength: 20, default: '' },
  scheduledTimeDisplay: { type: String, trim: true, maxlength: 40, default: '' },
  notifyTimeDisplay: { type: String, trim: true, maxlength: 40, default: '' },
  advanceMinutes: { type: Number, min: 0, default: 0 },
  timezone: { type: String, trim: true, maxlength: 80, default: 'Asia/Kolkata' },
  deliveredAt: { type: Date, default: Date.now },
  channel: { type: String, trim: true, maxlength: 40, default: 'browser_notification' },
  dismissedAt: { type: Date, default: null },
}, { _id: false })

const tripNoteSchema = new mongoose.Schema({
  id: { type: String, default: newId },
  day: { type: Number, min: 1, default: 1 },
  tag: { type: String, trim: true, maxlength: 60, default: 'Personal note' },
  title: { type: String, trim: true, maxlength: 200, default: '' },
  content: { type: String, required: true, trim: true, maxlength: 3000 },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false })

const localTipSchema = new mongoose.Schema({
  category: { type: String, trim: true, maxlength: 80, default: 'General' },
  title: { type: String, trim: true, maxlength: 200, default: '' },
  advice: { type: String, trim: true, maxlength: 1000, default: '' },
}, { _id: false })

const undoSnapshotSchema = new mongoose.Schema({
  label: { type: String, trim: true, maxlength: 200, default: 'Itinerary update' },
  createdAt: { type: Date, default: Date.now },
  days: { type: [itineraryDaySchema], default: [] },
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
  itineraryPreferences: {
    excludedActivities: { type: [String], default: [] },
    excludedCategories: { type: [String], default: [] },
    pace: { type: String, enum: ['Relaxed', 'Balanced', 'Packed'], default: 'Balanced' },
    customNotes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  budgetBreakdown: { transportation: Number, accommodation: Number, food: Number, activities: Number, localTransport: Number, shopping: { type: Number, default: 0 }, miscellaneous: Number, estimatedTotal: Number },
  weather: { type: mongoose.Schema.Types.Mixed, default: null },
  transport: { type: mongoose.Schema.Types.Mixed, default: null },
  packingChecklist: { type: [packingItemSchema], default: [] },
  reminders: { type: [reminderSchema], default: [] },
  reminderSettings: {
    alarmSoundEnabled: { type: Boolean, default: true },
    alarmTone: { type: String, enum: ['chime', 'pulse', 'urgent'], default: 'chime' },
    defaultAdvanceMinutes: { type: Number, min: 0, max: 10080, default: 0 },
    userTimezone: { type: String, trim: true, maxlength: 80, default: 'Asia/Kolkata' },
    tripTimezone: { type: String, trim: true, maxlength: 80, default: '' },
  },
  notificationHistory: { type: [notificationHistorySchema], default: [] },
  tripNotes: { type: [tripNoteSchema], default: [] },
  localTips: { type: [localTipSchema], default: [] },
  undoHistory: { type: [undoSnapshotSchema], default: [] },
}, { timestamps: true })

module.exports = mongoose.model('Trip', tripSchema)
