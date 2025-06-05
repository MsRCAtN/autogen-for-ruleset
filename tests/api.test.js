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

describe('CRUD /api/servers', () => {
  const TEST_SERVERS_JSON_PATH = path.resolve(__dirname, '..', 'config', 'servers.test.api.json');
  let originalServersJsonPathEnv;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'password';

  beforeEach(async () => {
    originalServersJsonPathEnv = process.env.SERVERS_JSON_PATH;
    process.env.SERVERS_JSON_PATH = TEST_SERVERS_JSON_PATH;
    // Ensure the test file is empty before each test
    try {
      await fs.writeFile(TEST_SERVERS_JSON_PATH, '', 'utf8');
    } catch (err) {
      // If directory doesn't exist, it's fine, appendFile in POST will create it or fail there
      if (err.code !== 'ENOENT') throw err;
    }
  });

  afterEach(async () => {
    process.env.SERVERS_JSON_PATH = originalServersJsonPathEnv;
    try {
      await fs.unlink(TEST_SERVERS_JSON_PATH);
    } catch (err) {
      // Ignore if the file doesn't exist (e.g., if a test failed before creating it)
      if (err.code !== 'ENOENT') console.error('Error deleting test servers file:', err);
    }
  });

  const sampleServer = {
    v: "2",
    ps: "test-server-01",
    add: "127.0.0.1",
    port: "1080",
    aid: "0",
    net: "tcp",
    type: "none",
    host: "",
    path: "",
    tls: ""
  };

  it('POST /api/servers - should add a new server successfully', async () => {
    const response = await request(app)
      .post('/api/servers')
      .auth(adminUser, adminPassword)
      .send(sampleServer);
    expect(response.statusCode).toBe(201);
    expect(response.body.message).toBe('Server added successfully.');
    expect(response.body.server).toHaveProperty('id');
    expect(response.body.server.ps).toBe(sampleServer.ps);

    // Verify file content
    const fileContent = await fs.readFile(TEST_SERVERS_JSON_PATH, 'utf8');
    const lines = fileContent.trim().split('\n');
    expect(lines.length).toBe(1);
    const savedServer = JSON.parse(lines[0]);
    expect(savedServer.id).toBe(response.body.server.id);
    expect(savedServer.ps).toBe(sampleServer.ps);
  });

  it('POST /api/servers - should fail if ps is missing', async () => {
    const { ps, ...serverWithoutPs } = sampleServer;
    const response = await request(app)
      .post('/api/servers')
      .auth(adminUser, adminPassword)
      .send(serverWithoutPs);
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain("'ps' (server name/remark) is required");
  });

  it('POST /api/servers - should fail if request body is not an object', async () => {
    const trulyInvalidJsonPayload = 'this is { not json'; // This is not a valid JSON structure
    const response = await request(app)
      .post('/api/servers')
      .auth(adminUser, adminPassword)
      .set('Content-Type', 'application/json')
      .send(trulyInvalidJsonPayload); // Send the truly invalid JSON string

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid JSON payload. Parsing failed.');
    expect(response.body).toHaveProperty('details'); // Should also have details from the original error
  });

  it('GET /api/servers - should return an empty array if no servers exist', async () => {
    const response = await request(app)
      .get('/api/servers')
      .auth(adminUser, adminPassword);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('GET /api/servers - should return servers if they exist', async () => {
    // First, add a server
    const postResponse = await request(app)
      .post('/api/servers')
      .auth(adminUser, adminPassword)
      .send(sampleServer);
    const addedServerId = postResponse.body.server.id;

    const getResponse = await request(app)
      .get('/api/servers')
      .auth(adminUser, adminPassword);
    expect(getResponse.statusCode).toBe(200);
    expect(Array.isArray(getResponse.body)).toBe(true);
    expect(getResponse.body.length).toBe(1);
    expect(getResponse.body[0].id).toBe(addedServerId);
    expect(getResponse.body[0].ps).toBe(sampleServer.ps);
  });

  describe('Operations on an existing server', () => {
    let existingServerId;
    let initialServerData;

    beforeEach(async () => {
      // Add a server to operate on
      const response = await request(app)
        .post('/api/servers')
        .auth(adminUser, adminPassword)
        .send(sampleServer);
      initialServerData = response.body.server;
      existingServerId = initialServerData.id;
    });

    it('PUT /api/servers/:id - should update an existing server successfully', async () => {
      const updatedServerData = { ...initialServerData, ps: 'updated-server-name', add: '192.168.1.1' };
      // Remove id from payload as it's in URL, though our backend handles it if present
      delete updatedServerData.id; 

      const response = await request(app)
        .put(`/api/servers/${existingServerId}`)
        .auth(adminUser, adminPassword)
        .send(updatedServerData);
      expect(response.statusCode).toBe(200);
      expect(response.body.message).toBe('Server updated successfully.');
      expect(response.body.server.id).toBe(existingServerId);
      expect(response.body.server.ps).toBe('updated-server-name');
      expect(response.body.server.add).toBe('192.168.1.1');

      // Verify file content
      const fileContent = await fs.readFile(TEST_SERVERS_JSON_PATH, 'utf8');
      const lines = fileContent.trim().split('\n');
      expect(lines.length).toBe(1);
      const savedServer = JSON.parse(lines[0]);
      expect(savedServer.id).toBe(existingServerId);
      expect(savedServer.ps).toBe('updated-server-name');
    });

    it('PUT /api/servers/:id - should fail to update if ps is missing', async () => {
      const { ps, ...updatedDataWithoutPs } = { ...initialServerData, add: '192.168.1.100' }; 
      const response = await request(app)
        .put(`/api/servers/${existingServerId}`)
        .auth(adminUser, adminPassword)
        .send(updatedDataWithoutPs);
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toContain("'ps' (server name/remark) is required");
    });

    it('PUT /api/servers/:id - should return 404 if server ID does not exist', async () => {
      const nonExistentId = 'non-existent-uuid';
      const response = await request(app)
        .put(`/api/servers/${nonExistentId}`)
        .auth(adminUser, adminPassword)
        .send({ ...sampleServer, ps: 'updated-ps-for-non-existent' });
      expect(response.statusCode).toBe(404);
    });

    it('DELETE /api/servers/:id - should delete an existing server successfully', async () => {
      const response = await request(app)
        .delete(`/api/servers/${existingServerId}`)
        .auth(adminUser, adminPassword);
      expect(response.statusCode).toBe(200);
      expect(response.body.message).toBe(`Server with id '${existingServerId}' deleted successfully.`);

      // Verify file content (should be empty or server removed)
      const fileContent = await fs.readFile(TEST_SERVERS_JSON_PATH, 'utf8');
      expect(fileContent.trim()).toBe(''); // Or check that the specific server is gone if other servers could exist
    });

    it('DELETE /api/servers/:id - should return 404 if server ID does not exist', async () => {
      const nonExistentId = 'non-existent-uuid';
      const response = await request(app)
        .delete(`/api/servers/${nonExistentId}`)
        .auth(adminUser, adminPassword);
      expect(response.statusCode).toBe(404);
    });
  });
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
