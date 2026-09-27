const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  try {
    await client.connect();
    const db = client.db('accessform');
    const forms = db.collection('forms');

    let allForms = [];

    // Different access based on role
    if (decoded.role === 'admin') {
      // Admin sees ALL forms
      allForms = await forms.find({}).sort({ created_at: -1 }).toArray();
    } 
    else if (decoded.role === 'creator') {
      // Creator sees ONLY their own forms
      allForms = await forms.find({ creator_id: decoded.id }).sort({ created_at: -1 }).toArray();
    }
    else {
      // Respondent sees ONLY active forms
      allForms = await forms.find({ status: 'active' }).sort({ created_at: -1 }).toArray();
    }

    await client.close();

    res.status(200).json({
      success: true,
      forms: allForms,
      userRole: decoded.role
    });
  } catch (error) {
    console.error('Get forms error:', error);
    await client.close();
    res.status(500).json({ success: false, message: error.message });
  }
}