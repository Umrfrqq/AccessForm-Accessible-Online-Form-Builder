const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
  form_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true
  },
  respondent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  answers: {
    type: Array,
    required: true
  },
  submission_method: {
    type: String,
    enum: ['web', 'voice', 'sms'],
    default: 'web'
  },
  ip_address: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  createdAt: 'submitted_at',
  updatedAt: false
});

module.exports = mongoose.model('Response', responseSchema);