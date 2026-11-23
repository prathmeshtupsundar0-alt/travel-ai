const router = require('express').Router()
const controller = require('../controllers/tripController')
const { protect } = require('../middleware/authMiddleware')
router.use(protect)
router.route('/').get(controller.listTrips).post(controller.createTrip)
router.route('/:id').get(controller.getTrip).put(controller.updateTrip).delete(controller.deleteTrip)
module.exports = router
