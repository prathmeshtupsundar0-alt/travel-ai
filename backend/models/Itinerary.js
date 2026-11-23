const mongoose = require('mongoose')
const itinerarySchema = new mongoose.Schema({ trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, unique: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, summary: String, days: { type: Array, default: [] }, tips: { type: [String], default: [] } }, { timestamps: true })
module.exports = mongoose.model('Itinerary', itinerarySchema)
