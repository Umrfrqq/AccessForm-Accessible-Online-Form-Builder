const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors());
app.use(express.json());

// =============================================
// DATABASE CONNECTION
// =============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/accessform';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully!'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// =============================================
// SCHEMAS & MODELS
// =============================================

const userSchema = new mongoose.Schema({
  full_name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'creator', 'respondent'], default: 'respondent' },
  phone_number: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});

const formSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  creator_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  creator_name: { type: String, default: '' },
  questions: { type: Array, default: [] },
  status: { type: String, enum: ['draft', 'active', 'closed'], default: 'draft' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const responseSchema = new mongoose.Schema({
  form_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true },
  respondent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  respondent_name: { type: String, default: 'Anonymous' },
  answers: { type: Array, required: true },
  submission_method: { type: String, enum: ['web', 'voice', 'sms'], default: 'web' },
  file_url: { type: String, default: '' },
  phone_number: { type: String, default: '' },
  submitted_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Form = mongoose.model('Form', formSchema);
const Response = mongoose.model('Response', responseSchema);

// =============================================
// RESET TOKENS STORAGE
// =============================================
const resetTokens = new Map();

// =============================================
// EMAIL TRANSPORTER (Nodemailer)
// =============================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// =============================================
// HELPER FUNCTIONS
// =============================================

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'my_super_secret_key_2025',
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'my_super_secret_key_2025');
  } catch {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = decoded;
  next();
}

// =============================================
// HEALTH CHECK
// =============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running!', timestamp: new Date().toISOString() });
});

