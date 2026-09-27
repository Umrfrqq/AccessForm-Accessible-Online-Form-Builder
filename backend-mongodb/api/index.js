const app = require('../src/app');

module.exports = async (req, res) => {
    await app(req, res);
};