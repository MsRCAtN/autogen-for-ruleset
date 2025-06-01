// server/index.js - Express server for API and frontend hosting

const express = require('express');
const fs = require('fs').promises; // Use promise-based fs for async operations
const path = require('path');

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

const RULE_SOURCES_PATH = path.join(__dirname, '..', 'config', 'rule-sources.json');
const SERVERS_JSON_PATH = path.join(__dirname, '..', 'config', 'servers.json'); 
const OUTPUT_CONFIG_PATH = path.join(__dirname, '..', 'output', 'config.yaml');
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');
const SERVER_PACKAGE_JSON_PATH = path.join(__dirname, 'package.json');

// --- Middleware ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.use(express.static(FRONTEND_PATH));

const protectRoute = basicAuth({
  users: users,
  challenge: true,
  realm: 'AdminArea',
});

// --- API Endpoints ---
app.get('/api/status', (req, res) => {
  res.json({ 
    message: 'Server is running',
    githubIntegration: false, // GitHub file commit integration is now removed
    adminUser: ADMIN_USERNAME 
  });
});

app.get('/api/rule-sources', protectRoute, async (req, res) => {
  try {
    const data = await fs.readFile(RULE_SOURCES_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading rule-sources.json:', error);
    res.status(500).json({ error: 'Failed to read rule sources file.' });
  }
});

app.post('/api/rule-sources', protectRoute, async (req, res) => {
  try {
    const newRuleSources = req.body;
    if (!Array.isArray(newRuleSources)) {
      return res.status(400).json({ error: 'Invalid data format. Expected an array.' });
    }
    const newContent = JSON.stringify(newRuleSources, null, 2);
    await fs.writeFile(RULE_SOURCES_PATH, newContent, 'utf8');
    
    res.json({ message: 'Rule sources updated locally.' });
  } catch (error) {
    console.error('Error writing or committing rule-sources.json:', error);
    res.status(500).json({ error: 'Failed to update rule sources.' });
  }
});

app.get('/api/servers', protectRoute, async (req, res) => {
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

app.post('/api/servers', protectRoute, async (req, res) => {
  try {
    const serversData = req.body;
    if (!serversData) { // Basic validation
        return res.status(400).json({ error: 'Invalid data format for servers.' });
    }
    const newContent = JSON.stringify(serversData, null, 2);
    await fs.writeFile(SERVERS_JSON_PATH, newContent, 'utf8');
    
    res.json({ message: 'Servers configuration updated locally.' });
  } catch (error) {
    console.error('Error writing or committing servers.json:', error);
    res.status(500).json({ error: 'Failed to update servers configuration.' });
  }
});

app.post('/api/trigger-generation', protectRoute, async (req, res) => {
  const projectRoot = path.resolve(__dirname, '..');
  const generateScriptPath = path.join(projectRoot, 'server', 'generateConfig.js'); // Assuming script is server/generateConfig.js

  try {
    console.log('Step 1: Fetching and processing remote rule sets...');
    // Command to fetch/process rules. Adjust script name and arguments as needed.
    const { stdout: rulesStdout, stderr: rulesStderr } = await exec(`node "${generateScriptPath}" --rules-only`, { cwd: projectRoot });
    if (rulesStderr) {
      console.warn(`Rule generation script stderr (step 1): ${rulesStderr}`);
    }
    console.log(`Rule generation script stdout (step 1): ${rulesStdout}`);
    console.log('Step 1 completed.');

    console.log('Step 2: Generating final config.yaml...');
    // Command to generate final config. Adjust script name and arguments as needed.
    // This might use a flag like --processed_rules_file ./output/generated_rules.txt or similar if your script requires it.
    const { stdout: finalStdout, stderr: finalStderr } = await exec(`node "${generateScriptPath}"`, { cwd: projectRoot });
    if (finalStderr) {
      console.warn(`Config generation script stderr (step 2): ${finalStderr}`);
    }
    console.log(`Config generation script stdout (step 2): ${finalStdout}`);
    console.log('Step 2 completed. Final config.yaml should be generated.');

    res.json({ message: 'Local rule fetching and config generation process completed successfully.' });

  } catch (error) {
    console.error('Error during local config generation process:', error);
    res.status(500).json({ 
      error: 'Failed to complete local config generation process.', 
      details: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    });
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
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Admin UI: http://localhost:${PORT}`);
  console.log(`Credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD} (Ensure these are changed and secured, preferably via ENV variables)`);
  // if (!sodium) { // No longer needed for servers.json
    // console.warn('For secure GitHub secret updates for servers.json, please install libsodium-wrappers: npm install libsodium-wrappers');
  // }
});
