// server/fetch-and-generate.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const yaml = require('js-yaml');

const BASE = yaml.load(
  fs.readFileSync(path.resolve(__dirname, '../templates/base.yaml'), 'utf8')
);
const SOURCES = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../config-sources.json'), 'utf8')
);
const SERVERS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../servers.json'), 'utf8')
);
const OUT_DIR = path.resolve(__dirname, '../static');

function buildProxies(arr) {
  return arr.map(s => ({
    name: s.ps,
    type: 'vmess',
    server: s.add,
    port: s.port,
    uuid: s.id,
    alterId: s.aid,
    cipher: 'auto',
    tls: s.tls === 'tls',
    network: s.net,
    'ws-opts': { path: s.path, headers: { Host: s.host } },
    'skip-cert-verify': !!s.allowInsecure
  }));
}

function loadRemoteRules() {
  const lines = [];
  for (let src of SOURCES.sources) {
    try {
      const txt = fs.readFileSync(path.join(OUT_DIR, src.filename), 'utf8');
      txt.split(/\r?\n/).forEach(l => {
        if (l.trim() && !l.startsWith('#')) lines.push(l.trim());
      });
    } catch {}
  }
  return lines;
}

async function fetchAllSources() {
  for (let src of SOURCES.sources) {
    try {
      const res = await axios.get(src.url, { timeout: 15000 });
      fs.writeFileSync(path.join(OUT_DIR, src.filename), res.data, 'utf8');
      console.log(`Fetched ${src.filename}`);
    } catch (e) {
      console.error(`Fetch failed ${src.filename}`, e.message);
    }
  }
}

function assembleConfig() {
  const cfg = { ...BASE };
  cfg.proxies = buildProxies(SERVERS);
  // 如果你在 base.yaml 里写了 proxy-groups，就保留；否则这里可以生成默认组
  cfg['proxy-groups'] = BASE['proxy-groups'] || [
    { name: 'Proxy', type: 'select', proxies: cfg.proxies.map(p=>p.name).concat('DIRECT') }
  ];
  cfg.rules = loadRemoteRules();
  return cfg;
}

async function main() {
  // 1) 拉取最新远程分流文件
  await fetchAllSources();
  // 2) 生成完整 YAML
  const final = assembleConfig();
  const yamlStr = yaml.dump(final, { lineWidth: 1000 });
  fs.writeFileSync(path.resolve(OUT_DIR, 'config.yaml'), yamlStr, 'utf8');
  console.log('Generated config.yaml');
}

if (require.main === module) main();
