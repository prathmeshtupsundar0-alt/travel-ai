function notFound(req, res) { return res.status(404).json({ success: false, message: 'Route not found' }) }

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  if (error?.name === 'ZodError') return res.status(400).json({ success: false, message: 'Validation failed', errors: error.flatten() })
  if (error?.code === 11000) return res.status(409).json({ success: false, message: 'A record with that value already exists' })
  if (error?.name === 'ValidationError' || error?.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid request data' })
  console.error(error)
  return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Internal server error' })
}

module.exports = { notFound, errorHandler }
