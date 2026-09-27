const Form = require('../models/Form');
const Response = require('../models/Response');

// Create new form
const createForm = async (req, res) => {
  try {
    const { title, description, questions, status } = req.body;

    const form = await Form.create({
      title,
      description: description || '',
      creator_id: req.user._id,
      questions: questions || [],
      status: status || 'draft'
    });

    res.status(201).json({
      success: true,
      message: 'Form created successfully',
      form
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error creating form'
    });
  }
};

// Get all forms (for current user)
const getForms = async (req, res) => {
  try {
    let query = {};
    
    // If not admin, only show user's forms
    if (req.user.role !== 'admin') {
      query.creator_id = req.user._id;
    }

    const forms = await Form.find(query)
      .sort({ createdAt: -1 })
      .populate('creator_id', 'full_name email');

    // Get response counts for each form
    const formsWithCounts = await Promise.all(
      forms.map(async (form) => {
        const count = await Response.countDocuments({ form_id: form._id });
        return {
          ...form.toObject(),
          response_count: count
        };
      })
    );

    res.json({
      success: true,
      count: forms.length,
      forms: formsWithCounts
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching forms'
    });
  }
};

// Get single form by ID
const getFormById = async (req, res) => {
  try {
    const form = await Form.findById(req.params.id)
      .populate('creator_id', 'full_name email');

    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && form.creator_id._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this form'
      });
    }

    const responseCount = await Response.countDocuments({ form_id: form._id });

    res.json({
      success: true,
      form: {
        ...form.toObject(),
        response_count: responseCount
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching form'
    });
  }
};

// Update form
const updateForm = async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);

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
        message: 'Not authorized to update this form'
      });
    }

    const { title, description, questions, status } = req.body;
    
    form.title = title || form.title;
    form.description = description !== undefined ? description : form.description;
    form.questions = questions || form.questions;
    form.status = status || form.status;
    
    await form.save();

    res.json({
      success: true,
      message: 'Form updated successfully',
      form
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating form'
    });
  }
};

// Delete form
const deleteForm = async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);

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
        message: 'Not authorized to delete this form'
      });
    }

    // Delete all responses for this form too
    await Response.deleteMany({ form_id: form._id });
    await form.deleteOne();

    res.json({
      success: true,
      message: 'Form deleted successfully'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting form'
    });
  }
};

module.exports = {
  createForm,
  getForms,
  getFormById,
  updateForm,
  deleteForm
};