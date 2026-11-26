const router = require('express').Router()
const { protect } = require('../middleware/authMiddleware')
const { generate, suggestAlternatives, optimizeBudget, localTips } = require('../controllers/aiController')

router.post('/generate-itinerary', protect, generate)
router.post('/activity-alternatives', protect, suggestAlternatives)
router.post('/budget-optimization', protect, optimizeBudget)
router.post('/local-tips', protect, localTips)

module.exports = router
