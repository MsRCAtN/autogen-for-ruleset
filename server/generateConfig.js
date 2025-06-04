#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const yaml = require('js-yaml');
const { program } = require('commander');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');

const RULE_SOURCES_PATH = path.join(CONFIG_DIR, 'rule-sources.json');
const GENERATED_RULES_PATH = path.join(OUTPUT_DIR, 'generated_rules.txt');
const FINAL_CONFIG_PATH = path.join(OUTPUT_DIR, 'config.yaml');

// Helper function to ensure a directory exists
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    } else {
      throw error;
    }
  }
}

// Ensure output directory exists
async function ensureOutputDir() {
  await ensureDirectoryExists(OUTPUT_DIR);
}

// Helper function to convert V2RayN/V2RayNG config to Clash proxy format
function convertV2RayNToClash(v2raynConfig) {
  if (!v2raynConfig || typeof v2raynConfig !== 'object') {
    console.warn('Invalid v2raynConfig object received for conversion:', v2raynConfig);
    return null;
  }

  const clashProxy = {
    name: v2raynConfig.ps || `v2rayn_proxy_${Date.now()}`,
    type: '', // To be determined
    server: v2raynConfig.add,
    port: parseInt(v2raynConfig.port, 10),
    tls: v2raynConfig.tls === 'tls' || v2raynConfig.tls === true,
    'skip-cert-verify': v2raynConfig.allowInsecure === '1' || v2raynConfig.allowInsecure === 1 || v2raynConfig.allowInsecure === true || v2raynConfig.skipCertVerify === true,
    servername: v2raynConfig.sni || v2raynConfig.host || v2raynConfig.peer || v2raynConfig.add,
    'client-fingerprint': 'chrome', 
  };

  if (!clashProxy.server || isNaN(clashProxy.port)) {
    console.warn(`Skipping proxy due to missing server or invalid port: ${clashProxy.name}`);
    return null;
  }
  
  if (!clashProxy.tls) {
    delete clashProxy['skip-cert-verify']; 
    delete clashProxy.servername; 
  } else {
    // Ensure servername is set if tls is true, fallback to server if not available
     clashProxy.servername = clashProxy.servername || clashProxy.server;
  }


  // --- Type Determination Logic ---
  const v2nType = (v2raynConfig.type || '').toLowerCase(); // Explicit type from config if available
  // const psName = (v2raynConfig.ps || '').toLowerCase(); // Name field, sometimes contains type hints. Not used in this refined logic.

  if (v2nType === 'ss' || (v2raynConfig.method && !v2raynConfig.id && v2raynConfig.encryption === undefined && v2raynConfig.protocol === undefined)) { // Prioritize SS if 'method' exists and no vmess/vless/ssr specific fields
    clashProxy.type = 'ss';
    clashProxy.cipher = v2raynConfig.method;
    clashProxy.password = v2raynConfig.password;
    if (v2raynConfig.plugin === 'obfs-local' || v2raynConfig.plugin === 'simple-obfs' || v2raynConfig.obfs) {
      clashProxy.plugin = 'obfs';
      clashProxy['plugin-opts'] = {
        mode: (v2raynConfig.obfs === 'http' || v2raynConfig.obfs === 'tls') ? v2raynConfig.obfs : 'http',
        host: v2raynConfig.obfshost || v2raynConfig.host || clashProxy.servername || clashProxy.server
      };
    }
    delete clashProxy.tls;
    delete clashProxy['skip-cert-verify'];
    delete clashProxy.servername;
    delete clashProxy['client-fingerprint'];

  } else if (v2nType === 'trojan' || (v2raynConfig.password && !v2raynConfig.method && !v2raynConfig.id && v2raynConfig.scy === undefined && v2raynConfig.cipher === undefined && v2raynConfig.protocol === undefined)) { // Trojan has password, no method/id/scy/cipher/protocol
    clashProxy.type = 'trojan';
    clashProxy.password = v2raynConfig.password;
    if (v2raynConfig.allowInsecure === undefined) { 
        clashProxy['skip-cert-verify'] = false;
    }
    // SNI for Trojan is taken from clashProxy.servername, which is already set from v2raynConfig.sni or host or peer or add.
    // if (v2raynConfig.sni) clashProxy.sni = v2raynConfig.sni; // This would override the general servername logic, better to rely on servername.

    if (v2raynConfig.net === 'ws') {
        clashProxy.network = 'ws';
        clashProxy['ws-opts'] = {
            path: v2raynConfig.path || '/',
            headers: { Host: v2raynConfig.host || clashProxy.servername || clashProxy.server }
        };
    } else if (v2raynConfig.net === 'grpc') {
        clashProxy.network = 'grpc';
        clashProxy['grpc-opts'] = {
            'grpc-service-name': v2raynConfig.path || v2raynConfig.serviceName || ''
        };
    }
    if (clashProxy.tls) {
        clashProxy.servername = clashProxy.servername || clashProxy.server;
    }

  } else if (v2nType === 'vless' || (v2raynConfig.id && (v2raynConfig.encryption === 'none' || v2raynConfig.flow))) {
    clashProxy.type = 'vless';
    clashProxy.uuid = v2raynConfig.id;
    clashProxy.flow = v2raynConfig.flow || ''; 
    clashProxy.encryption = 'none'; 

    if (v2raynConfig.net === 'ws') {
      clashProxy.network = 'ws';
      clashProxy['ws-opts'] = {
        path: v2raynConfig.path || '/',
        headers: { Host: v2raynConfig.host || clashProxy.servername || clashProxy.server }
      };
    } else if (v2raynConfig.net === 'tcp') { 
        clashProxy.network = 'tcp'; 
        if (v2raynConfig.security === 'reality') {
            clashProxy.flow = v2raynConfig.flow || 'xtls-rprx-vision';
            clashProxy.servername = v2raynConfig.sni || v2raynConfig.peer || clashProxy.server; 
            clashProxy.reality_opts = {
                'public-key': v2raynConfig.pbk,
                'short-id': v2raynConfig.sid || ''
            };
            clashProxy.tls = true; 
            clashProxy['client-fingerprint'] = v2raynConfig.fp || 'chrome';
        } else if (v2raynConfig.security === 'tls' || clashProxy.tls) { 
            clashProxy['client-fingerprint'] = v2raynConfig.fp || 'chrome';
            clashProxy.servername = v2raynConfig.sni || v2raynConfig.host || clashProxy.servername || clashProxy.server;
        }
    } else if (v2raynConfig.net === 'grpc') {
        clashProxy.network = 'grpc';
        clashProxy['grpc-opts'] = {
            'grpc-service-name': v2raynConfig.path || v2raynConfig.serviceName || ''
        };
        clashProxy['client-fingerprint'] = v2raynConfig.fp || 'chrome';
    }

  } else if (v2nType === 'vmess' || (v2raynConfig.id && v2raynConfig.hasOwnProperty('aid'))) { // VMess has id and aid
    clashProxy.type = 'vmess';
    clashProxy.uuid = v2raynConfig.id;
    clashProxy.alterId = parseInt(v2raynConfig.aid, 10);
    clashProxy.cipher = v2raynConfig.scy || 'auto'; 

    if (v2raynConfig.net === 'ws') {
      clashProxy.network = 'ws';
      clashProxy['ws-opts'] = {
        path: v2raynConfig.path || '/',
        headers: { Host: v2raynConfig.host || clashProxy.servername || clashProxy.server }
      };
    } else if (v2raynConfig.net === 'tcp' && v2raynConfig.type && v2raynConfig.type !== 'none' && v2raynConfig.type !=='dtls' && v2raynConfig.type !=='wireguard') { 
      clashProxy.network = 'tcp';
      clashProxy['tcp-opts'] = {
        header: {
          type: v2raynConfig.type, 
          request: { 
            path: (v2raynConfig.path || "/").split(','),
            headers: { Host: (v2raynConfig.host || clashProxy.servername || clashProxy.server).split(',') }
          }
        }
      };
    } else if (v2raynConfig.net === 'grpc') {
        clashProxy.network = 'grpc';
        clashProxy['grpc-opts'] = {
            'grpc-service-name': v2raynConfig.path || v2raynConfig.serviceName || ''
        };
    }
    if (clashProxy.tls) {
        clashProxy.servername = clashProxy.servername || clashProxy.server;
    }

  } else if (v2nType === 'ssr' || v2raynConfig.protocol) { // ShadowsocksR
    clashProxy.type = 'ssr';
    clashProxy.cipher = v2raynConfig.method; 
    clashProxy.password = v2raynConfig.password;
    clashProxy.protocol = v2raynConfig.protocol;
    clashProxy.protocol_param = v2raynConfig.protocolparam || v2raynConfig.protoparam || '';
    clashProxy.obfs = v2raynConfig.obfs;
    clashProxy.obfs_param = v2raynConfig.obfsparam || '';
    delete clashProxy.tls;
    delete clashProxy['skip-cert-verify'];
    delete clashProxy.servername;
    delete clashProxy['client-fingerprint'];
  } else {
    console.warn(`Unsupported or unrecognized V2RayN proxy type for: ${clashProxy.name}. Config:`, v2raynConfig);
    return null;
  }

  // Final cleanup and defaults for TLS related fields
  if (clashProxy.tls) {
      clashProxy.servername = clashProxy.servername || clashProxy.server; // Ensure servername if TLS is true
      // skip-cert-verify is already set based on allowInsecure, or defaults to false for Trojan if not specified.
  } else {
      // If TLS is definitively false, remove TLS specific fields, unless it's a VLESS with REALITY
      if (!(clashProxy.type === 'vless' && clashProxy.reality_opts)) {
          delete clashProxy.servername;
          delete clashProxy['skip-cert-verify'];
          delete clashProxy['client-fingerprint'];
      }
  }

  if (!clashProxy.type) {
      console.warn(`Could not determine type for proxy: ${clashProxy.name}`);
      return null;
  }
  if (clashProxy.type === 'vmess' && !clashProxy.uuid) { console.warn(`VMess proxy ${clashProxy.name} missing UUID.`); return null; }
  if (clashProxy.type === 'vless' && !clashProxy.uuid) { console.warn(`VLESS proxy ${clashProxy.name} missing UUID.`); return null; }
  if (clashProxy.type === 'ss' && (!clashProxy.cipher || !clashProxy.password)) { console.warn(`SS proxy ${clashProxy.name} missing cipher or password.`); return null; }
  if (clashProxy.type === 'trojan' && !clashProxy.password) { console.warn(`Trojan proxy ${clashProxy.name} missing password.`); return null; }

  return clashProxy;
}

