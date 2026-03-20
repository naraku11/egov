import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Could be user or servant
    if (decoded.type === 'servant') {
      const servant = await prisma.servant.findUnique({
        where: { id: decoded.id },
        include: { department: true },
      });
      if (!servant) return res.status(401).json({ error: 'Invalid token' });
      req.servant = servant;
      req.userType = 'servant';
    } else {
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!user) return res.status(401).json({ error: 'Invalid token' });
      req.user = user;
      req.userType = 'user';
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.userType !== 'user' || req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const requireServant = (req, res, next) => {
  if (req.userType !== 'servant') {
    return res.status(403).json({ error: 'Servant access required' });
  }
  next();
};

export const requireClient = (req, res, next) => {
  if (req.userType !== 'user') {
    return res.status(403).json({ error: 'Client access required' });
  }
  next();
};
