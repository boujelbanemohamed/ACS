const jwt = require('jsonwebtoken');

// JWT de session ; "tv" (token_version) permet de révoquer toutes les sessions d'un utilisateur
const signToken = (user) => jwt.sign(
  {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    bank_id: user.bank_id,
    must_change_password: user.must_change_password || false,
    tv: user.token_version || 0
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRE || '24h', algorithm: 'HS256' }
);

module.exports = { signToken };
