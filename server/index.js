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
const { v4: uuidv4 } = require('uuid');

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

// const SERVERS_JSON_PATH = path.join(__dirname, '..', 'config', 'servers.json'); // Replaced by getServersJsonPath() 
const OUTPUT_CONFIG_PATH = path.join(__dirname, '..', 'output', 'config.yaml');
// const FRONTEND_PATH = path.join(__dirname, '..', 'frontend'); // Old frontend path, no longer used
const SERVER_PACKAGE_JSON_PATH = path.join(__dirname, 'package.json');

// Helper function to get the path to servers.json, prioritizing environment variable
const getServersJsonPath = () => {
  return process.env.SERVERS_JSON_PATH || path.join(__dirname, '..', 'config', 'servers.json');
};

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
app.get('/api/status', basicAuthMiddleware, (req, res) => {
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
  const serversPath = getServersJsonPath();
  try {
    const fileContent = await fs.readFile(serversPath, 'utf8');
    const lines = fileContent.split('\n');
    const servers = lines
      .map(line => line.trim())
      .filter(line => line)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (parseError) {
          console.warn(`Skipping invalid JSON line in ${serversPath}: ${line.substring(0,100)}...`, parseError.message);
          return null;
        }
      })
      .filter(server => server !== null);
    res.json(servers);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json([]); // File not found, return empty array
    } else {
      console.error(`Error reading ${serversPath}:`, error);
      res.status(500).json({ error: `Failed to read servers configuration file from ${serversPath}.` });
    }
  }
});

const handleJsonParsingError = (err, req, res, next) => {
  // Check for common body-parser (used by express.json) parsing error type
  if (err.type === 'entity.parse.failed' && err instanceof SyntaxError) {
    console.error(`[JSON Parse Error] ${req.method} ${req.path}: ${err.message}`);
    return res.status(400).json({
      error: 'Invalid JSON payload. Parsing failed.', // This is the message our test expects
      details: err.message,
      type: err.type
    });
  }
  next(err);
};

app.post('/api/servers',
  basicAuthMiddleware,
  express.json({ strict: false }), // 首先尝试解析 JSON
  // handleJsonParsingError, // Removed from here, will be registered globally
  async (req, res) => { // For adding a single server
  const serversPath = getServersJsonPath();
  try {
    const newServerConfig = req.body;

    // Basic validation for the new server object
    if (typeof newServerConfig !== 'object' || newServerConfig === null) {
      return res.status(400).json({ error: 'Invalid server data. Expected a JSON object.' });
    }
    if (!newServerConfig.ps || typeof newServerConfig.ps !== 'string') {
      // 'ps' (remarks/name) is a common and important field in V2RayN configs
      return res.status(400).json({ error: "Invalid server data. 'ps' (server name/remark) is required and must be a string." });
    }
    // Add other V2RayN specific validations if necessary (e.g., address, port)

    newServerConfig.id = uuidv4(); // Assign a unique ID

    const newServerJsonLine = JSON.stringify(newServerConfig) + '\n';

    await fs.appendFile(serversPath, newServerJsonLine, 'utf8');
    
    res.status(201).json({ message: 'Server added successfully.', server: newServerConfig });
  } catch (error) {
    console.error(`Error appending to ${serversPath}:`, error);
    res.status(500).json({ error: `Failed to add server to ${serversPath}.` });
  }
});

