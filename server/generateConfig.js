#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const yaml = require('js-yaml');
const { program } = require('commander');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');

const SERVERS_JSON_PATH = path.join(CONFIG_DIR, 'servers.json');
const RULE_SOURCES_JSON_PATH = path.join(CONFIG_DIR, 'rule-sources.json');
const GENERATED_RULES_TXT_PATH = path.join(OUTPUT_DIR, 'generated_rules.txt');
const OUTPUT_CONFIG_YAML_PATH = path.join(OUTPUT_DIR, 'config.yaml');

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

// Function to fetch rules from URLs and merge them
async function fetchAndProcessRules() {
  console.log('Fetching and processing rule sources...');
  let ruleSources = [];
  try {
    const ruleSourcesData = await fs.readFile(RULE_SOURCES_JSON_PATH, 'utf8');
    ruleSources = JSON.parse(ruleSourcesData);
  } catch (error) {
    console.error(`Error reading rule sources file (${RULE_SOURCES_JSON_PATH}):`, error.message);
    console.log('Proceeding with an empty rule set.');
    ruleSources = [];
  }

  const enabledRuleSources = ruleSources.filter(source => source.enabled && source.url);
  if (enabledRuleSources.length === 0) {
    console.log('No enabled rule sources found. Writing empty generated_rules.txt.');
    await ensureDirectoryExists(OUTPUT_DIR);
    await fs.writeFile(GENERATED_RULES_TXT_PATH, '', 'utf8');
    console.log(`Wrote empty rules to ${GENERATED_RULES_TXT_PATH}`);
    return;
  }

  let allRulesContent = [];
  for (const source of enabledRuleSources) {
    try {
      console.log(`Fetching rules from: ${source.name} (${source.url})`);
      const response = await axios.get(source.url, { timeout: 15000 }); // 15 seconds timeout
      if (response.data && typeof response.data === 'string') {
        // Add a comment indicating the source of the rules
        allRulesContent.push(`# Rules from: ${source.name} (${source.url})`);
        allRulesContent.push(...response.data.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#')));
        allRulesContent.push(''); // Add a blank line for separation
      } else {
        console.warn(`Warning: No data or invalid data format from ${source.url}`);
      }
    } catch (error) {
      console.error(`Error fetching rules from ${source.url}:`, error.message);
    }
  }

  await ensureDirectoryExists(OUTPUT_DIR);
  await fs.writeFile(GENERATED_RULES_TXT_PATH, allRulesContent.join('\n'), 'utf8');
  console.log(`Successfully wrote merged rules to ${GENERATED_RULES_TXT_PATH}`);
}

// Function to generate the final Clash config.yaml
async function generateClashConfig() {
  console.log('Generating final Clash config.yaml...');

  let serversConfig = [];
  try {
    const serversData = await fs.readFile(SERVERS_JSON_PATH, 'utf8');
    serversConfig = JSON.parse(serversData);
    if (!Array.isArray(serversConfig)) {
        console.error(`Error: ${SERVERS_JSON_PATH} is not a valid JSON array. Using empty proxy list.`);
        serversConfig = [];
    }
  } catch (error) {
    console.error(`Error reading servers config file (${SERVERS_JSON_PATH}):`, error.message);
    console.log('Proceeding with an empty proxy list.');
  }

  let rulesList = [];
  try {
    const rulesData = await fs.readFile(GENERATED_RULES_TXT_PATH, 'utf8');
    rulesList = rulesData.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  } catch (error) {
    console.error(`Error reading generated rules file (${GENERATED_RULES_TXT_PATH}):`, error.message);
    console.log('Proceeding with an empty rule list. Run with --rules-only first if needed.');
  }

  const proxyNames = serversConfig.map(p => p.name);

  const clashConfig = {
    'port': 7890,
    'socks-port': 7891,
    'allow-lan': false,
    'mode': 'rule',
    'log-level': 'info',
    'external-controller': '0.0.0.0:9090',
    'dns': {
        'enable': true,
        'listen': '0.0.0.0:53',
        'default-nameserver': ['8.8.8.8', '1.1.1.1'],
        'enhanced-mode': 'fake-ip',
        'fake-ip-range': '198.18.0.1/16',
        'nameserver': ['8.8.8.8', '1.1.1.1'],
        'fallback': []
    },
    'proxies': serversConfig.length > 0 ? serversConfig : [],
    'proxy-groups': [
      {
        'name': '🚀 Proxy',
        'type': 'select',
        'proxies': proxyNames.length > 0 ? [...proxyNames, 'DIRECT'] : ['DIRECT']
      },
      {
        'name': '🎯 DIRECT',
        'type': 'select',
        'proxies': ['DIRECT']
      },
      {
        'name': '🛑 REJECT',
        'type': 'select',
        'proxies': ['REJECT']
      }
      // Add more complex groups as needed, e.g., for specific regions or fallback
    ],
    'rules': rulesList.length > 0 ? rulesList : [
        'MATCH,🚀 Proxy' // Default rule if no rules are loaded
    ]
  };

  try {
    await ensureDirectoryExists(OUTPUT_DIR);
    const yamlString = yaml.dump(clashConfig, { indent: 2, noArrayIndent: true });
    await fs.writeFile(OUTPUT_CONFIG_YAML_PATH, yamlString, 'utf8');
    console.log(`Successfully generated Clash config at ${OUTPUT_CONFIG_YAML_PATH}`);
  } catch (error) {
    console.error('Error writing final config.yaml:', error.message);
  }
}

async function main() {
  program
    .option('--rules-only', 'Fetch and process rule sources only, output to generated_rules.txt')
    .parse(process.argv);

  const options = program.opts();

  try {
    await ensureDirectoryExists(CONFIG_DIR);
    await ensureDirectoryExists(OUTPUT_DIR);

    if (options.rulesOnly) {
      await fetchAndProcessRules();
    } else {
      // If not --rules-only, we assume generated_rules.txt might need to be created or updated first,
      // then proceed to generate the full config.
      // For a cron job, you might run '--rules-only' first, then run without it.
      // Or, if running manually without --rules-only, ensure generated_rules.txt is up-to-date.
      console.log('Full config generation mode: ensuring rules are processed first...');
      await fetchAndProcessRules(); // Always process rules before generating full config
      await generateClashConfig();
    }
    console.log('Script finished.');
  } catch (error) {
    console.error('An unexpected error occurred:', error);
    process.exit(1);
  }
}

main();