// =============================================
// AUTH ROUTES
// =============================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { full_name, email, password, role, phone_number } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const user = new User({
      full_name,
      email,
      password_hash: hashedPassword,
      role: role || 'respondent',
      phone_number: phone_number || ''
    });
    
    await user.save();
    const token = generateToken(user);
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        phone_number: user.phone_number
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    const user = await User.findOne({ email, role });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const token = generateToken(user);
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        phone_number: user.phone_number
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// FORGOT PASSWORD
// =============================================
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ success: true, message: 'If your email is registered, you will receive a reset link.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 3600000;
    resetTokens.set(token, { userId: user._id, email: user.email, expiresAt: expiresAt });
    const resetLink = `http://localhost:5500/reset-password.html?token=${token}`;
    console.log(`🔐 Password reset link for ${email}: ${resetLink}`);
    res.json({ success: true, message: 'If your email is registered, you will receive a reset link.', resetLink: resetLink });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/auth/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }
    const tokenData = resetTokens.get(token);
    if (!tokenData) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(token);
      return res.status(400).json({ success: false, message: 'Token has expired' });
    }
    res.json({ success: true, message: 'Token is valid', email: tokenData.email });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const tokenData = resetTokens.get(token);
    if (!tokenData) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(token);
      return res.status(400).json({ success: false, message: 'Token has expired' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await User.updateOne({ _id: tokenData.userId }, { password_hash: hashedPassword });
    resetTokens.delete(token);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =============================================
// FORM ROUTES
// =============================================

// Get all forms (role-based)
app.get('/api/forms', authMiddleware, async (req, res) => {
  try {
    let forms;
    if (req.user.role === 'admin') {
      forms = await Form.find().sort({ created_at: -1 });
    } else if (req.user.role === 'creator') {
      forms = await Form.find({ creator_id: req.user.id }).sort({ created_at: -1 });
    } else {
      forms = await Form.find({ status: 'active' }).sort({ created_at: -1 });
    }
    res.json({ success: true, forms });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single form
app.get('/api/forms/:id', authMiddleware, async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    res.json({ success: true, form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create form
app.post('/api/forms', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'creator' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only creators can create forms' });
    }
    
    const { title, description, questions } = req.body;
    const user = await User.findById(req.user.id);
    
    const form = new Form({
      title: title || 'Untitled Form',
      description: description || '',
      creator_id: req.user.id,
      creator_name: user ? user.full_name : 'Unknown',
      questions: questions || [],
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date()
    });
    
    await form.save();
    res.json({ success: true, message: 'Form created successfully', form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// UPDATE FORM - ONLY DRAFT FORMS CAN BE EDITED
// =============================================
app.put('/api/forms/:id', authMiddleware, async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    
    // Only creator can edit their forms
    if (form.creator_id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the creator can edit this form' });
    }
    
    // CHECK: Only allow editing if form is DRAFT
    if (form.status !== 'draft') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot edit an active or closed form. Only draft forms can be edited.' 
      });
    }
    
    const { status, title, description, questions } = req.body;
    if (status) form.status = status;
    if (title) form.title = title;
    if (description !== undefined) form.description = description;
    if (questions) form.questions = questions;
    form.updated_at = new Date();
    await form.save();
    res.json({ success: true, message: 'Form updated successfully', form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete form
app.delete('/api/forms/:id', authMiddleware, async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    
    // Only creator can delete their forms
    if (form.creator_id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the creator can delete this form' });
    }
    
    // Only draft forms can be deleted
    if (form.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only draft forms can be deleted' });
    }
    
    await Form.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: 'Form deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// ADMIN ROUTES
// =============================================

app.get('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const users = await User.find({}, { password_hash: 0 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userToDelete.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete admin users' });
    }
    await User.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/forms', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const forms = await Form.find().sort({ created_at: -1 });
    res.json({ success: true, forms });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin: Close Form
app.put('/api/admin/forms/close/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        const form = await Form.findById(req.params.id);
        if (!form) {
            return res.status(404).json({ success: false, message: 'Form not found' });
        }
        if (form.status !== 'active') {
            return res.status(400).json({ 
                success: false, 
                message: 'Only active forms can be closed. Current status: ' + form.status 
            });
        }
        form.status = 'closed';
        form.updated_at = new Date();
        await form.save();
        res.json({ success: true, message: 'Form closed successfully' });
    } catch (error) {
        console.error('Close form error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/forms/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }
    await Response.deleteMany({ form_id: req.params.id });
    await Form.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: 'Form deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// RESPONSE ROUTES
// =============================================

app.post('/api/responses/submit', async (req, res) => {
  try {
    const { form_id, answers, submission_method, file_url, phone_number } = req.body;
    const form = await Form.findById(form_id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }

    let respondentName = 'Anonymous';
    let respondentId = null;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'my_super_secret_key_2025');
        const user = await User.findById(decoded.id);
        if (user) {
          respondentName = user.full_name;
          respondentId = user._id;
        }
      } catch (e) {
        console.log('Token verification failed:', e.message);
      }
    }

    const response = new Response({
      form_id,
      answers: answers || [],
      submission_method: submission_method || 'web',
      file_url: file_url || '',
      phone_number: phone_number || '',
      respondent_id: respondentId,
      respondent_name: respondentName,
      submitted_at: new Date()
    });

    await response.save();
    
    console.log('✅ Response saved:', response._id, 'Respondent:', respondentName);
    
    res.status(200).json({ 
      success: true, 
      message: 'Response submitted successfully', 
      responseId: response._id 
    });
    
  } catch (error) {
    console.error('❌ Submit response error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/responses/form/:form_id', authMiddleware, async (req, res) => {
  try {
    const form = await Form.findById(req.params.form_id);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    if (req.user.role !== 'admin' && form.creator_id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const responses = await Response.find({ form_id: req.params.form_id }).sort({ submitted_at: -1 });
    res.json({ success: true, responses, count: responses.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// ✅ FIXED: Get user responses with UNIQUE form IDs only
// =============================================
app.get('/api/responses/user', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const responses = await Response.find({ respondent_id: userId })
            .populate('form_id', 'title')
            .sort({ submitted_at: -1 });
        
        // Get unique form IDs to count unique submissions
        const uniqueFormIds = new Set();
        const formattedResponses = [];
        
        responses.forEach(r => {
            const formId = r.form_id ? r.form_id._id.toString() : null;
            // Only add if we haven't seen this form ID before
            if (formId && !uniqueFormIds.has(formId)) {
                uniqueFormIds.add(formId);
                formattedResponses.push({
                    id: r._id,
                    form_id: r.form_id ? r.form_id._id : null,
                    formTitle: r.form_id ? r.form_id.title : 'Unknown Form',
                    submittedAt: r.submitted_at,
                    answers: r.answers,
                    submissionMethod: r.submission_method,
                    phoneNumber: r.phone_number
                });
            }
        });
        
        console.log('📋 Total responses:', responses.length);
        console.log('📋 Unique forms submitted:', uniqueFormIds.size);
        console.log('📋 Unique form IDs:', Array.from(uniqueFormIds));
        
        res.json({ 
            success: true, 
            responses: formattedResponses,
            totalResponses: responses.length,
            uniqueForms: uniqueFormIds.size
        });
    } catch (error) {
        console.error('Get user responses error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// SMS ENDPOINT
// =============================================

app.post('/api/send-sms', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    if (!phoneNumber || !message) {
      return res.status(400).json({ success: false, error: 'Phone number and message are required.' });
    }
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      console.error('Twilio credentials missing in .env');
      return res.status(500).json({ success: false, error: 'SMS service not configured.' });
    }
    const client = twilio(accountSid, authToken);
    const twilioResponse = await client.messages.create({
      body: message,
      from: fromNumber,
      to: phoneNumber
    });
    console.log(`✅ SMS sent! SID: ${twilioResponse.sid}`);
    return res.status(200).json({ success: true, message: 'SMS sent successfully!', sid: twilioResponse.sid });
  } catch (error) {
    console.error('Twilio error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// START SERVER
// =============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API available at http://localhost:${PORT}/api`);
  console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
  console.log(`✅ MongoDB ${mongoose.connection.readyState === 1 ? 'Connected' : 'Not Connected'}`);
});