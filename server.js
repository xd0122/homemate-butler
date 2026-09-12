// 合租生活管家 - 轻量同步服务器（Node 无第三方依赖）
// 接口：GET/PUT /api/room/:code ｜ 静态托管 index.html
// 存储保存在服务器 data 目录，重启不丢数据
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function roomFile(code) {
  return path.join(DATA_DIR, 'room_' + code.replace(/[^A-Za-z0-9]/g, '') + '.json');
}
function readRoom(code) {
  try { return JSON.parse(fs.readFileSync(roomFile(code), 'utf8')); } catch (e) { return null; }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); return res.end();
  }

  // REST 同步接口
  const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]{4,8})$/);
  if (m) {
    const code = m[1];
    if (req.method === 'GET') {
      const data = readRoom(code);
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data || { room: code, empty: true, updatedAt: 0 }));
    }
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 5 * 1024 * 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const d = JSON.parse(body);
          if (!d || typeof d.updatedAt !== 'number') throw new Error('bad payload');
          fs.writeFileSync(roomFile(code), JSON.stringify(d));
          res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch (e) {
          res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
          res.end('{"ok":false}');
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
