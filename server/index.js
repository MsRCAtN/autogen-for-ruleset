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
const { Octokit } = require('@octokit/rest'); // For GitHub API interactions
const crypto = require('crypto'); // For key generation if needed, not for secret encryption here

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

const GITHUB_TOKEN = process.env.GH_PAT; 
const GITHUB_OWNER = process.env.GITHUB_OWNER; 
const GITHUB_REPO = process.env.GITHUB_REPO; 

let octokitInstance;
if (GITHUB_TOKEN) {
  octokitInstance = new Octokit({ auth: GITHUB_TOKEN });
} else {
  console.warn(
    'GH_PAT environment variable is not set. GitHub integration will be limited.'
  );
}

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

// --- Helper: Commit file to GitHub ---
async function commitFileToGitHub(filePath, commitMessage, fileContent) {
  if (!octokitInstance || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('GitHub client or repository details not configured for committing file.');
  }
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  let sha;
  try {
    const { data } = await octokitInstance.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: relativePath,
    });
    sha = data.sha;
  } catch (error) {
    if (error.status !== 404) throw error; // Rethrow if not a 'file not found' error
    // If file doesn't exist, sha remains undefined, and createOrUpdateFileContent will create it
  }

  await octokitInstance.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: relativePath,
    message: commitMessage,
    content: Buffer.from(fileContent).toString('base64'),
    sha: sha, // Include SHA if updating an existing file
  });
  console.log(`Successfully committed '${relativePath}' to GitHub.`);
}

// --- API Endpoints ---
app.get('/api/status', (req, res) => {
  res.json({ 
    message: 'Server is running',
    githubIntegration: !!(octokitInstance && GITHUB_OWNER && GITHUB_REPO),
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
    
    if (octokitInstance && GITHUB_OWNER && GITHUB_REPO) {
      await commitFileToGitHub(RULE_SOURCES_PATH, 'feat: Update rule sources via API', newContent);
      res.json({ message: 'Rule sources updated and committed to GitHub.' });
    } else {
      res.json({ message: 'Rule sources updated locally. GitHub commit skipped (integration not configured).' });
    }
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
  if (!octokitInstance || !GITHUB_OWNER || !GITHUB_REPO) {
    return res.status(503).json({ error: 'GitHub integration not configured.' });
  }
  try {
    // Check if package.json exists in the server directory to determine workflow file name
    let workflowFileName = 'main.yml'; // Default
    try {
        await fs.access(SERVER_PACKAGE_JSON_PATH);
        // If package.json exists, it implies node environment, stick to main.yml or a specific node workflow file
    } catch (e) {
        // If no package.json, maybe it's a different kind of project setup
        // This logic might need adjustment based on actual workflow file names
    }

    console.log(`Attempting to trigger workflow: ${workflowFileName}`);
    await octokitInstance.actions.createWorkflowDispatch({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      workflow_id: workflowFileName, 
      ref: process.env.GITHUB_REF || 'main', // Default to 'main', or use current branch if available
    });
    res.json({ message: 'Workflow dispatch triggered successfully.' });
  } catch (error) {
    console.error('Error triggering workflow dispatch:', error);
    res.status(500).json({ error: 'Failed to trigger workflow dispatch.' });
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
        // Optionally commit this manual override to GitHub
        if (octokitInstance && GITHUB_OWNER && GITHUB_REPO) {
            await commitFileToGitHub(OUTPUT_CONFIG_PATH, 'feat: Manually update and save config.yaml via API', content);
            res.json({ message: 'Config.yaml saved and committed to GitHub.' });
        } else {
            res.json({ message: 'Config.yaml saved locally. GitHub commit skipped.' });
        }
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
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.warn('Set GH_PAT, GITHUB_OWNER, GITHUB_REPO env vars for full GitHub integration.');
  }
  // if (!sodium) { // No longer needed for servers.json
    // console.warn('For secure GitHub secret updates for servers.json, please install libsodium-wrappers: npm install libsodium-wrappers');
  // }
});
