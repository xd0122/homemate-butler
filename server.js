// 合租生活管家 - 轻量同步服务器（Node 无第三方依赖）
// 接口：
//   GET /api/room/:code?pw=密码   → 返回房间状态（密码错误 403）
//   PUT /api/room/:code           → body: {pw, state}，首次调用以 pw 注册房间，之后校验 pw
// 静态托管 index.html；房间数据保存在 data 目录（含密码哈希），重启不丢
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const hashPw = pw => crypto.createHash('sha256').update('homemate::' + pw).digest('hex');

function roomFile(code) {
  return path.join(DATA_DIR, 'room_' + code.replace(/[^A-Za-z0-9]/g, '') + '.json');
}
function readRoom(code) {
  try { return JSON.parse(fs.readFileSync(roomFile(code), 'utf8')); } catch (e) { return null; }
}
function json(res, status, obj) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]{4,8})$/);
  if (m) {
    const code = m[1];

    // 读取房间状态（需正确密码）
    if (req.method === 'GET') {
      const rec = readRoom(code);
      if (!rec) return json(res, 200, { empty: true });
      if (hashPw(url.searchParams.get('pw') || '') !== rec.pwHash) return json(res, 403, { error: 'locked' });
      return json(res, 200, rec.state);
    }

    // 写入房间状态：首次注册密码，之后校验密码
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 8 * 1024 * 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const { pw, state } = JSON.parse(body);
          if (!state || typeof state.updatedAt !== 'number') throw new Error('bad state');
          const rec = readRoom(code);
          if (rec) {
            if (hashPw(pw || '') !== rec.pwHash) return json(res, 403, { error: 'locked' });
            rec.state = state;
            fs.writeFileSync(roomFile(code), JSON.stringify(rec));
          } else {
            if (!pw || String(pw).length < 4) return json(res, 403, { error: 'need_pw' });
            fs.writeFileSync(roomFile(code), JSON.stringify({ pwHash: hashPw(pw), state }));
          }
          json(res, 200, { ok: true });
        } catch (e) {
          json(res, 400, { error: 'bad_request' });
        }
      });
      return;
    }
  }

  // 静态文件
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(__dirname, file);
  if (full.startsWith(__dirname) && fs.existsSync(full) && fs.statSync(full).isFile()) {
    const ext = path.extname(full).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    return fs.createReadStream(full).pipe(res);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => console.log('HomeMate sync server on :' + PORT));
