const asyncHandler = require('../utils/asyncHandler')
const { getWeather } = require('../services/weather.service')
const { getRoute } = require('../services/maps.service')
const { findEditable, enrichAndPersistTrip } = require('./tripController')

const weather = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.tripId, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })
  const data = await getWeather(trip.destination)
  trip.weather = data
  trip.markModified('weather')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, weather: data, trip: updatedTrip })
})

const route = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.tripId, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })
  const data = await getRoute(trip.startLocation, trip.destination)
  trip.transport = data
  trip.markModified('transport')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, route: data, trip: updatedTrip })
})

module.exports = { weather, route }
