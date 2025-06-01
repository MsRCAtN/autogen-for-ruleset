document.addEventListener('DOMContentLoaded', () => {
    console.log('Frontend app initialized.');

    // --- State ---
    let ruleSources = [];
    let serversJsonEditor;
    let configYamlEditor;

    // --- DOM Elements ---
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    const ruleSourcesList = document.getElementById('rule-sources-list');
    const addRuleSourceBtn = document.getElementById('add-rule-source-btn');
    const ruleSourceFormContainer = document.getElementById('rule-source-form-container');
    const ruleSourceForm = document.getElementById('rule-source-form');
    const saveRuleSourceBtn = document.getElementById('save-rule-source-btn');
    const cancelRuleSourceBtn = document.getElementById('cancel-rule-source-btn');
    const saveAllRulesBtn = document.getElementById('save-all-rules-btn');
    const ruleIdInput = document.getElementById('rule-id');
    const ruleNameInput = document.getElementById('rule-name');
    const ruleUrlInput = document.getElementById('rule-url');
    const ruleTypeInput = document.getElementById('rule-type');
    const ruleEnabledInput = document.getElementById('rule-enabled');

    const serversJsonEditorEl = document.getElementById('servers-json-editor');
    const loadServersJsonBtn = document.getElementById('load-servers-json-btn');
    const saveServersJsonBtn = document.getElementById('save-servers-json-btn');

    const configYamlEditorEl = document.getElementById('config-yaml-editor');
    const loadGeneratedConfigBtn = document.getElementById('load-generated-config-btn');

    const triggerGenerationBtn = document.getElementById('trigger-generation-btn');
    const saveGeneratedConfigBtn = document.getElementById('save-generated-config-btn');
    
    const serverStatusText = document.getElementById('server-status-text');

    // --- CodeMirror Initialization ---
    function initCodeMirror() {
        serversJsonEditor = CodeMirror.fromTextArea(serversJsonEditorEl, {
            mode: { name: 'javascript', json: true },
            theme: 'material-palenight',
            lineNumbers: true,
            gutters: ['CodeMirror-lint-markers'],
            lint: true,
            matchBrackets: true,
            autoCloseBrackets: true
        });

        configYamlEditor = CodeMirror(configYamlEditorEl, {
            mode: 'yaml',
            theme: 'material-palenight',
            lineNumbers: true,
            gutters: ['CodeMirror-lint-markers'],
            lint: true
        });
    }

    // --- Tab Management ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const targetTab = tab.getAttribute('data-tab');
            tabContents.forEach(tc => {
                tc.classList.remove('active');
                if (tc.id === `${targetTab}-tab`) {
                    tc.classList.add('active');
                }
            });
        });
    });

    // --- API Helper ---
    async function apiRequest(endpoint, method = 'GET', body = null) {
        try {
            const options = {
                method,
                headers: { 'Content-Type': 'application/json' },
            };
            if (body) {
                options.body = JSON.stringify(body);
            }
            const response = await fetch(`/api${endpoint}`, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Request failed with status ' + response.status }));
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            if (response.status === 204 || method === 'DELETE') return null; // No content for DELETE or 204
            return response.json();
        } catch (error) {
            console.error(`API Error (${method} ${endpoint}):`, error);
            alert(`Error: ${error.message}`);
            throw error;
        }
    }

    // --- Rule Sources Management ---
    function renderRuleSources() {
        ruleSourcesList.innerHTML = '';
        if (!ruleSources || ruleSources.length === 0) {
            ruleSourcesList.innerHTML = '<p>No rule sources configured.</p>';
            return;
        }
        ruleSources.forEach((rule, index) => {
            const ruleDiv = document.createElement('div');
            ruleDiv.className = 'rule-source-item';
            ruleDiv.innerHTML = `
                <span><strong>${rule.name}</strong> (${rule.type}) - ${rule.url} [${rule.enabled ? 'Enabled' : 'Disabled'}]</span>
                <div>
                    <button class="edit-rule-btn" data-index="${index}">Edit</button>
                    <button class="delete-rule-btn" data-index="${index}">Delete</button>
                </div>
            `;
            ruleSourcesList.appendChild(ruleDiv);
        });

        document.querySelectorAll('.edit-rule-btn').forEach(btn => btn.addEventListener('click', handleEditRuleSource));
        document.querySelectorAll('.delete-rule-btn').forEach(btn => btn.addEventListener('click', handleDeleteRuleSource));
    }

    async function loadRuleSources() {
        try {
            const data = await apiRequest('/rule-sources');
            ruleSources = data || [];
            renderRuleSources();
        } catch (error) {
            // Error already handled by apiRequest or JSON.parse
        }
    }

    function showRuleSourceForm(rule = null, index = -1) {
        ruleIdInput.value = rule ? rule.id || Date.now().toString() : Date.now().toString(); // Simple ID generation
        ruleNameInput.value = rule ? rule.name : '';
        ruleUrlInput.value = rule ? rule.url : '';
        ruleTypeInput.value = rule ? rule.type : 'PROXY';
        ruleEnabledInput.checked = rule ? rule.enabled : true;
        saveRuleSourceBtn.dataset.index = index; // Store index for editing
        ruleSourceFormContainer.style.display = 'block';
    }

    function hideRuleSourceForm() {
        ruleSourceForm.reset();
        ruleSourceFormContainer.style.display = 'none';
    }

    addRuleSourceBtn.addEventListener('click', () => showRuleSourceForm());
    cancelRuleSourceBtn.addEventListener('click', hideRuleSourceForm);

    ruleSourceForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const ruleData = {
            id: ruleIdInput.value,
            name: ruleNameInput.value,
            url: ruleUrlInput.value,
            type: ruleTypeInput.value,
            enabled: ruleEnabledInput.checked,
        };
        const index = parseInt(saveRuleSourceBtn.dataset.index, 10);

        if (index > -1) { // Editing existing
            ruleSources[index] = ruleData;
        } else { // Adding new
            ruleSources.push(ruleData);
        }
        renderRuleSources();
        hideRuleSourceForm();
        // Note: This only updates client-side state. User needs to click "Save All Rule Sources to Server"
        alert('Rule source saved locally. Click "Save All Rule Sources to Server" to persist changes.');
    });

    function handleEditRuleSource(event) {
        const index = parseInt(event.target.dataset.index, 10);
        showRuleSourceForm(ruleSources[index], index);
    }

    function handleDeleteRuleSource(event) {
        if (!confirm('Are you sure you want to delete this rule source?')) return;
        const index = parseInt(event.target.dataset.index, 10);
        ruleSources.splice(index, 1);
        renderRuleSources();
        alert('Rule source deleted locally. Click "Save All Rule Sources to Server" to persist changes.');
    }

    saveAllRulesBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to save these rule sources to the server (config/rule-sources.json)? This will overwrite the existing file.')) {
            return;
        }
        try {
            await apiRequest('/rule-sources', 'POST', ruleSources);
            alert('Rule sources saved to server successfully!');
            loadRuleSources(); // Refresh from server
        } catch (error) {
            // Error already handled
        }
    });

    // --- Server Config (servers.json) Management ---
    loadServersJsonBtn.addEventListener('click', async () => {
        try {
            const data = await apiRequest('/servers', 'GET');
            serversJsonEditor.setValue(JSON.stringify(data, null, 2));
            alert('servers.json loaded successfully!');
        } catch (error) {
            // Error already handled by apiRequest
            // Optionally, clear editor or show specific message if load fails
            // serversJsonEditor.setValue(''); 
        }
    });

    saveServersJsonBtn.addEventListener('click', async () => {
        const serversJsonString = serversJsonEditor.getValue();
        if (!serversJsonString.trim()) {
            alert('Servers JSON content cannot be empty.');
            return;
        }
        try {
            const serversData = JSON.parse(serversJsonString);
            if (!confirm('Are you sure you want to save this server configuration to the local server (config/servers.json)?')) {
                return;
            }
            await apiRequest('/servers', 'POST', serversData);
            alert('servers.json saved to server successfully!');
        } catch (error) {
            alert('Invalid JSON format for servers configuration or API error: ' + error.message);
        }
    });

    // --- Generated Config (config.yaml) Management ---
    loadGeneratedConfigBtn.addEventListener('click', async () => {
        try {
            // The /proxy-config endpoint serves the file directly, not JSON
            const response = await fetch('/proxy-config');
            if (!response.ok) {
                throw new Error(`Failed to load config: ${response.statusText}`);
            }
            const yamlContent = await response.text();
            configYamlEditor.setValue(yamlContent);
            alert('Generated config.yaml loaded successfully.');
        } catch (error) {
            console.error('Error loading generated config:', error);
            alert(`Error loading config: ${error.message}`);
        }
    });

    triggerGenerationBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to trigger the server to fetch remote rules and regenerate config.yaml locally? This will overwrite the current generated config.yaml.')) {
            return;
        }
        try {
            await apiRequest('/trigger-generation', 'POST');
            alert('Local rule fetching and config generation process initiated on the server. The new config.yaml should be available shortly. Check server logs for details.');
        } catch (error) {
            // Error handled by apiRequest
        }
    });

    saveGeneratedConfigBtn.addEventListener('click', async () => {
        const yamlContent = configYamlEditor.getValue();
        if (!yamlContent.trim()) {
            alert('Config YAML content cannot be empty.');
            return;
        }
        if (!confirm('Are you sure you want to save this content to config.yaml on the server? This will overwrite the existing file and will be overridden by the next automatic generation if rules are processed.')) {
            return;
        }
        try {
            await apiRequest('/config/save', 'POST', { content: yamlContent });
            alert('config.yaml saved to server successfully!');
        } catch (error) {
            // Error already handled by apiRequest
        }
    });

    // --- Server Status ---
    async function checkServerStatus() {
        try {
            const data = await apiRequest('/status');
            serverStatusText.textContent = `Online (User: ${data.adminUser}, GitHub: ${data.githubIntegration ? 'Enabled' : 'Disabled'})`;
            serverStatusText.style.color = 'green';
        } catch (error) {
            serverStatusText.textContent = 'Offline or Error';
            serverStatusText.style.color = 'red';
        }
    }

    // --- Initial Load ---
    initCodeMirror();
    loadRuleSources();
    checkServerStatus();
    setInterval(checkServerStatus, 60000); // Check status every minute
});

