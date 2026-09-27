const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  // Only creators and admins can create forms
  if (decoded.role !== 'creator' && decoded.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to create forms' });
  }

  try {
    const { title, description, questions } = req.body;

    await client.connect();
    const db = client.db('accessform');
    const forms = db.collection('forms');

    const result = await forms.insertOne({
      title: title || 'Untitled Form',
      description: description || '',
      creator_id: decoded.id,
      creator_name: decoded.full_name || 'Unknown',
      questions: questions || [],
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date()
    });

    await client.close();

    res.status(201).json({
      success: true,
      message: 'Form created successfully',
      formId: result.insertedId
    });
  } catch (error) {
    await client.close();
    res.status(500).json({ success: false, message: error.message });
  }
}