document.addEventListener('DOMContentLoaded', async function() {
    console.log('Frontend script loaded.');
    M.AutoInit(); // Initialize all Materialize components
    await fetchAndRenderProxyServers();
    // Initialize Add Server modal (needed for edit/add actions)
    initializeAddServerModal();
let editingRuleSourceId = null;
let addServerModalInstance;
let editingServerId = null; // For future edit functionality

    // Initialize Add Rule Source Modal
    const modalElem = document.getElementById('add-rule-source-modal');
    let addRuleSourceModalInstance;
    if (modalElem) {
        addRuleSourceModalInstance = M.Modal.init(modalElem, {
            onOpenStart: function() {
                const modalTitle = modalElem.querySelector('h4');
                const saveButton = modalElem.querySelector('#save-new-rs-btn');

                // Populate target policy dropdown in the modal
                const policySelect = document.getElementById('new-rs-policy');
                if (policySelect) {
                    policySelect.innerHTML = availableProxyGroups.map(groupName => 
                        `<option value="${groupName}">${groupName}</option>`
                    ).join('');
                    // Value will be set by edit handler if in edit mode before this runs or just after
                }

                if (editingRuleSourceId) {
                    // Edit Mode: Fields are pre-filled by edit button handler
                    modalTitle.textContent = 'Edit Rule Source';
                    saveButton.textContent = 'Update Rule Source';
                    // Values for selects should be set before M.FormSelect.init
                    // For policySelect, its value is set in edit handler, then init here.
                    // For new-rs-type, its value is set in edit handler, then init here.
                } else {
                    // Add Mode: Clear/reset fields
                    modalTitle.textContent = 'Add New Rule Source';
                    saveButton.textContent = 'Save Rule Source';
                    document.getElementById('new-rs-name').value = '';
                    document.getElementById('new-rs-url').value = '';
                    document.getElementById('new-rs-type').value = 'DOMAIN-SUFFIX'; // Default type
                    document.getElementById('new-rs-enabled').checked = true;
                }
                // Initialize selects for both modes after values are potentially set
                M.FormSelect.init(policySelect);
                M.FormSelect.init(document.getElementById('new-rs-type'));
                M.updateTextFields(); // Important for Materialize labels
            },
            onCloseEnd: function() {
                // Reset to Add mode defaults
                editingRuleSourceId = null;
                const modalTitle = modalElem.querySelector('h4');
                const saveButton = modalElem.querySelector('#save-new-rs-btn');
                modalTitle.textContent = 'Add New Rule Source';
                saveButton.textContent = 'Save Rule Source';

                // Clear form fields for next 'Add' operation
                document.getElementById('new-rs-name').value = '';
                document.getElementById('new-rs-url').value = '';
                document.getElementById('new-rs-type').value = 'DOMAIN-SUFFIX';
                document.getElementById('new-rs-policy').value = availableProxyGroups[0] || ''; // Default to first policy or empty
                document.getElementById('new-rs-enabled').checked = true;
                M.FormSelect.init(document.getElementById('new-rs-type'));
                M.FormSelect.init(document.getElementById('new-rs-policy'));
                M.updateTextFields();
            }
        });
    } else {
        console.error('Add Rule Source Modal element not found.');
    }

    const addRuleSourceButton = document.getElementById('add-rule-source-btn');
    if (addRuleSourceButton && addRuleSourceModalInstance) {
        addRuleSourceButton.addEventListener('click', () => {
            addRuleSourceModalInstance.open();
        });
    } else {
        console.error('Add Rule Source button or modal instance not found for click listener.');
    }

    const saveNewRuleSourceButton = document.getElementById('save-new-rs-btn');
    // Event delegation for edit buttons
    const ruleSourcesContainer = document.getElementById('rule-sources-container'); // Renamed for clarity
    if (ruleSourcesContainer) {
        ruleSourcesContainer.addEventListener('click', (event) => {
            const targetButton = event.target.closest('button');
            if (!targetButton) return;

            const index = parseInt(targetButton.dataset.index, 10);
            if (isNaN(index) || index < 0 || index >= currentRuleSources.length) {
                // console.warn('Invalid index from button dataset:', targetButton.dataset.index);
                return; // Not a button we care about or invalid index
            }

            const source = currentRuleSources[index];

            if (targetButton.classList.contains('edit-btn')) {
                if (source.isPendingDeletion) return; // Don't allow edit if pending deletion
                editingRuleSourceId = source.id;

                document.getElementById('new-rs-name').value = source.name;
                document.getElementById('new-rs-url').value = source.url;
                document.getElementById('new-rs-type').value = source.ruleType;
                document.getElementById('new-rs-policy').value = source.targetPolicy;
                document.getElementById('new-rs-enabled').checked = source.enabled;
                
                M.updateTextFields();
                if (addRuleSourceModalInstance) {
                    addRuleSourceModalInstance.open();
                }
            } else if (targetButton.classList.contains('delete-btn')) {
                console.log('[Delete Btn Click] Index:', index, 'Source before mark:', JSON.parse(JSON.stringify(source)));
                console.log('[Delete Btn Click] currentRuleSources BEFORE mark:', JSON.parse(JSON.stringify(currentRuleSources)));
                source.isPendingDeletion = true;
                console.log('[Delete Btn Click] Source after mark:', JSON.parse(JSON.stringify(source)));
                console.log('[Delete Btn Click] currentRuleSources AFTER mark:', JSON.parse(JSON.stringify(currentRuleSources)));
                renderRuleSources(currentRuleSources);
                document.getElementById('save-rule-sources').classList.remove('disabled');
            } else if (targetButton.classList.contains('confirm-delete-btn')) {
                // Confirm delete click: remove from array
                const sourceToDelete = currentRuleSources[index]; // Get ref before splice
                currentRuleSources.splice(index, 1);
                renderRuleSources(currentRuleSources);
                document.getElementById('save-rule-sources').classList.remove('disabled');

            } else if (targetButton.classList.contains('undo-delete-btn')) {
                // Undo delete click: unmark
                const source = currentRuleSources[index];
                delete source.isPendingDeletion;
                console.log('[Undo Delete Btn Click] Source after unmark:', JSON.parse(JSON.stringify(source)));
                renderRuleSources(currentRuleSources);
                updateMainSaveButtonState(); 
            }
        });
    }

    async function persistRuleSourcesToServer(sourcesToSaveFromArgument) {
        // Filter out items marked for pending deletion that haven't been confirmed yet.
        // Confirmation means they are removed from currentRuleSources before this is called by main save.
        // If called from modal, isPendingDeletion shouldn't be set.
        const sourcesToSend = sourcesToSaveFromArgument.filter(source => !source.isPendingDeletion);

        try {
            console.log('Attempting to save rule sources to server with data (after filtering pending):', sourcesToSend);
            const response = await fetch('/api/rule-sources', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + btoa('admin:password') 
                },
                body: JSON.stringify(sourcesToSend)
            });

            if (!response.ok) {
                let errorData = { message: `HTTP error! Status: ${response.status}` };
                try {
                    errorData = await response.json();
                } catch (e) {
                    console.warn('Could not parse error response as JSON.');
                }
                throw new Error(errorData.message || `Failed to save with status ${response.status}`);
            }
            console.log('Rule sources saved to server successfully.');
            currentRuleSources = sourcesToSaveFromArgument.filter(source => !source.isPendingDeletion);
            // After successful save, also clear any isPendingDeletion flags from the main currentRuleSources array
            // (though they should have been filtered out before saving).
            // More robustly, update currentRuleSources to exactly what was sent and accepted.
            currentRuleSources = [...sourcesToSend]; // This now reflects the true state on the server.
            document.getElementById('save-rule-sources').classList.add('disabled'); // Disable main save if this was the only change
            return true; // Indicate success
        } catch (error) {
            console.error('Failed to save rule sources to server (in persistRuleSourcesToServer):', error);
            M.toast({html: `Failed to save to server: ${error.message}`, classes: 'red'});
            document.getElementById('save-rule-sources').classList.remove('disabled'); // Enable main save for retry
            return false; // Indicate failure
        }
    }

    if (saveNewRuleSourceButton && addRuleSourceModalInstance) {
        saveNewRuleSourceButton.addEventListener('click', async () => { // Made async
            let newName = document.getElementById('new-rs-name').value.trim();
            const newUrl = document.getElementById('new-rs-url').value.trim();
            const newType = document.getElementById('new-rs-type').value;
            const newPolicy = document.getElementById('new-rs-policy').value;
            const newEnabled = document.getElementById('new-rs-enabled').checked;

            if (!newUrl) { // Only URL is strictly required now
                M.toast({html: 'URL is required!', classes: 'red'});
                return;
            }

            if (editingRuleSourceId) {
                // Edit Mode
                const ruleIndex = currentRuleSources.findIndex(rs => rs.id === editingRuleSourceId);
                if (ruleIndex === -1) {
                    M.toast({html: 'Error: Could not find rule source to update.', classes: 'red'});
                    return;
                }

                if (!newName) { // If name cleared during edit, default to its ID
                    newName = editingRuleSourceId;
                }

                currentRuleSources[ruleIndex] = {
                    ...currentRuleSources[ruleIndex], // Preserve original ID and any other non-editable fields
                    name: newName,
                    url: newUrl,
                    ruleType: newType,
                    targetPolicy: newPolicy,
                    enabled: newEnabled
                };
                M.toast({html: `Rule source '${newName}' updated. Save changes to apply.`, classes: 'blue'});
            } else {
                // Add Mode
                let newGeneratedId = `rs-${Date.now()}`;
                while (currentRuleSources.some(rs => rs.id === newGeneratedId)) {
                    newGeneratedId = `rs-${Date.now()}-${Math.floor(Math.random() * 100)}`;
                }
                if (!newName) {
                    newName = newGeneratedId;
                }
                const newRuleSource = {
                    id: newGeneratedId,
                    name: newName,
                    url: newUrl,
                    ruleType: newType,
                    targetPolicy: newPolicy,
                    enabled: newEnabled
                };
                currentRuleSources.push(newRuleSource);
                M.toast({html: `Rule source '${newName}' added. Save changes to apply.`, classes: 'green'});
            }

            renderRuleSources(currentRuleSources); // Render immediately for UI responsiveness
            addRuleSourceModalInstance.close(); // Close modal immediately

            // Attempt to save to server
            const tempSourcesForSave = [...currentRuleSources]; // Use a copy in case of modification during async op
            const success = await persistRuleSourcesToServer(tempSourcesForSave);

            if (success) {
                if (editingRuleSourceId) { // Check original editingRuleSourceId before it's cleared by onCloseEnd
                     M.toast({html: `Rule source '${newName}' updated and saved.`, classes: 'blue'});
                } else {
                     M.toast({html: `Rule source '${newName}' added and saved.`, classes: 'green'});
                }
                // Main save button state is handled by persistRuleSourcesToServer
            } else {
                // Error toast is shown by persistRuleSourcesToServer
                // Main save button is enabled by persistRuleSourcesToServer for retry
                // Optionally, revert local changes if server save fails, or mark item as unsaved.
                // For now, local changes persist and user can retry with main save button.
            }
            // editingRuleSourceId is reset by modal's onCloseEnd, which is triggered by close()
            // Check if save button should be disabled if no other changes are pending
            const anyPendingDeletions = currentRuleSources.some(rs => rs.isPendingDeletion);
            if (!anyPendingDeletions && success) { // if save was successful and no pending deletes
                 // Check if UI elements differ from currentRuleSources to see if save button should be active
                 let uiDiffersFromSaved = false;
                 const uiRuleSourceElementsForStateCheck = document.querySelectorAll('#rule-sources-container .row.rule-source-entry');
                 uiRuleSourceElementsForStateCheck.forEach((element, elIndex) => {
                    // Find corresponding source in currentRuleSources by ID, as order might change or elements might be removed
                    const sourceId = element.querySelector('p[title^="ID:"]').title.substring(4); // Extract ID
                    const currentSource = currentRuleSources.find(cs => cs.id === sourceId);
                    if (!currentSource) return; // Should not happen if UI is in sync

                    const enabledCheckbox = element.querySelector(`input[type="checkbox"]`);
                    const targetPolicySelect = element.querySelector(`select`);

                    if (enabledCheckbox && targetPolicySelect) {
                        if (currentSource.enabled !== enabledCheckbox.checked || currentSource.targetPolicy !== targetPolicySelect.value) {
                            uiDiffersFromSaved = true;
                        }
                    }
                 });

                if (!uiDiffersFromSaved) {
                    document.getElementById('save-rule-sources').classList.add('disabled');
                } else {
                    document.getElementById('save-rule-sources').classList.remove('disabled');
                }
            } else if (!success) {
                 document.getElementById('save-rule-sources').classList.remove('disabled');
            }
        });
    } else {
        console.error('Save New Rule Source button or modal instance not found for click listener.');
    }

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

                const enabledCheckbox = element.querySelector(`#enabled-${index}`); // Changed iterationIndex to index
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

            let sourcesToPersist = JSON.parse(JSON.stringify(currentRuleSources)); // Deep copy

            // Sync UI changes (enabled, targetPolicy) from the rendered list back into the copy
            const domRuleEntriesForSave = document.querySelectorAll('#rule-sources-container .rule-source-entry');
            domRuleEntriesForSave.forEach(element => {
                const sourceId = element.dataset.sourceId;
                const sourceInCopy = sourcesToPersist.find(s => s.id === sourceId);
                if (sourceInCopy && !sourceInCopy.isPendingDeletion) { // Only update if found and not pending deletion (UI for pending is different)
                    const enabledCheckbox = element.querySelector(`input[type="checkbox"]`);
                    const targetPolicySelect = element.querySelector(`select`);
                    if (enabledCheckbox) {
                        sourceInCopy.enabled = enabledCheckbox.checked;
                    }
                    if (targetPolicySelect) {
                        sourceInCopy.targetPolicy = targetPolicySelect.value;
                    }
                }
            });

            const success = await persistRuleSourcesToServer(sourcesToPersist);
            if (success) {
                 M.toast({html: 'Changes saved successfully!'});
                 // currentRuleSources is updated within persistRuleSourcesToServer on success
                 // saveButton disabled state is also handled there.
                 // Re-render to ensure UI is perfectly in sync with the saved state (e.g., pending flags cleared)
                 renderRuleSources(currentRuleSources);
            } else {
                // Error toast and saveButton state handled by persistRuleSourcesToServer
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
                    headers: { // Authorization header removed
                    }
                });
                const result = await response.json(); 
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

    console.log('[renderRuleSources] Rendering sources:', JSON.parse(JSON.stringify(ruleSources)));
    container.innerHTML = ''; // Clear previous content

    ruleSources.forEach((source, iterationIndex) => { // Renamed index to iterationIndex to avoid confusion
        console.log(`[renderRuleSources] Processing source at iterationIndex ${iterationIndex}:`, JSON.parse(JSON.stringify(source)));
        const sourceElement = document.createElement('div');
        sourceElement.classList.add('row', 'rule-source-entry');
        sourceElement.dataset.sourceId = source.id; // Add source ID for reliable mapping
        if (source.isPendingDeletion) {
            sourceElement.classList.add('pending-deletion');
        }
        sourceElement.style.marginBottom = '15px';
        const elementHTML = `
            <div class="col s12 m3">
                <p style="margin-top: 0.5rem; margin-bottom: 0.2rem; font-weight: bold;" title="ID: ${source.id}">${source.name || source.id}</p>
                <p style="font-size: 0.8rem; color: grey; word-break: break-all; margin-top: 0; margin-bottom: 0.5rem;">${source.url}</p>
            </div>
            <div class="col s12 m2">
                 <p style="font-size: 0.9rem; margin-top: 1rem;">${source.ruleType}</p>
            </div>
            <div class="col s12 m3 input-field" style="padding-top: 0.1rem;">
                <select id="targetPolicy-${iterationIndex}" data-index="${iterationIndex}">
                    ${availableProxyGroups.map(group => `<option value="${group}" ${source.targetPolicy === group ? 'selected' : ''}>${group}</option>`).join('')}
                </select>
            </div>
            <div class="col s12 m2" style="padding-top: 1rem;">
                <div class="switch">
                    <label>
                        Off
                        <input type="checkbox" id="enabled-${iterationIndex}" data-index="${iterationIndex}" ${source.enabled ? 'checked' : ''}>
                        <span class="lever"></span>
                        On
                    </label>
                </div>
            </div>
            <div class="col s12 m2" style="margin-top:1.5rem;"> <!-- Removed input-field class -->
                    ${source.isPendingDeletion ? `
                        <button class="btn-small waves-effect waves-light orange confirm-delete-btn" data-index="${iterationIndex}" title="Confirm Delete" style="margin-right: 5px;"><i class="material-icons">check</i></button>
                        <button class="btn-small waves-effect waves-light grey undo-delete-btn" data-index="${iterationIndex}" title="Undo Delete"><i class="material-icons">undo</i></button>
                    ` : `
                        <button class="btn-small waves-effect waves-light blue edit-btn" data-index="${iterationIndex}" style="margin-right: 5px;" title="Edit"><i class="material-icons">edit</i></button>
                        <button class="btn-small waves-effect waves-light red delete-btn" data-index="${iterationIndex}" title="Delete"><i class="material-icons">delete</i></button>
                    `}
                </div>
        `;
        console.log(`[renderRuleSources] Element HTML for iterationIndex ${iterationIndex}:`, elementHTML.substring(0, 200) + '...'); // Log a snippet
        try {
            sourceElement.innerHTML = elementHTML;
        } catch (e) {
            console.error(`[renderRuleSources] Error setting innerHTML for iterationIndex ${iterationIndex}:`, e, source);
            // Fallback rendering for problematic item
            sourceElement.innerHTML = `<div class="col s12 red-text">Error rendering item: ${source.name || source.id}. Check console.</div>`;
        }

        container.appendChild(sourceElement);
        console.log(`[renderRuleSources] Appended child for iterationIndex ${iterationIndex}, source ID: ${source.id}`);

        // Add event listeners for changes
        const selectElement = sourceElement.querySelector(`#targetPolicy-${iterationIndex}`);
        const checkboxElement = sourceElement.querySelector(`#enabled-${iterationIndex}`);
        
        if (selectElement) {
            selectElement.addEventListener('change', handleRuleSourceChange);
        }
        if (checkboxElement) {
            checkboxElement.addEventListener('change', handleRuleSourceChange);
        }

        const deleteButton = sourceElement.querySelector('.delete-btn');
        if (deleteButton) {
            deleteButton.addEventListener('click', () => handleDeleteRuleSource(index));
        }
    });

    M.FormSelect.init(document.querySelectorAll('select')); // Re-initialize Materialize selects
}

