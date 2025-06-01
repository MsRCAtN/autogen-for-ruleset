// server/generateConfig.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const yaml = require('js-yaml');
const { program } = require('commander');

// --- Helper Functions ---
async function fetchRemoteRules(url) {
  try {
    const response = await axios.get(url, { timeout: 15000 });
    return response.data.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'));
  } catch (error) {
    console.error(`Error fetching rules from ${url}: ${error.message}`);
    return [];
  }
}

function processRule(rawRule, ruleType, proxyGroupName) {
  // Example rawRule: DOMAIN-SUFFIX,google.com,PROXY
  // or RULE-SET,https://example.com/rules.list,PROXY
  const parts = rawRule.split(',');
  if (parts.length < 2) return rawRule; // Not a standard rule format, keep as is

  const policy = parts.pop().trim().toUpperCase(); // Original policy
  let newPolicy = '';

  switch (ruleType) {
    case 'PROXY':
      newPolicy = proxyGroupName; // Points to the main group of user's servers
      break;
    case 'BLOCK':
      newPolicy = 'REJECT';
      break;
    case 'DIRECT':
      newPolicy = 'DIRECT';
      break;
    default:
      newPolicy = policy; // If unknown type, keep original policy from rule source
  }
  return `${parts.join(',')},${newPolicy}`;
}

// --- Main Generation Logic ---
async function generateConfig(options) {
  console.log('Starting Clash config generation with options:', options);

  // 4. Load and Process Rule Sources (Common to both modes or done first for rules-only)
  let ruleSources = [];
  try {
    ruleSources = JSON.parse(fs.readFileSync(options.rules_file, 'utf8'));
    if (!Array.isArray(ruleSources)) throw new Error('Rule-sources.json should be an array.');
  } catch (error) {
    console.error(`Error loading or parsing rule sources file (${options.rules_file}): ${error.message}`);
    process.exit(1);
  }

  let allProcessedRules = [];
  const userProxyGroupName = 'USER_PROXIES'; // Used in full config mode
  const placeholderProxyGroup = 'USER_SPECIFIED_PROXY_GROUP'; // Potentially for rules-only if needed

  if (!options.rulesOnly && options.processedRulesFile) {
    console.log(`Loading pre-processed rules from ${options.processedRulesFile}...`);
    try {
      const rawRulesContent = fs.readFileSync(options.processedRulesFile, 'utf8');
      allProcessedRules = rawRulesContent.split(/\r?\n/).filter(line => line.trim());
      console.log(`Loaded ${allProcessedRules.length} pre-processed rules.`);
    } catch (error) {
      console.error(`Error loading processed rules file (${options.processedRulesFile}): ${error.message}`);
      process.exit(1);
    }
  } else if (options.rulesFile) { // Process rules_file if rulesOnly or processedRulesFile not given in full mode
    console.log(`Processing rule sources from ${options.rulesFile}...`);
    for (const source of ruleSources) {
      if (source.enabled) {
        console.log(`Fetching rules from ${source.name} (${source.url}) of type ${source.type}...`);
        const remoteRules = await fetchRemoteRules(source.url);
        remoteRules.forEach(rawRule => {
          // Determine which proxy group name to use for processRule
          const groupNameToUse = options.rulesOnly ? placeholderProxyGroup : userProxyGroupName;
          allProcessedRules.push(processRule(rawRule, source.type, groupNameToUse));
        });
        console.log(`Added ${remoteRules.length} rules from ${source.name}.`);
      }
    }
    console.log(`Total processed rules from sources: ${allProcessedRules.length}.`);
  } else if (!options.rulesOnly) {
    // Full config mode but neither rules_file nor processed_rules_file provided
    console.error('Error: For full config generation, either --rules_file or --processed_rules_file must be provided.');
    process.exit(1);
  }

  if (options.rulesOnly) {
    // --- Rules-Only Mode --- 
    try {
      fs.writeFileSync(options.rulesOutputFile, allProcessedRules.join('\n'), 'utf8');
      console.log(`Successfully generated rules-only file at ${options.rulesOutputFile}`);
    } catch (error) {
      console.error(`Error writing rules-only output file (${options.rulesOutputFile}): ${error.message}`);
      process.exit(1);
    }
    return; // End execution for rules-only mode
  }

  // --- Full Config Mode (original logic continues below) ---
  

  // 1. Load Base Config
  let baseConfig;
  try {
    baseConfig = yaml.load(fs.readFileSync(options.base_file, 'utf8'));
  } catch (error) {
    console.error(`Error loading base YAML file (${options.base_file}): ${error.message}`);
    process.exit(1);
  }

  // 2. Load Servers
  let servers = [];
  try {
    servers = JSON.parse(fs.readFileSync(options.servers_file, 'utf8'));
    if (!Array.isArray(servers)) throw new Error('Servers.json should be an array.');
  } catch (error) {
    console.error(`Error loading or parsing servers file (${options.servers_file}): ${error.message}`);
    process.exit(1);
  }
  baseConfig.proxies = servers;
  console.log(`Loaded ${servers.length} proxies.`);

  // 3. Update Proxy Groups (ensure a primary group for user servers exists)
  if (baseConfig['proxy-groups'] && Array.isArray(baseConfig['proxy-groups'])) {
    const mainProxyGroup = baseConfig['proxy-groups'].find(g => g.name === userProxyGroupName);
    if (mainProxyGroup) {
      mainProxyGroup.proxies = servers.map(s => s.name);
      console.log(`Updated '${userProxyGroupName}' with ${servers.length} server names.`);
    } else {
      console.warn(`Warning: Proxy group named '${userProxyGroupName}' not found in base.yaml. User servers might not be selectable.`);
      // Optionally, create a default group if it's missing
      baseConfig['proxy-groups'].push({
        name: userProxyGroupName,
        type: 'select',
        proxies: servers.map(s => s.name)
      });
      console.log(`Created default '${userProxyGroupName}' group.`);
    }
    // Ensure DIRECT and REJECT are available for rules if not already in groups
    if (!baseConfig['proxy-groups'].some(g => g.name === 'DIRECT')) {
        baseConfig['proxy-groups'].push({ name: 'DIRECT', type: 'select', proxies: ['DIRECT'] });
    }
    if (!baseConfig['proxy-groups'].some(g => g.name === 'REJECT')) {
        baseConfig['proxy-groups'].push({ name: 'REJECT', type: 'select', proxies: ['REJECT'] });
    }
  } else {
    console.warn('Warning: No proxy-groups array found in base.yaml. Rule processing might be affected.');
    baseConfig['proxy-groups'] = [
      { name: userProxyGroupName, type: 'select', proxies: servers.map(s => s.name) },
      { name: 'DIRECT', type: 'select', proxies: ['DIRECT'] },
      { name: 'REJECT', type: 'select', proxies: ['REJECT'] }
    ];
  }

  // Rules already processed and stored in allProcessedRules if rulesOnly was false
  // Now merge them into baseConfig
  if (baseConfig.rules && Array.isArray(baseConfig.rules)) {
    baseConfig.rules.push(...allProcessedRules); // Add rules from base.yaml first, then processed remote rules
  } else {
    baseConfig.rules = allProcessedRules;
  }
  console.log(`Total rules in config: ${baseConfig.rules.length}.`);

  // 5. Add final MATCH rule if not present (optional, base.yaml should ideally have it)
  if (!baseConfig.rules.some(rule => rule.startsWith('MATCH,'))) {
    console.log("No 'MATCH' rule found, adding 'MATCH,DIRECT' as default final rule.");
    baseConfig.rules.push('MATCH,DIRECT');
  }

  // 6. Write Output Config
  try {
    const yamlStr = yaml.dump(baseConfig, { lineWidth: 1000, sortKeys: false });
    fs.writeFileSync(options.output_file, yamlStr, 'utf8');
    console.log(`Successfully generated Clash config at ${options.output_file}`);
  } catch (error) {
    console.error(`Error writing output YAML file (${options.output_file}): ${error.message}`);
    process.exit(1);
  }
}

