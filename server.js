import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const app = express();
const PORT = Number(process.env.PORT || 8928);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

const now = () => new Date().toISOString();
const uid = () => crypto.randomBytes(16).toString('hex');
const hash = (value, salt = uid()) => `${salt}:${crypto.scryptSync(value, salt, 64).toString('hex')}`;
const verify = (value, stored) => {
  const [salt, key] = String(stored || '').split(':');
  if (!salt || !key) return false;
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), crypto.scryptSync(value, salt, 64));
};

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(DB_FILE); }
  catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ users: [], sessions: [], sets: [], stats: {}, ignored: [], events: [] }, null, 2));
  }
}
async function readDb() { await ensureDb(); return JSON.parse(await fs.readFile(DB_FILE, 'utf8')); }
async function writeDb(db) { await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2)); }
function publicUser(user) { return { id: user.id, username: user.username, createdAt: user.createdAt }; }
async function auth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const db = await readDb();
  const session = db.sessions.find(s => s.token === token);
  if (!session) return res.status(401).json({ error: 'UNAUTHORIZED' });
  const user = db.users.find(u => u.id === session.userId);
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  req.db = db; req.user = user; req.session = session; next();
}
const allQuestions = db => db.sets.flatMap(set => set.questions.map(q => ({ ...q, setId: set.id, setName: set.name })));
const keyFor = q => `${q.setId}:${q.id}`;
const userStats = (db, userId, qKey) => (db.stats[userId] ||= {}, db.stats[userId][qKey] ||= { correct: 0, wrong: 0, streakCorrect: 0, streakWrong: 0, lastAnswered: null });
const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
function weightedPick(db, userId, limit = 1) {
  const ignored = new Set(db.ignored.filter(i => i.userId === userId).map(i => i.qKey));
  const pool = allQuestions(db).filter(q => !ignored.has(keyFor(q)));
  const picked = [];
  for (let n = 0; n < Math.min(limit, pool.length); n++) {
    const weighted = pool.filter(q => !picked.includes(q)).flatMap(q => {
      const st = userStats(db, userId, keyFor(q));
      const weight = 1 + Math.min(8, st.streakWrong * 3 + st.wrong - Math.floor(st.streakCorrect / 3));
      return Array(Math.max(1, weight)).fill(q);
    });
    picked.push(weighted[Math.floor(Math.random() * weighted.length)]);
  }
  return picked;
}
function normalizeQuestion(raw, idx) {
  if (!raw || !raw.pytanie || !raw.poprawna_odpowiedz || !Array.isArray(raw.bledne_odpowiedzi)) throw new Error(`Niepoprawne pytanie nr ${idx + 1}`);
  return { id: raw.id ?? idx + 1, pytanie: String(raw.pytanie), poprawna_odpowiedz: String(raw.poprawna_odpowiedz), bledne_odpowiedzi: raw.bledne_odpowiedzi.map(String).slice(0, 8), zrodlo: raw.zrodlo ? String(raw.zrodlo) : '', wymaga_weryfikacji: Boolean(raw.wymaga_weryfikacji) };
}
function quizPayload(q) {
  return { qKey: keyFor(q), id: q.id, setId: q.setId, setName: q.setName, pytanie: q.pytanie, zrodlo: q.zrodlo, wymaga_weryfikacji: q.wymaga_weryfikacji, answers: shuffle([q.poprawna_odpowiedz, ...q.bledne_odpowiedzi]).map((text, index) => ({ id: index, text })) };
}

app.get('/api/status', async (req, res) => { const db = await readDb(); res.json({ needsSetup: db.users.length === 0 }); });
app.post('/api/register', async (req, res) => {
  const db = await readDb();
  if (db.users.length) return res.status(409).json({ error: 'FIRST_USER_EXISTS' });
  const { username, password } = req.body;
  if (!username || String(password || '').length < 6) return res.status(400).json({ error: 'USERNAME_AND_6_CHAR_PASSWORD_REQUIRED' });
  const user = { id: uid(), username: String(username), passwordHash: hash(String(password)), createdAt: now() };
  const session = { token: uid() + uid(), userId: user.id, createdAt: now(), rememberForever: true };
  db.users.push(user); db.sessions.push(session); await writeDb(db);
  res.json({ token: session.token, user: publicUser(user) });
});
app.post('/api/login', async (req, res) => {
  const db = await readDb(); const { username, password, rememberForever = true } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user || !verify(String(password || ''), user.passwordHash)) return res.status(401).json({ error: 'BAD_LOGIN' });
  const session = { token: uid() + uid(), userId: user.id, createdAt: now(), rememberForever: Boolean(rememberForever) };
  db.sessions.push(session); await writeDb(db); res.json({ token: session.token, user: publicUser(user) });
});
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/logout', auth, async (req, res) => { req.db.sessions = req.db.sessions.filter(s => s.token !== req.session.token); await writeDb(req.db); res.json({ ok: true }); });

