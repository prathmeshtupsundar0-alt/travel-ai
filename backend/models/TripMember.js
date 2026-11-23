const mongoose = require('mongoose')

const tripMemberSchema = new mongoose.Schema({
  trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['OWNER', 'EDITOR', 'VIEWER'], default: 'VIEWER' },
}, { timestamps: true })

tripMemberSchema.index({ trip: 1, user: 1 }, { unique: true })
module.exports = mongoose.model('TripMember', tripMemberSchema)