// --- CLI Setup ---
if (require.main === module) {
  program
    .version('1.0.0')
    .description('Generates a Clash configuration file by merging a base template, server list, and remote rule sources.')
    .option('--base_file <path>', 'Path to the base YAML config file (e.g., ./templates/base.yaml)')
    .option('--servers_file <path>', 'Path to the JSON file containing server definitions (e.g., ./config/servers.json)')
    .option('--rules_file <path>', 'Path to the JSON file defining rule sources (e.g., ./config/rule-sources.json)')
    .option('--processed_rules_file <path>', 'Path to a pre-processed text file containing rules, one per line.')
    .option('--output_file <path>', 'Path for the generated output Clash config YAML file (e.g., ./output/config.yaml)')
    .option('--rules-only', 'Only process rules from rules_file and output to rules-output-file', false)
    .option('--rules-output-file <path>', 'Path for the generated rules-only text file (e.g., ./output/generated_rules.txt)')
    .action((options) => {
      if (options.rulesOnly) {
        if (!options.rulesFile || !options.rulesOutputFile) {
          console.error('Error: --rules_file and --rules-output-file are required when --rules-only is specified.');
          process.exit(1);
        }
      } else { // Full config mode
        if (!options.baseFile || !options.serversFile || !options.outputFile) {
          console.error('Error: --base_file, --servers_file, and --output_file are required for full config generation.');
          process.exit(1);
        }
        if (!options.rulesFile && !options.processedRulesFile) {
          console.error('Error: For full config generation, either --rules_file or --processed_rules_file must be provided.');
          process.exit(1);
        }
        if (options.rulesFile && options.processedRulesFile) {
          console.error('Error: --rules_file and --processed_rules_file cannot be used simultaneously for full config generation.');
          process.exit(1);
        }
      }
      generateConfig(options);
    });

  program.parse(process.argv);
}

module.exports = { generateConfig }; // For potential programmatic use
