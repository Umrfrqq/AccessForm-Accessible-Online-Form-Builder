const Response = require('../models/Response');
const Form = require('../models/Form');

// Submit a response to a form (PUBLIC - anyone can submit)
const submitResponse = async (req, res) => {
  try {
    const { form_id, answers, method = 'web' } = req.body;

    // Check if form exists and is active
    const form = await Form.findOne({ 
      _id: form_id, 
      status: 'active' 
    });

    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found or not active'
      });
    }

    // Create response
    const response = await Response.create({
      form_id,
      respondent_id: req.user ? req.user._id : null,
      answers,
      submission_method: method,
      ip_address: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Response submitted successfully',
      response_id: response._id
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error submitting response'
    });
  }
};

// Get responses for a form (PROTECTED - only creator/admin)
const getResponses = async (req, res) => {
  try {
    const form = await Form.findById(req.params.form_id);

    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && form.creator_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these responses'
      });
    }

    const responses = await Response.find({ form_id: req.params.form_id })
      .sort({ submitted_at: -1 })
      .populate('respondent_id', 'full_name email');

    res.json({
      success: true,
      count: responses.length,
      form_title: form.title,
      responses
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching responses'
    });
  }
};

module.exports = { submitResponse, getResponses };