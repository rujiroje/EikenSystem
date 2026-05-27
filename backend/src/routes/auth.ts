import { Router } from 'express';

export const router = Router();

// Simple in-memory users (to be replaced by real auth)
const users = [
  { username: 'operator', role: 'OPERATOR' },
  { username: 'leader', role: 'LEADER' },
  { username: 'qa', role: 'QA' },
];

router.post('/login', (req, res) => {
  const { username } = req.body || {};
  const user = users.find((u) => u.username === username);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  // In real app, return JWT
  res.json({ username: user.username, role: user.role });
});

router.get('/me', (_req, res) => {
  // Stub: return operator by default (replace with token-based identity)
  res.json({ username: 'operator', role: 'OPERATOR' });
});
