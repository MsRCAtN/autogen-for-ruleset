document.addEventListener('DOMContentLoaded', async function() {
    console.log('Frontend script loaded.');
    M.AutoInit(); // Initialize all Materialize components

    await fetchRuleSources(); // Initial fetch, ensure it completes before attaching save listener

    const saveButton = document.getElementById('save-rule-sources');
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            if (saveButton.classList.contains('disabled')) return; // Prevent saving if no changes

            const updatedRuleSources = [];
            const ruleSourceElements = document.querySelectorAll('#rule-sources-container .row');

            ruleSourceElements.forEach((element, index) => {
                const originalSource = currentRuleSources[index]; // Assuming currentRuleSources is globally available and matches rendered order
                if (!originalSource) {
                    console.error(`Could not find original source for index ${index}`);
                    return;
                }

                const enabledCheckbox = element.querySelector(`#enabled-${index}`);
                const targetPolicySelect = element.querySelector(`#targetPolicy-${index}`);

                if (!enabledCheckbox || !targetPolicySelect) {
                    console.error(`Could not find UI elements for rule source at index ${index}`);
                    return;
                }

                updatedRuleSources.push({
                    ...originalSource, // Preserve id, name, url, ruleType
                    enabled: enabledCheckbox.checked,
                    targetPolicy: targetPolicySelect.value
                });
            });

            if (updatedRuleSources.length !== currentRuleSources.length) {
                console.error('Mismatch in updated rule sources count. Aborting save.');
                M.toast({html: 'Error preparing data for saving. Please check console.'});
                return;
            }

            try {
                console.log('Attempting to save rule sources with data:', updatedRuleSources);
                const response = await fetch('/api/rule-sources', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // Add Authorization header if your API is protected
                        'Authorization': 'Basic ' + btoa('admin:password') // Example for Basic Auth
                    },
                    body: JSON.stringify(updatedRuleSources)
                });

                console.log('Fetch response received. Status:', response.status, 'Ok:', response.ok);
                if (!response.ok) {
                    let errorData = { message: `HTTP error! Status: ${response.status}` };
                    try {
                        errorData = await response.json(); // Try to parse error response body
                    } catch (e) {
                        console.warn('Could not parse error response as JSON.');
                    }
                    throw new Error(errorData.message || `Failed to save with status ${response.status}`);
                }

                currentRuleSources = updatedRuleSources; // Update global state
                M.toast({html: 'Rule sources saved successfully!'});
                saveButton.classList.add('disabled'); // Disable button after save
                // Optionally, re-fetch or re-render to confirm changes from server side
                // await fetchRuleSources(); 
            } catch (error) {
                console.error('Failed to save rule sources (in catch block):', error);
                M.toast({html: `Failed to save rule sources: ${error.message}`});
            }
        });

        // Add event listeners to inputs/selects to enable save button on change
        const ruleSourcesContainer = document.getElementById('rule-sources-container');
        if (ruleSourcesContainer) {
            ruleSourcesContainer.addEventListener('change', (event) => {
                if (event.target.tagName === 'SELECT' || (event.target.tagName === 'INPUT' && event.target.type === 'checkbox')) {
                    if (saveButton.classList.contains('disabled')) {
                        saveButton.classList.remove('disabled');
                    }
                }
            });
        }

    } else {
        console.error('Save button not found');
    }

    const generateButton = document.getElementById('generate-config-button');
    if (generateButton) {
        generateButton.addEventListener('click', async () => {
            M.toast({html: 'Configuration generation started...', displayLength: 2000});
            try {
                const response = await fetch('/api/trigger-generation', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Basic ' + btoa('admin:password') // Ensure this matches your backend credentials
                    }
                });
                const result = await response.json(); // Try to parse JSON regardless of ok status for more info
                if (!response.ok) {
                    throw new Error(result.message || result.details || `HTTP error! Status: ${response.status}`);
                }
                M.toast({html: result.message || 'Configuration generated successfully!', classes: 'green'});
            } catch (error) {
                console.error('Failed to trigger configuration generation:', error);
                M.toast({html: `Generation failed: ${error.message}`, classes: 'red'});
            }
        });
    } else {
        console.error('Generate Configuration button not found');
    }
});

let currentRuleSources = [];

let availableProxyGroups = ['Direct', 'Proxy', 'Reject']; // Default fallback

