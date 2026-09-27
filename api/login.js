<<<<<<< HEAD
export default function handler(req, res) {
  // Enable CORS
=======
module.exports = (req, res) => {
>>>>>>> a07abeb38f1c0279ff6183cf393f1b5f9d16d870
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.status(200).json({
    success: true,
    message: 'API is working!',
    method: req.method,
    timestamp: new Date().toISOString()
  });
<<<<<<< HEAD
}
=======
};
>>>>>>> a07abeb38f1c0279ff6183cf393f1b5f9d16d870
