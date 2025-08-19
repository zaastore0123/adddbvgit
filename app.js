const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const path = require("path");
const PORT = process.env.PORT || 5000;

require('dotenv').config();

// === Konfigurasi GitHub ===
const GITHUB_OWNER = process.env.GITHUB_OWNER
const GITHUB_REPO = process.env.GITHUB_REPO
const FILE_PATH = process.env.FILE_PATH
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;

const ADMIN_PASSWORD = process.env.PW_ADMIN_LOGIN
const USER_PASSWORD = process.env.PW_USER_LOGIN;

const settings = {
  contact_whatsapp: process.env.CONTACT_OWNER,
  api_title: process.env.API_TITLE
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

app.get('/set', (req, res) => res.json(settings));

// Ambil data dari GitHub API
async function fetchData() {
  const res = await fetch(GITHUB_API_URL, {
    headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
  });
  const json = await res.json();
  const content = Buffer.from(json.content, 'base64').toString('utf-8');
  return JSON.parse(content);
}

// Update data ke GitHub
async function updateData(newData) {
  const current = await fetch(GITHUB_API_URL, {
    headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
  }).then(res => res.json());

  const base64Content = Buffer.from(JSON.stringify(newData, null, 2)).toString('base64');

  await fetch(GITHUB_API_URL, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Update database.json',
      content: base64Content,
      sha: current.sha
    })
  });
}

function authMiddleware(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.redirect('/login-admin');
  }
}

function authMiddlewareUser(req, res, next) {
  if (req.session && req.session.isUser) {
    next();
  } else {
    res.redirect('/login');
  }
}

// === ROUTES ===

// Halaman User
app.get('/', authMiddlewareUser, async (req, res) => {
  const message = req.session.message;
  req.session.message = null;
  const data = await fetchData();
  res.render('user', { message, data });
});
// === ROUTES ===


app.post('/add', authMiddlewareUser, async (req, res) => {
  let { number } = req.body;
  const data = await fetchData();
  number = number.replace(/[^0-9]/g, "")
  if (number.length < 8 || number.length > 15) {
  req.session.message = 'Nomor tidak valid';
  return res.redirect('/');
  }
  const alreadyExists = data.find(item => item.number === number);
  if (alreadyExists) {
    req.session.message = 'Nomor sudah terdaftar';
    return res.redirect('/');
  }

  data.push({ number, status: 'active' });
  await updateData(data);
  req.session.message = 'Berhasil menambah nomor ✓';
  res.redirect('/');
});

app.post('/admin-add', async (req, res) => {
  let { number } = req.body;
  const data = await fetchData();
  number = number.replace(/[^0-9]/g, "")
  if (number.length < 8 || number.length > 15) {
  req.session.message = 'Nomor tidak valid';
  return res.redirect('/admin');
  }
  const alreadyExists = data.find(item => item.number === number);
  if (alreadyExists) {
    req.session.message = 'Nomor sudah terdaftar';
    return res.redirect('/admin');
  }

  data.push({ number, status: 'active' });
  await updateData(data);
  req.session.message = 'Berhasil menambah nomor ✓';
  res.redirect('/admin');
});

app.get('/login-admin', (req, res) => {
  const message = req.session.message;
  req.session.message = null;
  res.render('login-admin', { message });
});

app.post('/login-admin', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.isUser = false
    res.redirect('/admin');
  } else {
    req.session.message = 'Sandi salah!';
    res.redirect('/login-admin');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login-admin');
});

// Halaman Admin
app.get('/admin', authMiddleware, async (req, res) => {
  const data = await fetchData();
  const message = req.session.message;
  req.session.message = null;
  res.render('admin', { data, message });
});

// Login User
app.get('/login', (req, res) => {
  const message = req.session.message;
  req.session.message = null;
  res.render('login', { message });
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === USER_PASSWORD) {
    req.session.isUser = true;
    req.session.isAdmin = false;
    res.redirect('/');
  } else {
    req.session.message = 'Sandi salah!';
    res.redirect('/login');
  }
});

app.get('/logout-user', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.post('/delete', async (req, res) => {
  const { number } = req.body;
  let data = await fetchData();
  data = data.filter(item => item.number !== number);
  await updateData(data);
  req.session.message = 'Berhasil menghapus nomor ✓';
  res.redirect('/admin');
});

app.post('/blacklist', async (req, res) => {
  const { number } = req.body;
  let data = await fetchData();
  data = data.map(item => item.number === number ? { ...item, status: 'blacklist' } : item);
  await updateData(data);
  req.session.message = 'Berhasil blacklist nomor ✓';
  res.redirect('/admin');
});

app.post('/whitelist', async (req, res) => {
  const { number } = req.body;
  let data = await fetchData();
  data = data.map(item => item.number === number ? { ...item, status: 'active' } : item);
  await updateData(data);
  req.session.message = 'Berhasil whitelist nomor ✓';
  res.redirect('/admin');
});

// Endpoint RAW JSON dari GitHub API (bukan raw URL)
app.get('/raw', async (req, res) => {
  const current = await fetch(GITHUB_API_URL, {
    headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
  }).then(res => res.json());

  const content = Buffer.from(current.content, "base64").toString("utf-8");
  const jsonData = JSON.parse(content);
  res.json(jsonData);
});

// GET /add?number=
app.get('/addnumber', async (req, res) => {
  let { number } = req.query;
  const data = await fetchData();
  number = number?.replace(/[^0-9]/g, "");
  if (!number || number.length < 8 || number.length > 15) {
    return res.json({ success: false, message: 'Nomor tidak valid' });
  }
  const alreadyExists = data.find(item => item.number === number);
  if (alreadyExists) {
    return res.json({ success: false, message: 'Nomor sudah terdaftar' });
  }

  data.push({ number, status: 'active' });
  await updateData(data);
  res.json({ success: true, message: 'Berhasil menambah nomor ✓' });
});

// GET /delete?number=
app.get('/deletenumber', async (req, res) => {
  const { number } = req.query;
  let data = await fetchData();
  const exists = data.some(item => item.number === number);
  if (!exists) return res.json({ success: false, message: 'Nomor tidak ditemukan' });

  data = data.filter(item => item.number !== number);
  await updateData(data);
  res.json({ success: true, message: 'Berhasil menghapus nomor ✓' });
});

// GET /blacklist?number=
app.get('/blacklistnumber', async (req, res) => {
  const { number } = req.query;
  let data = await fetchData();
  const exists = data.some(item => item.number === number);
  if (!exists) return res.json({ success: false, message: 'Nomor tidak ditemukan' });

  data = data.map(item => item.number === number ? { ...item, status: 'blacklist' } : item);
  await updateData(data);
  res.json({ success: true, message: 'Berhasil blacklist nomor ✓' });
});

// GET /whitelist?number=
app.get('/whitelistnumber', async (req, res) => {
  const { number } = req.query;
  let data = await fetchData();
  const exists = data.some(item => item.number === number);
  if (!exists) return res.json({ success: false, message: 'Nomor tidak ditemukan' });

  data = data.map(item => item.number === number ? { ...item, status: 'active' } : item);
  await updateData(data);
  res.json({ success: true, message: 'Berhasil whitelist nomor ✓' });
});

// Jalankan server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));