// server/index.js
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const STATIC = path.resolve(__dirname, '../static');
const SRV_JSON = path.resolve(__dirname, '../servers.json');

// UA 重定向到最新的 config.yaml
app.get('/proxy-config', (req, res) => {
  res.redirect('/static/config.yaml');
});

// 获取/更新 servers.json
app.get('/api/servers', (req, res) => res.sendFile(SRV_JSON));
app.post('/api/servers', (req, res) => {
  fs.writeFileSync(SRV_JSON, JSON.stringify(req.body, null, 2));
  // 更新并生成
  exec('node fetch-and-generate.js', { cwd: __dirname }, (e,o,er) => {
    if (e) return res.status(500).json({ error: er });
    res.json({ success: true });
  });
});

// 预览合成 YAML（不写磁盘）
app.get('/api/preview', (req, res) => {
  const yaml = exec('node -e "require(\'./fetch-and-generate\').assembleConfig && console.log(\'ok\')"');
  // 为简化，直接返回静态文件
  res.sendFile(path.join(STATIC, 'config.yaml'));
});

// 静态托管
app.use('/static', express.static(STATIC));
app.use('/', express.static(path.resolve(__dirname, '../frontend')));

app.listen(3000, ()=> console.log('Listening on http://0.0.0.0:3000'));
