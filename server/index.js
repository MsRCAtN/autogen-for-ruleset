// server/index.js - Express server for API and frontend hosting

const express = require('express');
const fs = require('fs').promises; // Use promise-based fs for async operations
const path = require('path');
const yaml = require('js-yaml'); // Added for YAML parsing

// --- Dotenv Configuration ---
// Explicitly load .env from the project root.
// server/index.js is in the 'server/' directory, so we go one level up.
const envPath = path.resolve(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });
// --- End Dotenv Configuration ---

const basicAuth = require('express-basic-auth');
// const { Octokit } = require('@octokit/rest'); // For GitHub API interactions (No longer used for file commits)
const crypto = require('crypto'); // For key generation if needed, not for secret encryption here
const { exec: execCallback } = require('child_process');
const util = require('util');
const exec = util.promisify(execCallback);
const { generateConfig } = require('./generateConfig'); // Corrected import name

// Attempt to load libsodium-wrappers for GitHub secret encryption
let sodium;
try {
  // sodium = require('libsodium-wrappers'); // No longer needed for servers.json
} catch (e) {
  // console.warn('libsodium-wrappers not found. GitHub Secret encryption for servers will not be fully secure. Please install libsodium-wrappers.');
  sodium = null; // Ensure sodium is defined
}

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const RULE_SOURCES_PATH = path.join(__dirname, '..', 'config', 'rule-sources.json');

// --- Configuration ---
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password'; // CHANGE THIS!

const users = { [ADMIN_USERNAME]: ADMIN_PASSWORD };

// const GITHUB_TOKEN = process.env.GH_PAT; 
// const GITHUB_OWNER = process.env.GITHUB_OWNER; 
// const GITHUB_REPO = process.env.GITHUB_REPO; 

// let octokitInstance;
// if (GITHUB_TOKEN) {
//   octokitInstance = new Octokit({ auth: GITHUB_TOKEN });
// } else {
//   console.warn(
//     'GH_PAT, GITHUB_OWNER, GITHUB_REPO env vars are not set. GitHub file commit integration is disabled.'
//   );
// }

const SERVERS_JSON_PATH = path.join(__dirname, '..', 'config', 'servers.json'); 
const OUTPUT_CONFIG_PATH = path.join(__dirname, '..', 'output', 'config.yaml');
// const FRONTEND_PATH = path.join(__dirname, '..', 'frontend'); // Old frontend path, no longer used
const SERVER_PACKAGE_JSON_PATH = path.join(__dirname, 'package.json');

// --- Middleware ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(PUBLIC_DIR));

// app.use(express.static(FRONTEND_PATH)); // Old frontend static serving, replaced by PUBLIC_DIR

const protectRoute = basicAuth({
  users: users,
  challenge: true,
  realm: 'AdminArea',
});

const basicAuthMiddleware = protectRoute;

// --- API Endpoints ---
app.get('/api/status', (req, res) => {
  res.json({ 
    message: 'Server is running',
    githubIntegration: false, // GitHub file commit integration is now removed
    adminUser: ADMIN_USERNAME 
  });
});