function handleDeleteRuleSource(index) {
    if (index < 0 || index >= currentRuleSources.length) {
        console.error('Invalid index for deletion:', index);
        return;
    }
    const removedSource = currentRuleSources.splice(index, 1)[0]; // Remove the item and get it
    console.log('Removed rule source:', removedSource.name || removedSource.id);
    renderRuleSources(currentRuleSources); // Re-render the list
    document.getElementById('save-rule-sources').classList.remove('disabled'); // Enable save button

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

// --- Proxy Servers Management ---
let currentProxyServers = [];

async function fetchAndRenderProxyServers() {
    const listElement = document.getElementById('proxy-servers-list');
    if (!listElement) {
        console.error('Proxy servers list element not found.');
        return;
    }

    listElement.innerHTML = '<li class="collection-item center-align"><div class="progress"><div class="indeterminate"></div></div></li>'; // Loading state

    try {
        const response = await fetch('/api/servers');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        currentProxyServers = await response.json(); // Assuming API returns an array of servers
        renderProxyServers(currentProxyServers);
    } catch (error) {
        console.error('Failed to fetch proxy servers:', error);
        listElement.innerHTML = `<li class="collection-item red-text text-darken-2">Error loading servers: ${error.message}</li>`;
        M.toast({html: `Error fetching servers: ${error.message}`, classes: 'red'});
    }
}

function renderProxyServers(servers) {
    const listElement = document.getElementById('proxy-servers-list');
    listElement.innerHTML = ''; // Clear current list or loading state

    if (!servers || servers.length === 0) {
        listElement.innerHTML = '<li class="collection-item">No proxy servers configured.</li>';
        return;
    }

    servers.forEach((server, index) => {
        const item = document.createElement('li');
        item.className = 'collection-item avatar';
        // Ensure server.id is handled if it might be undefined/null
        const serverIdDisplay = server.id ? server.id.substring(0, 8) + '...' : 'N/A';
        // Determine action buttons based on deletion state
        let actionButtonsHtml;
        if (server.isPendingDeletion) {
            actionButtonsHtml = `
                <a href="#" class="confirm-delete-server-btn waves-effect waves-light btn-small orange" data-index="${index}" style="margin-right: 10px;"><i class="material-icons">check</i></a>
                <a href="#" class="undo-delete-server-btn waves-effect waves-light btn-small grey" data-index="${index}"><i class="material-icons">undo</i></a>
            `;
            item.classList.add('pending-deletion');
        } else {
            actionButtonsHtml = `
                <a href="#" class="edit-server-btn waves-effect waves-light btn-small blue" data-index="${index}" style="margin-right: 10px;"><i class="material-icons">edit</i></a>
                <a href="#" class="delete-server-btn waves-effect waves-light btn-small red" data-index="${index}"><i class="material-icons">delete</i></a>
            `;
        }
        item.innerHTML = `
            <i class="material-icons circle teal">router</i>
            <span class="title"><strong>${server.ps || 'Unnamed Server'}</strong></span>
            <p>
                Address: ${server.add || 'N/A'}:${server.port || 'N/A'}<br>
                Type: ${server.type || 'N/A'} | Net: ${server.net || 'N/A'} | ID: ${serverIdDisplay}
            </p>
            <div class="secondary-content">
                ${actionButtonsHtml}
            </div>
        `;
        listElement.appendChild(item);
    });

    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.edit-server-btn').forEach(btn => btn.addEventListener('click', (event) => handleEditServer(event, currentProxyServers)));
    document.querySelectorAll('.delete-server-btn').forEach(btn => btn.addEventListener('click', (event) => handleDeleteServer(event, currentProxyServers)));
    document.querySelectorAll('.confirm-delete-server-btn').forEach(btn => btn.addEventListener('click', (event) => handleConfirmDeleteServer(event, currentProxyServers)));
    document.querySelectorAll('.undo-delete-server-btn').forEach(btn => btn.addEventListener('click', (event) => handleUndoDeleteServer(event, currentProxyServers)));
}

function handleEditServer(event, servers) {
    const index = event.currentTarget.dataset.index;
    const server = servers[index];
    if (!server) return;
    editingServerId = server.id;
    // Pre-fill textarea
    const textarea = document.getElementById('new-server-json');
    if (textarea) {
        textarea.value = JSON.stringify(server, null, 2);
        M.updateTextFields();
    }
    // Open modal
    if (addServerModalInstance) {
        addServerModalInstance.open();
    }
}

function handleDeleteServer(event, servers) {
    const index = event.currentTarget.dataset.index;
    const server = servers[index];
    if (!server) return;
    server.isPendingDeletion = true;
    renderProxyServers(currentProxyServers);
}

async function handleConfirmDeleteServer(event, servers) {
    const index = event.currentTarget.dataset.index;
    const server = servers[index];
    if (!server) return;
    servers.splice(index,1);
    renderProxyServers(currentProxyServers);
    await persistServersToBackend();
    M.toast({html:`Server '${server.ps}' deleted and saved.`,classes:'teal'});
}

function handleUndoDeleteServer(event, servers) {
    const index = event.currentTarget.dataset.index;
    const server = servers[index];
    if (!server) return;
    delete server.isPendingDeletion;
    renderProxyServers(currentProxyServers);
}

// Persist full servers list to backend (overwrites servers.json)
async function persistServersToBackend(){
    const cleaned = currentProxyServers
        .filter(s=> typeof s.ps==='string' && s.ps.trim().length>0)
        .map(s=>{const copy={...s}; delete copy.isPendingDeletion; return copy;});
    if(cleaned.length===0){
        // If list empty, send empty array; backend should handle, but guard potential 400
        console.warn('Persisting empty server list.');
    }
    console.log('[persistServersToBackend] Sending list:', cleaned);
    try{
        const resp = await fetch('/api/servers',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify(cleaned)
        });
        if(!resp.ok){const err=await resp.json();throw new Error(err.error||`HTTP ${resp.status}`);}        
    }catch(err){
        console.error('Failed to persist servers:',err);
        M.toast({html:`保存失败: ${err.message}`,classes:'red'});
    }
}

