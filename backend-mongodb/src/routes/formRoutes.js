const express = require('express');
const router = express.Router();
const {
  createForm,
  getForms,
  getFormById,
  updateForm,
  deleteForm
} = require('../controllers/formController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All form routes require authentication
router.use(protect);

router.route('/')
  .post(authorize('creator', 'admin'), createForm)
  .get(getForms);

router.route('/:id')
  .get(getFormById)
  .put(authorize('creator', 'admin'), updateForm)
  .delete(authorize('creator', 'admin'), deleteForm);

module.exports = router;