const router = require('express').Router()
const controller = require('../controllers/tripController')
const { protect } = require('../middleware/authMiddleware')

router.use(protect)

router.route('/').get(controller.listTrips).post(controller.createTrip)
router.route('/:id').get(controller.getTrip).put(controller.updateTrip).delete(controller.deleteTrip)

// Editable Itinerary Activity & Day Operations
router.post('/:id/itinerary/activities', controller.addActivity)
router.put('/:id/itinerary/activities/:activityId', controller.updateActivity)
router.delete('/:id/itinerary/activities/:activityId', controller.deleteActivity)
router.post('/:id/itinerary/activities/:activityId/move', controller.moveActivity)
router.post('/:id/itinerary/days/:dayNumber/reorder', controller.reorderActivities)
router.post('/:id/itinerary/undo', controller.undoItineraryChange)
router.put('/:id/preferences', controller.updatePreferences)

// Smart Packing Checklist Operations
router.post('/:id/packing/generate', controller.generatePackingList)
router.post('/:id/packing', controller.addPackingItem)
router.put('/:id/packing/:itemId', controller.updatePackingItem)
router.delete('/:id/packing/:itemId', controller.deletePackingItem)

// Important Travel Reminders & Alarm Notification Operations
router.get('/:id/reminders/check', controller.checkDueReminders)
router.post('/:id/reminders', controller.addReminder)
router.put('/:id/reminders/:reminderId', controller.updateReminder)
router.delete('/:id/reminders/:reminderId', controller.deleteReminder)
router.post('/:id/reminders/:reminderId/trigger', controller.triggerReminderNotification)
router.post('/:id/reminders/:reminderId/dismiss', controller.dismissReminderAlarm)
router.put('/:id/reminder-settings', controller.updateReminderSettings)
router.delete('/:id/notification-history', controller.clearNotificationHistory)

// Trip Notes & Journal Operations
router.post('/:id/notes', controller.addTripNote)
router.put('/:id/notes/:noteId', controller.updateTripNote)
router.delete('/:id/notes/:noteId', controller.deleteTripNote)

module.exports = router