function initializeAddServerModal() {
    const modalElem = document.getElementById('add-server-modal');
    if (modalElem) {
        addServerModalInstance = M.Modal.init(modalElem, {
            onOpenStart: function() {
                // Clear form fields when modal opens for adding a new server
                if (!editingServerId) { // Only clear if not in edit mode
                    const textarea = document.getElementById('new-server-json');
                    if (textarea) {
                        textarea.value = '';
                    }
                    M.updateTextFields(); // Important for Materialize labels, including textareas
                }
                // If editingServerId is set, pre-filling logic would go here or be called here
            }
        });
    }

    const addServerBtn = document.getElementById('add-server-btn');
    if (addServerBtn) {
        addServerBtn.addEventListener('click', () => {
            editingServerId = null; // Ensure we are in 'add' mode
            if (addServerModalInstance) {
                addServerModalInstance.open();
            }
        });
    }
    // Event listener for the save button inside the modal will be added later
    const saveNewServerBtn = document.getElementById('save-new-server-btn');
    if (saveNewServerBtn) {
        saveNewServerBtn.addEventListener('click', handleSaveNewServer);
    }
}



async function handleSaveNewServer() {
    const jsonInput = document.getElementById('new-server-json').value.trim();
    let newServer;

    if (!jsonInput) {
        M.toast({html: 'JSON input cannot be empty.', classes: 'red'});
        return;
    }

    try {
        newServer = JSON.parse(jsonInput);
    } catch (e) {
        M.toast({html: 'Invalid JSON format. Please check your input.', classes: 'red'});
        console.error('JSON parsing error:', e);
        return;
    }

    // Optional: Basic check if it's an object, though backend will validate structure
    if (typeof newServer !== 'object' || newServer === null || Array.isArray(newServer)) {
        M.toast({html: 'Input must be a single JSON object.', classes: 'red'});
        return;
    }

    try {
        const isEdit = Boolean(editingServerId);
        const endpoint = isEdit ? `/api/servers/${editingServerId}` : '/api/servers';
        const httpMethod = isEdit ? 'PUT' : 'POST';
        const response = await fetch(endpoint, {
            method: httpMethod,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newServer),
        });

        if (!response.ok) {
            const errorData = await response.json();
            // If details exist, prefer that, otherwise use the main error message.
            const errorMessage = errorData.details || errorData.error || `HTTP error! status: ${response.status}`;
            throw new Error(errorMessage);
        }

        const savedServer = await response.json();
        const toastMsg = isEdit ? `Server '${savedServer.ps}' updated!` : `Server '${savedServer.ps}' added!`;
        M.toast({html: toastMsg});
        if (addServerModalInstance) {
            addServerModalInstance.close();
        }
        editingServerId=null;
        await fetchAndRenderProxyServers();

    } catch (error) {
        console.error('Failed to save new server:', error);
        M.toast({html: `Error saving server: ${error.message}`, classes: 'red'});
    }
}

// function handleDeleteServer(event, servers) {
//     const index = event.currentTarget.dataset.index;
//     console.log('Delete server at index:', index, servers[index]);
//     M.toast({html: 'Delete functionality to be implemented.'});
// }

