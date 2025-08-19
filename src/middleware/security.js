const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('../utils/logger');

// Rate limiting untuk API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Rate limiting untuk room creation (lebih ketat)
const roomCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 room creations per hour
  message: {
    error: 'Too many rooms created from this IP, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Room creation rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many rooms created from this IP, please try again later.',
      retryAfter: '1 hour'
    });
  }
});

// Socket rate limiting
const socketEventLimiter = new Map();

function checkSocketRateLimit(socket, eventType, maxEvents = 50, windowMs = 60000) {
  const key = `${socket.handshake.address}-${eventType}`;
  const now = Date.now();
  
  if (!socketEventLimiter.has(key)) {
    socketEventLimiter.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const limiter = socketEventLimiter.get(key);
  
  if (now > limiter.resetTime) {
    limiter.count = 1;
    limiter.resetTime = now + windowMs;
    return true;
  }
  
  if (limiter.count >= maxEvents) {
    logger.warn(`Socket rate limit exceeded for ${socket.handshake.address} on event ${eventType}`);
    return false;
  }
  
  limiter.count++;
  return true;
}

// Input validation
function validateRoomData(req, res, next) {
  const { createdBy, settings } = req.body;
  
  // Validate createdBy
  if (createdBy && (typeof createdBy !== 'string' || createdBy.length > 100)) {
    return res.status(400).json({
      error: 'Invalid createdBy field. Must be a string with max 100 characters.'
    });
  }
  
  // Validate settings
  if (settings) {
    if (typeof settings !== 'object') {
      return res.status(400).json({
        error: 'Settings must be an object.'
      });
    }
    
    if (settings.maxUsers && (typeof settings.maxUsers !== 'number' || settings.maxUsers < 1 || settings.maxUsers > 50)) {
      return res.status(400).json({
        error: 'maxUsers must be a number between 1 and 50.'
      });
    }
    
    if (settings.password && (typeof settings.password !== 'string' || settings.password.length > 50)) {
      return res.status(400).json({
        error: 'Password must be a string with max 50 characters.'
      });
    }
  }
  
  next();
}

// Clean up old rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, limiter] of socketEventLimiter.entries()) {
    if (now > limiter.resetTime) {
      socketEventLimiter.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

module.exports = {
  helmet,
  apiLimiter,
  roomCreationLimiter,
  checkSocketRateLimit,
  validateRoomData
};