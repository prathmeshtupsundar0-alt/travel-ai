const mongoose = require('mongoose')

const profileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  avatar: { type: String, trim: true, default: null },
  bio: { type: String, trim: true, maxlength: 500, default: null },
  phone: { type: String, trim: true, maxlength: 30, default: null },
  preferredTravelStyle: { type: [String], default: [] },
  preferredBudget: { type: Number, min: 0, default: null },
}, { timestamps: true })

module.exports = mongoose.model('Profile', profileSchema)