app.put('/api/servers/:id', basicAuthMiddleware, express.json({ strict: false }), async (req, res) => {
  const serversPath = getServersJsonPath();
  const serverIdToUpdate = req.params.id;
  const updatedServerConfig = req.body;

  // Basic validation for the updated server object
  if (typeof updatedServerConfig !== 'object' || updatedServerConfig === null) {
    return res.status(400).json({ error: 'Invalid server data. Expected a JSON object.' });
  }
  if (!updatedServerConfig.ps || typeof updatedServerConfig.ps !== 'string') {
    return res.status(400).json({ error: "Invalid server data. 'ps' (server name/remark) is required and must be a string." });
  }
  // Ensure the ID in the body, if present, matches the ID in the URL, or set it.
  updatedServerConfig.id = serverIdToUpdate;

  try {
    let fileContent;
    try {
      fileContent = await fs.readFile(serversPath, 'utf8');
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        // File doesn't exist, so the server to update cannot exist.
        return res.status(404).json({ error: `Server with id '${serverIdToUpdate}' not found.` });
      }
      throw readError; // Re-throw other read errors
    }

    const lines = fileContent.split('\n');
    let serverFound = false;
    const updatedLines = lines
      .map(line => line.trim())
      .filter(line => line)
      .map(line => {
        try {
          const server = JSON.parse(line);
          if (server.id === serverIdToUpdate) {
            serverFound = true;
            return JSON.stringify(updatedServerConfig); // Replace with updated config
          }
          return JSON.stringify(server); // Keep original if no ID match
        } catch (parseError) {
          console.warn(`Skipping invalid JSON line during update in ${serversPath}: ${line.substring(0,100)}...`, parseError.message);
          return null; // Skip malformed lines by not returning them, or return original line if preferred
        }
      })
      .filter(line => line !== null); // Remove lines that failed to parse or were explicitly nulled

    if (!serverFound) {
      return res.status(404).json({ error: `Server with id '${serverIdToUpdate}' not found.` });
    }

    // Join with newline, and ensure a trailing newline if there's content
    const newFileContent = updatedLines.length > 0 ? updatedLines.join('\n') + '\n' : '';
    await fs.writeFile(serversPath, newFileContent, 'utf8');

    res.json({ message: 'Server updated successfully.', server: updatedServerConfig });
  } catch (error) {
    console.error(`Error updating server in ${serversPath}:`, error);
    res.status(500).json({ error: `Failed to update server in ${serversPath}.` });
  }
});

app.delete('/api/servers/:id', basicAuthMiddleware, async (req, res) => {
  const serversPath = getServersJsonPath();
  const serverIdToDelete = req.params.id;

  try {
    let fileContent;
    try {
      fileContent = await fs.readFile(serversPath, 'utf8');
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        // File doesn't exist, so the server to delete cannot exist.
        return res.status(404).json({ error: `Server with id '${serverIdToDelete}' not found.` });
      }
      throw readError; // Re-throw other read errors
    }

    const lines = fileContent.split('\n');
    let serverFound = false;
    const remainingLines = lines
      .map(line => line.trim())
      .filter(line => line) // Remove empty lines
      .filter(line => { // Filter out the server to delete
        try {
          const server = JSON.parse(line);
          if (server.id === serverIdToDelete) {
            serverFound = true;
            return false; // Exclude this server
          }
          return true; // Keep this server
        } catch (parseError) {
          console.warn(`Skipping invalid JSON line during delete in ${serversPath}: ${line.substring(0,100)}...`, parseError.message);
          return true; // Keep malformed lines by default, or decide to filter them by returning false
        }
      });

    if (!serverFound) {
      return res.status(404).json({ error: `Server with id '${serverIdToDelete}' not found.` });
    }

    // Join with newline, and ensure a trailing newline if there's content
    const newFileContent = remainingLines.length > 0 ? remainingLines.join('\n') + '\n' : '';
    await fs.writeFile(serversPath, newFileContent, 'utf8');

    res.json({ message: `Server with id '${serverIdToDelete}' deleted successfully.` });
  } catch (error) {
    console.error(`Error deleting server in ${serversPath}:`, error);
    res.status(500).json({ error: `Failed to delete server in ${serversPath}.` });
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

// REMOVED: app.post('/api/config/save', protectRoute, async (req, res) => {
/*
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
*/

app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// --- Server Startup ---
// Start the server only if this script is run directly (not required as a module)
if (require.main === module) {
  app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Admin UI: http://localhost:${PORT}`);
  console.log(`Credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD} (Ensure these are changed and secured, preferably via ENV variables)`);
  // if (!sodium) { // No longer needed for servers.json
    // console.warn('For secure GitHub secret updates for servers.json, please install libsodium-wrappers: npm install libsodium-wrappers');
  // }
  });
}

// Export the app instance for testing or other programmatic use
// module.exports = app; // Comment out if final error handler is below

// Register custom error handlers before the final generic one
app.use(handleJsonParsingError); // Our custom JSON parsing error handler

// Ensure there's a final, generic error handler for the app
// This should be placed AFTER all your routes and other middleware
app.use((err, req, res, next) => {
  console.error(`[Unhandled Error] ${req.method} ${req.path}:`, err.message, err.stack ? `\n${err.stack}` : '');
  if (res.headersSent) {
    // If headers already sent, delegate to the default Express error handler
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    type: err.type, // Include type if available from body-parser errors
    // Optionally, include stack in development
    // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

module.exports = app;