async function fetchAndProcessRules() {
  console.log('Fetching and processing rules...');
  await ensureOutputDir();
  let ruleSources = [];
  try {
    const ruleSourcesContent = await fs.readFile(RULE_SOURCES_PATH, 'utf8');
    ruleSources = JSON.parse(ruleSourcesContent);
  } catch (error) {
    console.error(`Error reading rule sources from ${RULE_SOURCES_PATH}:`, error.message);
    console.log('Proceeding with an empty rule set.');
    await fs.writeFile(GENERATED_RULES_PATH, '', 'utf8');
    return;
  }

  const enabledSources = ruleSources.filter(source => source.enabled);
  if (enabledSources.length === 0) {
    console.log('No enabled rule sources found. Writing empty generated_rules.txt.');
    await fs.writeFile(GENERATED_RULES_PATH, '', 'utf8');
    return;
  }

  let allRuleLines = [];
  for (const source of enabledSources) {
    if (!source.url || !source.ruleType || !source.targetPolicy) {
      console.warn(`Skipping invalid rule source entry: ${source.name || source.id}. Missing url, ruleType, or targetPolicy.`);
      continue;
    }
    try {
      console.log(`Fetching rules from: ${source.name} (${source.url})`);
      let responseData;
      if (source.url.startsWith('file:///')) {
        let filePath = '';
        try {
          // Decode URI component for paths with spaces or special characters
          // For Windows, remove leading '/' if present after 'file:///'
          filePath = decodeURIComponent(source.url.substring(source.url.startsWith('file:////') ? 8 : 7)); 
          if (process.platform === 'win32' && filePath.startsWith('/')) {
            filePath = filePath.substring(1);
          }
        } catch (e) {
          // Fallback for URLs that might not be properly encoded, or simple paths
          filePath = source.url.substring(source.url.startsWith('file:////') ? 8 : 7);
          if (process.platform === 'win32' && filePath.startsWith('/')) {
            filePath = filePath.substring(1);
          }
          console.warn(`Potentially malformed file URI, using raw path: ${filePath}. Error: ${e.message}`);
        }
        responseData = await fs.readFile(filePath, 'utf8');
      } else {
        const response = await axios.get(source.url, { timeout: 15000 });
        responseData = response.data;
      }
      const lines = responseData.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
      
      const KNOWN_CLASH_RULE_TYPES = [
        'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN', 'IP-CIDR', 'IP-CIDR6',
        'GEOIP', 'MATCH', 'RULE-SET', 'FINAL', 'DOMAIN-REGEX',
        'SRC-IP-CIDR', 'SRC-PORT', 'DST-PORT', 'PROCESS-NAME', 'USER-AGENT'
      ].map(type => type.toUpperCase()); // Ensure uppercase for comparison

      const domainValueRuleTypes = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD']; // Defined at correct scope

      const processedLines = lines.map(line => {
        const commentIndex = line.indexOf('#');
        let ruleContent = commentIndex !== -1 ? line.substring(0, commentIndex).trim() : line;
        if (!ruleContent) return null; // Skip lines that became empty after comment removal
        
        const parts = ruleContent.split(',').map(p => p.trim());
        const firstPartUpper = parts[0].toUpperCase();

        if (KNOWN_CLASH_RULE_TYPES.includes(firstPartUpper)) {
          // Line starts with a recognized Clash rule type
          let type = firstPartUpper;

          // Specific check for "DOMAIN-KEYWORD,DOMAIN,..." malformation
          if (type === 'DOMAIN-KEYWORD' && parts.length > 1 && KNOWN_CLASH_RULE_TYPES.includes(parts[1].toUpperCase())) {
            console.warn(`Skipping malformed DOMAIN-KEYWORD rule (value is a type): "${ruleContent}" from ${source.name}`);
            return null;
          }
          // Specific check for "IP-CIDR,DOMAIN,..." malformation
          if (type === 'IP-CIDR' && parts.length > 1 && parts[1].toUpperCase() === 'DOMAIN') {
              console.warn(`Skipping malformed IP-CIDR rule (value is DOMAIN): "${ruleContent}" from ${source.name}`);
              return null;
          }

          if (parts.length === 1) { // e.g., MATCH or FINAL
            return `${type},${source.targetPolicy}`;
          } else { // parts.length >= 2, e.g., DOMAIN-SUFFIX,example.com OR DOMAIN-SUFFIX,example.com,OriginalPolicy[,options...]
            if (!parts[1] && type !== 'MATCH' && type !== 'FINAL') { // Value is empty for types that require a value
              console.warn(`Skipping rule with empty value: "${ruleContent}" from ${source.name}`);
              return null;
            }
            
            let valuePart = parts[1] || ''; // Use empty string if parts[1] is undefined (e.g. for MATCH,POLICY)
            
            if (domainValueRuleTypes.includes(type)) {
              valuePart = valuePart.trim().replace(/^﻿/, ''); // Trim and remove BOM
              valuePart = valuePart.replace(/^[\+\-]\.?/, ''); // Remove leading + or - and an optional subsequent .
              if (valuePart.endsWith('^')) {
                valuePart = valuePart.slice(0, -1);
              }
            }
            
            let policy = parts[2] || source.targetPolicy;
            let options = '';
            if (parts.length > 3) {
              options = ',' + parts.slice(3).join(',');
            }
            return `${type},${valuePart},${policy}${options}`;
          }
        } else {
          // Line does not start with a known Clash rule type.
          // Assume ruleContent is a simple value and prepend ruleType from rule-sources.json.
          if (ruleContent.includes(',')) {
            console.warn(`Skipping rule line (contains comma but not a known type prefix, or is otherwise malformed): "${ruleContent}" from ${source.name}`);
            return null;
          }

          let value = ruleContent.trim().replace(/^﻿/, ''); // Trim and remove BOM from the value
          let typeFromSource = source.ruleType.toUpperCase();

          if (domainValueRuleTypes.includes(typeFromSource)) {
            value = value.replace(/^[\+\-]\.?/, ''); // Remove leading + or - and an optional subsequent .
            if (value.endsWith('^')) {
                value = value.slice(0, -1);
            }
          }
          return `${typeFromSource},${value},${source.targetPolicy}`;
        }
      });
      
      allRuleLines = allRuleLines.concat(processedLines.filter(line => line !== null)); // Filter out any null lines from processing
      console.log(`Successfully fetched and processed ${processedLines.length} rules from ${source.name}.`);
    } catch (error) {
      console.error(`Failed to fetch or process rules from ${source.name} (${source.url}):`, error.message);
    }
  }

  const uniqueRuleLines = [...new Set(allRuleLines)];
  await fs.writeFile(GENERATED_RULES_PATH, uniqueRuleLines.join('\n'), 'utf8');
  console.log(`All rules processed. ${uniqueRuleLines.length} unique rules written to ${GENERATED_RULES_PATH}`);
}