async function fetchProxyGroups() {
    try {
        const response = await fetch('/api/proxy-groups');
        if (!response.ok) {
            console.warn(`Failed to fetch proxy groups, status: ${response.status}. Using fallback.`);
            // Attempt to get fallback_policies from error response if available
            try {
                const errorData = await response.json();
                if (errorData && errorData.fallback_policies) {
                    availableProxyGroups = errorData.fallback_policies;
                    return; 
                }
            } catch (e) { /* ignore json parsing error if no body or not json */ }
            return; // Keep default fallback if no specific fallback provided
        }
        const groups = await response.json();
        if (Array.isArray(groups) && groups.length > 0) {
            availableProxyGroups = groups;
        } else {
            console.warn('Proxy groups response was empty or not an array. Using fallback.');
        }
    } catch (error) {
        console.error('Error fetching proxy groups:', error, '. Using fallback.');
    }
}

async function fetchRuleSources() {
    const container = document.getElementById('rule-sources-container');
    // Fetch proxy groups first to populate dropdowns correctly
    await fetchProxyGroups(); 

    try {
        const response = await fetch('/api/rule-sources');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        currentRuleSources = await response.json();
        renderRuleSources(currentRuleSources); // Now render with potentially updated availableProxyGroups
        document.getElementById('save-rule-sources').classList.add('disabled');
    } catch (error) {
        console.error('Failed to fetch rule sources:', error);
        if (container) {
            container.innerHTML = '<p class="red-text">Failed to load rule sources. Check server logs.</p>';
        }
    }
}

function renderRuleSources(ruleSources) {
    const container = document.getElementById('rule-sources-container');
    if (!container) return;

    container.innerHTML = ''; // Clear previous content

    ruleSources.forEach((source, index) => {
        const sourceElement = document.createElement('div');
        sourceElement.classList.add('row', 'valign-wrapper');
        sourceElement.innerHTML = `
            <div class="col s5">
                <p title="${source.url}"><strong>${source.name || source.id}</strong></p>
            </div>
            <div class="col s3">
                <div class="input-field">
                    <select id="targetPolicy-${index}" data-index="${index}">
                        ${availableProxyGroups.map(groupName => 
                            `<option value="${groupName}" ${source.targetPolicy === groupName ? 'selected' : ''}>${groupName}</option>`
                        ).join('')}
                    </select>
                    <label for="targetPolicy-${index}">Target Policy</label>
                </div>
            </div>
            <div class="col s2">
                <div class="switch">
                    <label>
                        Off
                        <input type="checkbox" id="enabled-${index}" data-index="${index}" ${source.enabled ? 'checked' : ''}>
                        <span class="lever"></span>
                        On
                    </label>
                </div>
            </div>
             <div class="col s2">
                <p class="grey-text">${source.ruleType}</p>
            </div>
        `;
        container.appendChild(sourceElement);

        // Add event listeners for changes
        const selectElement = sourceElement.querySelector(`#targetPolicy-${index}`);
        const checkboxElement = sourceElement.querySelector(`#enabled-${index}`);
        
        if (selectElement) {
            selectElement.addEventListener('change', handleRuleSourceChange);
        }
        if (checkboxElement) {
            checkboxElement.addEventListener('change', handleRuleSourceChange);
        }
    });

    M.FormSelect.init(document.querySelectorAll('select')); // Re-initialize Materialize selects
}

function handleRuleSourceChange() {
    // Enable save button when a change is detected
    document.getElementById('save-rule-sources').classList.remove('disabled');
}

async function saveRuleSources() {
    const updatedSources = JSON.parse(JSON.stringify(currentRuleSources)); // Deep clone

    updatedSources.forEach((source, index) => {
        const selectElement = document.getElementById(`targetPolicy-${index}`);
        const checkboxElement = document.getElementById(`enabled-${index}`);

        if (selectElement) {
            source.targetPolicy = selectElement.value;
        }
        if (checkboxElement) {
            source.enabled = checkboxElement.checked;
        }
    });

    try {
        const response = await fetch('/api/rule-sources', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedSources),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        M.toast({html: result.message || 'Rule sources saved!'});
        currentRuleSources = updatedSources; // Update local state
        document.getElementById('save-rule-sources').classList.add('disabled'); // Disable save button again
    } catch (error) {
        console.error('Failed to save rule sources:', error);
        M.toast({html: `Error saving: ${error.message}`, classes: 'red'});
    }
}