app.get('/api/dashboard', auth, async (req, res) => {
  const db = req.db; const questions = allQuestions(db); const ignored = new Set(db.ignored.filter(i => i.userId === req.user.id).map(i => i.qKey));
  const stats = Object.values(db.stats[req.user.id] || {});
  res.json({ now: now(), totalQuestions: questions.length, activeQuestions: questions.filter(q => !ignored.has(keyFor(q))).length, ignoredQuestions: ignored.size, lastPracticed: stats.map(s => s.lastAnswered).filter(Boolean).sort().pop() || null, wellKnown: stats.filter(s => s.streakCorrect >= 10).length, struggling: stats.filter(s => s.streakWrong >= 3).length, sets: db.sets.map(s => ({ id: s.id, name: s.name, createdAt: s.createdAt, count: s.questions.length })) });
});
app.post('/api/sets', auth, async (req, res) => {
  const { name, questions } = req.body;
  if (!name || !Array.isArray(questions)) return res.status(400).json({ error: 'SET_NAME_AND_QUESTIONS_REQUIRED' });
  const set = { id: uid(), name: String(name), createdAt: now(), questions: questions.map(normalizeQuestion) };
  req.db.sets.push(set); await writeDb(req.db); res.json({ set: { id: set.id, name: set.name, count: set.questions.length } });
});
app.get('/api/sets/:id/download', auth, (req, res) => {
  const set = req.db.sets.find(s => s.id === req.params.id); if (!set) return res.status(404).json({ error: 'NOT_FOUND' });
  res.setHeader('Content-Disposition', `attachment; filename="${set.name.replace(/[^a-z0-9_-]+/gi, '_')}.json"`); res.json(set.questions);
});
app.delete('/api/sets/:id', auth, async (req, res) => { req.db.sets = req.db.sets.filter(s => s.id !== req.params.id); await writeDb(req.db); res.json({ ok: true }); });

app.get('/api/questions/next', auth, (req, res) => { const q = weightedPick(req.db, req.user.id, 1)[0]; if (!q) return res.status(404).json({ error: 'NO_QUESTIONS' }); const payload = quizPayload(q); if (req.query.flash === '1') payload.correctAnswer = q.poprawna_odpowiedz; res.json({ question: payload }); });
app.post('/api/exam', auth, (req, res) => { const count = Number(req.body.count || 10); res.json({ questions: weightedPick(req.db, req.user.id, Math.min(500, count)).map(quizPayload) }); });
app.post('/api/answer', auth, async (req, res) => {
  const { qKey, answerText } = req.body; const q = allQuestions(req.db).find(x => keyFor(x) === qKey); if (!q) return res.status(404).json({ error: 'NOT_FOUND' });
  const correct = String(answerText) === q.poprawna_odpowiedz; const st = userStats(req.db, req.user.id, qKey);
  st.lastAnswered = now(); correct ? (st.correct++, st.streakCorrect++, st.streakWrong = 0) : (st.wrong++, st.streakWrong++, st.streakCorrect = 0);
  req.db.events.push({ userId: req.user.id, qKey, correct, at: now() }); await writeDb(req.db);
  res.json({ correct, correctAnswer: q.poprawna_odpowiedz, stats: st });
});
app.post('/api/ignore', auth, async (req, res) => { const { qKey } = req.body; if (!req.db.ignored.some(i => i.userId === req.user.id && i.qKey === qKey)) req.db.ignored.push({ userId: req.user.id, qKey, at: now() }); await writeDb(req.db); res.json({ ok: true }); });
app.get('/api/ignored', auth, (req, res) => { const qs = allQuestions(req.db); res.json({ ignored: req.db.ignored.filter(i => i.userId === req.user.id).map(i => ({ ...i, question: qs.find(q => keyFor(q) === i.qKey)?.pytanie || i.qKey })) }); });
app.delete('/api/ignored/:qKey', auth, async (req, res) => { req.db.ignored = req.db.ignored.filter(i => !(i.userId === req.user.id && i.qKey === req.params.qKey)); await writeDb(req.db); res.json({ ok: true }); });

app.get('*', (_, res) => res.sendFile(path.join(process.cwd(), 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`QandA listening on ${PORT}`));