app.get('/api/rule-sources', basicAuthMiddleware, async (req, res) => {
  try {
    const data = await fs.readFile(RULE_SOURCES_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading rule-sources.json:', error);
    res.status(500).json({ error: 'Failed to read rule sources file.' });
  }
});

app.post('/api/rule-sources', basicAuthMiddleware, async (req, res) => {
  try {
    const newRuleSources = req.body;
    if (!Array.isArray(newRuleSources)) {
      return res.status(400).json({ error: 'Invalid data format. Expected an array.' });
    }
    const newContent = JSON.stringify(newRuleSources, null, 2);
    await fs.writeFile(RULE_SOURCES_PATH, newContent, 'utf8');
    res.json({ message: 'Rule sources updated successfully.' }); // Only save, no auto-generation
  } catch (error) {
    console.error('Error writing rule-sources.json:', error);
    res.status(500).json({ error: 'Failed to update rule sources.' });
  }
});

app.get('/api/servers', basicAuthMiddleware, async (req, res) => {
  try {
    const data = await fs.readFile(SERVERS_JSON_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // If file doesn't exist, return an empty array or default structure
      res.json([]); // Or provide a default structure like { servers: [] }
    } else {
      console.error('Error reading servers.json:', error);
      res.status(500).json({ error: 'Failed to read servers configuration file.' });
    }
  }
});

app.post('/api/servers', basicAuthMiddleware, express.text({ type: 'text/plain', limit: '10mb' }), async (req, res) => {
  try {
    const serversDataString = req.body; // req.body is now the raw text string
    if (typeof serversDataString !== 'string' || serversDataString.trim() === '') {
        return res.status(400).json({ error: 'Invalid data format for servers. Expected non-empty plain text.' });
    }
    // Directly write the received string to the file
    await fs.writeFile(SERVERS_JSON_PATH, serversDataString, 'utf8');
    
    res.json({ message: 'Servers configuration updated locally.' });
  } catch (error) {
    console.error('Error writing servers.json:', error);
    res.status(500).json({ error: 'Failed to update servers configuration.' });
  }
});

app.get('/api/proxy-groups', basicAuthMiddleware, async (req, res) => {
    const templatePath = path.join(__dirname, '../config/config.template.yaml');
    try {
        const fileContent = await fs.readFile(templatePath, 'utf8');
        const config = yaml.load(fileContent);
        if (config && Array.isArray(config['proxy-groups'])) {
            const groupNames = config['proxy-groups'].map(group => group.name).filter(name => name);
            // Also include standard policies that are not groups
            const standardPolicies = ['Direct', 'Reject']; // These are common and might not be in proxy-groups
            const allPolicies = Array.from(new Set([...standardPolicies, ...groupNames]));
            res.json(allPolicies);
        } else {
            // Fallback if proxy-groups are not found or not in expected format
            res.json(['Direct', 'Proxy', 'Reject']); 
        }
    } catch (error) {
        console.error('Error fetching proxy groups:', error);
        // Fallback if file reading or parsing fails
        res.status(500).json({ message: 'Error fetching proxy groups', details: error.message, fallback_policies: ['Direct', 'Proxy', 'Reject'] });
    }
});

app.post('/api/trigger-generation', basicAuthMiddleware, async (req, res) => {
  console.log('Received request to trigger config generation.');
  try {
    // Using the imported generateConfig function (which was 'main' in generateConfig.js)
    await generateConfig(); 
    res.json({ message: 'Clash configuration generation triggered and completed successfully.' });
  } catch (error) {
    console.error('Error during triggered config generation:', error);
    res.status(500).json({ error: 'Failed to generate Clash configuration.', details: error.message });
  }
});

app.get('/proxy-config', protectRoute, (req, res) => {
  res.sendFile(OUTPUT_CONFIG_PATH, (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.status(404).send('Config file not found. Please generate it first or check path.');
      } else {
        console.error('Error sending config file:', err);
        res.status(500).send('Error serving the config file.');
      }
    }
  });
});

app.post('/api/config/save', protectRoute, async (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Invalid content. Expected a string.' });
    }
    try {
        await fs.writeFile(OUTPUT_CONFIG_PATH, content, 'utf8');
        res.json({ message: 'Config.yaml saved locally.' });
    } catch (error) {
        console.error('Error saving or committing config.yaml:', error);
        res.status(500).json({ error: 'Failed to save config.yaml.' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Admin UI: http://localhost:${PORT}`);
  console.log(`Credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD} (Ensure these are changed and secured, preferably via ENV variables)`);
  // if (!sodium) { // No longer needed for servers.json
    // console.warn('For secure GitHub secret updates for servers.json, please install libsodium-wrappers: npm install libsodium-wrappers');
  // }
});
