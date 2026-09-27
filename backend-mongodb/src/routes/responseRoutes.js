const express = require('express');
const router = express.Router();
const { submitResponse, getResponses } = require('../controllers/responseController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public - anyone can submit a response
router.post('/submit', submitResponse);

// Protected - only creators/admins can view responses
router.get('/form/:form_id', protect, authorize('creator', 'admin'), getResponses);

module.exports = router;