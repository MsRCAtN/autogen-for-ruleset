// tests/api.test.js

const request = require('supertest');
const app = require('../server/index'); // Path to your Express app
const fs = require('fs').promises;
const path = require('path');

describe('API Endpoints', () => {
  // Test for GET /api/status
  it('should return 200 OK and server status for /api/status with authentication', async () => {
    const response = await request(app)
      .get('/api/status')
      .auth(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'password');
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('message', 'Server is running');
    expect(response.body).toHaveProperty('adminUser');
  });

  it('should return 401 Unauthorized for /api/status without authentication', async () => {
    const response = await request(app).get('/api/status');
    expect(response.statusCode).toBe(401);
  });

  // Test for GET /api/rule-sources
  it('should return 200 OK and rule sources with authentication', async () => {
    const response = await request(app)
      .get('/api/rule-sources')
      .auth(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'password');
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true); // Expecting an array of rule sources
  });

  it('should return 401 Unauthorized for /api/rule-sources without authentication', async () => {
    const response = await request(app).get('/api/rule-sources');
    expect(response.statusCode).toBe(401);
  });

  // Test for GET /api/servers
  it('should return 200 OK and server list with authentication', async () => {
    const response = await request(app)
      .get('/api/servers')
      .auth(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'password');
    expect(response.statusCode).toBe(200);
    // Depending on your servers.json structure, adjust this check. 
    // If it can be empty, response.body might be [] or { servers: [] } etc.
    // For now, just check it's an object or array.
    expect(typeof response.body === 'object' && response.body !== null).toBe(true);
  });

  it('should return 401 Unauthorized for /api/servers without authentication', async () => {
    const response = await request(app).get('/api/servers');
    expect(response.statusCode).toBe(401);
  });

  // Test for GET /api/proxy-groups
  it('should return 200 OK and proxy groups with authentication', async () => {
    const response = await request(app)
      .get('/api/proxy-groups')
      .auth(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'password');
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true); // Expecting an array of group names
  });

  it('should return 401 Unauthorized for /api/proxy-groups without authentication', async () => {
    const response = await request(app).get('/api/proxy-groups');
    expect(response.statusCode).toBe(401);
  });

  // Test for POST /api/trigger-generation and GET /proxy-config
  describe('Config Generation Flow', () => {
    const testServersJsonPath = path.resolve(__dirname, '..', 'config', 'servers.test.json');
    const outputConfigPath = path.resolve(__dirname, '..', 'output', 'config.yaml');
    let originalServersJsonPath;

    beforeAll(() => {
      originalServersJsonPath = process.env.SERVERS_JSON_PATH;
      process.env.SERVERS_JSON_PATH = testServersJsonPath;
    });

    afterAll(() => {
      process.env.SERVERS_JSON_PATH = originalServersJsonPath;
    });

    it('should trigger generation, complete successfully, match snapshot, and allow download', async () => {
      // Step 1: Trigger generation using testServersJsonPath (via env var)
      const genResponse = await request(app)
        .post('/api/trigger-generation')
        .auth(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'password')
        .send();
      expect(genResponse.statusCode).toBe(200);
      expect(genResponse.body).toHaveProperty('message', 'Clash configuration generation triggered and completed successfully.');

      // Step 2: Verify generated config content against snapshot
      const generatedYamlContent = await fs.readFile(outputConfigPath, 'utf8');
      expect(generatedYamlContent).toMatchSnapshot();

      // Step 3: Download the generated config and verify
      const dlResponse = await request(app)
        .get('/proxy-config')
        .auth(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'password');
      expect(dlResponse.statusCode).toBe(200);
      expect(dlResponse.headers['content-type']).toMatch(/yaml|octet-stream/);
      expect(dlResponse.text.length).toBeGreaterThan(0);
      expect(dlResponse.text).toEqual(generatedYamlContent); // Downloaded content should match file content
    });

    it('should return 401 Unauthorized for /api/trigger-generation without authentication', async () => {
      const response = await request(app).post('/api/trigger-generation').send();
      expect(response.statusCode).toBe(401);
    });

    // This test will also use the testServersJsonPath due to beforeAll
    it('should return 401 Unauthorized for /proxy-config without authentication', async () => {
      // Ensure config is generated by an authenticated call so the file exists
      await request(app)
        .post('/api/trigger-generation')
        .auth(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'password')
        .send();

      const response = await request(app).get('/proxy-config');
      expect(response.statusCode).toBe(401);
    });
  });
});
