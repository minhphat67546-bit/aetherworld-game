const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = function(getDb, JWT_SECRET, NAMES_POOL, CLASSES, RACES, randomInt) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Tên tài khoản và mật khẩu là bắt buộc' });
    if (username.length < 3) return res.status(400).json({ error: 'Tên tài khoản phải có ít nhất 3 ký tự' });
    if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự' });
    
    const db = getDb();
    if (!db) return res.status(500).json({ error: 'Database chưa sẵn sàng' });

    try {
      const existing = await db.collection('users').findOne({ username: username.toLowerCase() });
      if (existing) return res.status(409).json({ error: 'Tên tài khoản đã tồn tại' });

      const hashedPw = await bcrypt.hash(password, 10);
      const result = await db.collection('users').insertOne({
        username: username.toLowerCase(),
        password: hashedPw,
        createdAt: new Date()
      });

      // Create initial character with username as character name
      const charName = username;
      const rIndex = randomInt(0, RACES.length - 1);
        await db.collection('characters').insertOne({
          userId: result.insertedId.toString(),
          name: charName,
          class: CLASSES[rIndex],
          race: RACES[rIndex],
        level: 1,
        hp: 48000, hpMax: 48000,
        combatRating: randomInt(8000, 15000),
        gold: 0, inventory: [], bossKills: 0,
        createdAt: new Date(), lastSeen: new Date()
      });

      const token = jwt.sign({ userId: result.insertedId.toString(), username: username.toLowerCase() }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, username: username.toLowerCase() });
    } catch (e) {
      res.status(500).json({ error: 'Lỗi server: ' + e.message });
    }
  });

  router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
    
    const db = getDb();
    if (!db) return res.status(500).json({ error: 'Database chưa sẵn sàng' });

    try {
      const user = await db.collection('users').findOne({ username: username.toLowerCase() });
      if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' });

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: 'Sai mật khẩu' });

      const token = jwt.sign({ userId: user._id.toString(), username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, username: user.username });
    } catch (e) {
      res.status(500).json({ error: 'Lỗi server: ' + e.message });
    }
  });

  router.get('/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Không có token' });
    try {
      const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
      res.json({ userId: decoded.userId, username: decoded.username });
    } catch {
      res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
    }
  });

  return router;
};