async function generateClashConfig() {
  const currentServersJsonPath = process.env.SERVERS_JSON_PATH || path.join(CONFIG_DIR, 'servers.json');
  console.log('Generating final Clash config.yaml...');
  await ensureOutputDir();

  let proxies = []; 
  try {
    const serversFileContent = await fs.readFile(currentServersJsonPath, 'utf8');
    const lines = serversFileContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) { 
        try {
          const v2raynConfig = JSON.parse(trimmedLine); 
          const clashProxy = convertV2RayNToClash(v2raynConfig);
          if (clashProxy) {
            proxies.push(clashProxy);
          }
        } catch (parseError) {
          console.warn(`Skipping invalid JSON line in ${currentServersJsonPath}: "${trimmedLine.substring(0,100)}...". Error: ${parseError.message}`);
        }
      }
    }
    if (proxies.length === 0) {
        console.warn(`No valid proxies could be parsed from ${currentServersJsonPath}. Proceeding with empty proxy list.`);
    } else {
        console.log(`Successfully parsed and converted ${proxies.length} proxies from ${currentServersJsonPath}.`);
    }
  } catch (error) {
    console.warn(`Error reading or processing servers from ${currentServersJsonPath}: ${error.message}. Proceeding with empty proxy list.`);
    proxies = []; 
  }

  const proxyNames = proxies.map(p => p.name);

  const clashConfig = {
    'port': 7890,
    'socks-port': 7891,
    'allow-lan': true,
    'mode': 'Rule',
    'log-level': 'info',
    'external-controller': ':9090',
    'dns': {
      'enable': true,
      'nameserver': ['119.29.29.29', '223.5.5.5'],
      'fallback': ['8.8.8.8', '8.8.4.4', 'tls://1.0.0.1:853', 'tls://dns.google:853']
    },
    'proxies': proxies, 
    'proxy-groups': [
      { name: 'Proxy', type: 'select', proxies: [...new Set([...proxyNames, 'Direct'])] }, 
      { name: 'Direct', type: 'select', proxies: ['DIRECT'] },
      { name: 'Reject', type: 'select', proxies: ['REJECT'] }
    ],
    'rules': []
  };

  try {
    const generatedRulesContent = await fs.readFile(GENERATED_RULES_PATH, 'utf8');
    const ruleLines = generatedRulesContent.split('\n').filter(line => line.trim() !== '');
    clashConfig.rules = ruleLines;
  } catch (error) {
    console.warn(`Could not read ${GENERATED_RULES_PATH}: ${error.message}. Proceeding with empty rules list in config.`);
  }
  
  clashConfig.rules.push('MATCH,Proxy'); 

  try {
    const yamlConfig = yaml.dump(clashConfig);
    await fs.writeFile(FINAL_CONFIG_PATH, yamlConfig, 'utf8');
    console.log(`Final Clash config generated successfully at ${FINAL_CONFIG_PATH}`);
  } catch (error) {
    console.error('Error writing final Clash config:', error);
  }
}

async function main(options = {}) { // Accept options for programmatic control
  // Command-line option parsing removed for programmatic use
  // const program = require('commander'); // Ensure commander is available if ever uncommented
  // program
  //   .option('--rules-only', 'Only fetch and process rules, do not generate final config.yaml')
  //   .parse(process.argv);
  // const cliOptions = program.opts(); 
  // const currentOptions = { ...cliOptions, ...options }; // Merge if CLI was used

  try {
    await fetchAndProcessRules();

    if (!options.rulesOnly) { // Use passed options
      await generateClashConfig();
    } else {
      console.log('Skipping final config generation as --rules-only is set.');
    }
    console.log('Config generation process finished.');
  } catch (error) {
    console.error('An unexpected error occurred during config generation process:', error);
    // process.exit(1); // Do not exit when called as a module
    throw error; // Rethrow error for the caller to handle
  }
}

// main(); // Do not autorun when imported as a module

module.exports = { generateConfig: main };