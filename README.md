# Clash Config Auto Generator

## Overview

This project provides a web-based interface for managing rule sources for a Clash configuration server. Users can add, edit, delete, and reorder rule sources, manage their enabled status and target proxy policies, and then trigger the generation of a final Clash configuration file based on these sources.

The frontend is built with HTML, CSS (Materialize), and vanilla JavaScript, communicating with a Node.js backend server.

Currently, the project is configured by default to use rule sources from Sukka.

## Key Features (Implemented)

### Rule Source Management (Frontend)

*   **Fetch and Display:** Retrieves and displays the current list of rule sources from the backend. Each entry shows:
    *   Name (or ID if name is not provided)
    *   URL
    *   Rule Type
    *   Target Proxy Policy (selectable from a dropdown populated by `/api/proxy-groups`)
    *   Enabled/Disabled status (via a toggle switch)
*   **Add New Rule Source:**
    *   A modal dialog allows users to input details for a new rule source (Name, URL, Rule Type, Target Policy, Enabled status).
    *   Basic client-side validation (e.g., URL format).
    *   Changes are **immediately persisted** to the backend upon modal form submission.
    *   Toast notifications provide feedback on success or failure.
*   **Edit Existing Rule Source:**
    *   A modal dialog, pre-filled with the selected rule source's data, allows for modifications.
    *   Changes are **immediately persisted** to the backend upon modal form submission.
    *   Toast notifications provide feedback.
*   **Delete Rule Source:**
    *   A two-step deletion process for safety:
        1.  Clicking the "Delete" button marks the rule source as "pending deletion." The UI updates to show "Confirm Delete" and "Undo Delete" buttons, and the "Edit" button is hidden.
        2.  Clicking "Undo Delete" reverts the rule source to its normal state.
        3.  Clicking "Confirm Delete" removes the rule source from the local list.
    *   Actual deletion from the backend is finalized when the main "Save Changes" button is clicked.
*   **Inline Editing in List View:**
    *   Users can directly toggle the "Enabled" switch for each rule source.
    *   Users can directly change the "Target Policy" using the dropdown for each rule source.
    *   These inline changes are staged locally.
*   **Main "Save Changes" Button:**
    *   Persists all staged changes (inline edits to "Enabled" status and "Target Policy", and confirmed deletions) to the backend via a `POST` request to `/api/rule-sources`.
    *   The button is enabled when there are unsaved local changes or items pending deletion.
*   **UI/UX Enhancements:**
    *   Utilizes Materialize CSS for a clean and responsive user interface (modals, forms, cards, switches, toasts, grid system).
    *   Visual distinction for rule sources marked as "pending deletion."
    *   Toast notifications for user feedback on various actions (save, delete, add, edit, errors).
    *   Restored and maintained CSS layout integrity using a 12-column grid system for rule source entries.

### Configuration Generation (Frontend)

*   A "Generate Configuration" button triggers a backend process (`POST /api/generate-config`).
*   The generated configuration content is then displayed in a modal dialog for review or copying.

### Backend (Implicit Functionality based on Frontend Interactions)

*   Serves the frontend static files (HTML, CSS, JavaScript).
*   Provides API endpoints:
    *   `GET /api/rule-sources`: Returns the current list of rule sources (likely from `config/rule-sources.json`).
    *   `POST /api/rule-sources`: Receives and saves the updated list of rule sources.
    *   `GET /api/proxy-groups`: Returns a list of available proxy groups for dropdowns.
    *   `POST /api/generate-config`: Triggers the server-side logic to generate the Clash configuration file.
*   Implements Basic Authentication for protecting API endpoints.

## Getting Started

(To be filled in with specific setup instructions for the backend server and any build steps if applicable.)

1.  Clone the repository.
2.  Install backend dependencies (e.g., `npm install` if it's a Node.js project).
3.  Configure backend server (e.g., port, auth credentials if not hardcoded).
4.  Start the backend server.
5.  Access the web interface in your browser (typically `http://localhost:<port>`).

## Usage

*   **View Rules:** The main page lists all configured rule sources.
*   **Add Rule:** Click the "Add Rule Source" button, fill in the modal, and save.
*   **Edit Rule:** Click the "Edit" (pencil) icon next to a rule, modify in the modal, and save.
*   **Delete Rule:**
    1.  Click the "Delete" (trash can) icon.
    2.  Click "Confirm Delete" (check icon) or "Undo Delete" (undo icon).
    3.  If confirmed, click the main "Save Changes" button to persist the deletion.
*   **Modify Inline:** Toggle the "Enabled" switch or change the "Target Policy" directly in the list.
*   **Save Changes:** After making inline modifications or confirming deletions, click the "Save Changes" button.
*   **Generate Config:** Click "Generate Configuration" to view the compiled Clash rules.

## Project Status

The project has successfully implemented core functionalities for managing remote rule sources and generating Clash configurations. Key features completed are detailed in the "Key Features (Implemented)" section above. We are now moving towards enhancing these features and building out advanced capabilities as outlined below.

## Roadmap and TODO List

This roadmap outlines the planned development phases, features, and estimated timelines.

### Phase 0: Foundation & Cleanup (Current Focus: Est. ~1-2 Weeks)
*   **[X] Task: API Endpoint Review & Cleanup**
    *   **Status:** Completed (Initial review and changes made)
    *   **Description:** Reviewed API endpoints. `/api/servers` (GET/POST) retained and enhanced for future frontend management of `servers.json` (now expects JSON). `/api/status` retained and secured with Basic Auth. `/api/config/save` removed.
    *   **Next Step:** Further refinements as frontend for `servers.json` is developed.
*   **[ ] Task: Standardize Environment Configuration**
    *   **Status:** Started
    *   **Description:** Utilize `.env` files for all configurable parameters (port, auth credentials). ` .env.example` created.
    *   **Next Step:** Ensure all configurable aspects are covered by `.env` and document usage thoroughly.
*   **[ ] Task: CI/CD Pipeline Setup**
    *   **Status:** Planning
    *   **Description:** Establish a Continuous Integration/Continuous Deployment pipeline.
    *   **Sub-tasks:**
        *   [ ] Configure code linting (e.g., ESLint) and formatting (e.g., Prettier).
        *   [ ] Implement unit and integration tests for critical backend logic (especially `server/generateConfig.js`) and API endpoints (using Jest/Supertest).
        *   [ ] Set up GitHub Actions (or chosen CI tool) for automated linting and testing on pushes/PRs.
        *   [ ] Define deployment scripts/process (e.g., using PM2, potentially Dockerizing the application) as part of CD.

### Phase 1: Core Feature Enhancements (Est. ~1-2 Months, following Phase 0)
*   **[ ] Feature: UI/UX Enhancements**
    *   **Description:** Improve the overall user experience of the rule management interface.
    *   **Sub-tasks:**
        *   [ ] Refine the "Save Changes" button logic to accurately reflect unsaved changes.
        *   [ ] Enhance the rule source editing modal/form with better input validation and clearer layout.
        *   [ ] Implement Drag-and-Drop reordering for rule sources in the list.
*   **[ ] Feature: Frontend Management of Proxy Servers (`servers.json`)**
    *   **Description:** Allow users to add, edit, and delete proxy server entries (currently in `config/servers.json`) directly through the UI.
    *   **Sub-tasks:**
        *   [ ] Backend: Ensure `GET /api/servers` and `POST /api/servers` are robust, secure, and correctly handle JSON for UI interaction.
        *   [ ] Frontend: Design and implement UI components (modals, forms, list display) for CRUD operations on server entries.
        *   [ ] Frontend: Ensure proper validation and user feedback.
*   **[ ] Feature F1.2: Local Rule Snippet Management**
    *   **Description:** Allow users to add and manage custom rule snippets directly through the UI. These snippets will be saved locally on the server (e.g., in a `config/local_rules/` directory, one file per snippet) and can be selectively included in the final configuration.
    *   **Sub-tasks:**
        *   [ ] Backend: Design and implement API endpoints for CRUD operations on local rule snippets.
        *   [ ] Backend: Update `generateConfig.js` to incorporate selected local snippets.
        *   [ ] Frontend: Develop UI components for creating, viewing, editing, deleting, and toggling local rule snippets.
*   **[ ] Feature F1.3: Remote Rule Source Versioning (Preliminary)**
    *   **Description:** Implement a basic mechanism for versioning or caching fetched remote rule sets to allow rollback or comparison. The exact mechanism (e.g., timestamped cache, Git hash if applicable) needs further definition based on user's detailed requirements for "version management of remote rule sets".
    *   **Sub-tasks:**
        *   [ ] Define specific requirements and scope for "versioning".
        *   [ ] Design and implement the chosen caching/versioning strategy.

### Phase 2: Advanced Editing Capabilities (Est. ~2-4 Months, following Phase 1)
*   **[ ] Feature F2.0: "Advanced Features" Toggle**
    *   **Description:** Introduce a UI switch to enable/disable the advanced configuration editing mode.
*   **[ ] Feature F2.1: Integrated Code Editor**
    *   **Description:** Embed a modern code editor (e.g., Monaco Editor, CodeMirror) into the UI. This editor will allow direct modification of a "quasi" configuration file (excluding sensitive proxy server details from `servers.json` for security).
*   **[ ] Feature F2.2: Editor Content Local Cache & Server Submission**
    *   **Description:** Changes made in the integrated editor will be temporarily saved in the user's browser (local storage). A dedicated action will allow submission of these changes to the server.
*   **[ ] Feature F2.3: Configuration "Slots" with Versioning**
    *   **Description:** Provide 5 "slots" where users can save distinct versions of their editor-modified configurations. Each slot can have simple version history or overwrite capabilities. Users can quickly switch between these saved configurations.
*   **[ ] Feature F2.4: Conditional Configuration Generation Logic**
    *   **Description:** The main "Generate Configuration" button's behavior will adapt:
        *   **Advanced Mode OFF:** Generates config based on remote/local rules as in Phase 1.
        *   **Advanced Mode ON:** Generates config using the content from the currently active "slot" (modified by the editor), merged with necessary backend data (like `servers.json`). The button text should change to reflect this (e.g., "Generate Config from Slot X").

### Phase 3: Production Readiness & Operational Excellence (Ongoing / Following Phase 2)
*   **Documentation:**
    *   [ ] Continuously update and maintain `API.md`.
    *   [ ] Expand "Getting Started" and "Usage" sections in this README as new features are added and for production deployment.
*   **Logging:**
    *   [ ] Implement production-grade logging (e.g., Winston or Pino) with configurable levels, formats (e.g., JSON), and outputs (console, file).
*   **Process Management & Deployment:**
    *   [ ] Prepare for production deployment using a process manager like PM2. Document `ecosystem.config.js` setup and deployment commands.
    *   [ ] Define and document a clear deployment strategy (manual steps initially, with a goal for CI/CD integration for deployment).
    *   [ ] Consider Dockerizing the application for easier deployment and environment consistency.
*   **Environment Isolation:**
    *   [ ] Establish and document practices for environment isolation (development, testing, production), including managing different `.env` configurations or similar mechanisms.
*   **Data Persistence & Backup:**
    *   [ ] Review and confirm data persistence strategy for `rule-sources.json`, `servers.json`, local rule snippets, and configuration slots.
    *   [ ] Document backup procedures for critical configuration data.
*   **Error Handling & Robustness:**
    *   [ ] Systematically improve error handling on both frontend and backend.
    *   [ ] Provide clearer user feedback for all operations and potential issues.
*   **Testing:**
    *   [ ] Expand test coverage (unit, integration, E2E if feasible) as the codebase grows.
*   **Security:**
    *   [ ] Regularly review security aspects, especially concerning file system access, API authentication, and input validation.
    *   [ ] Consider rate limiting or other protective measures for public-facing instances if applicable.



## Acknowledgements

This project utilizes rule configurations and concepts inspired by the work of **Sukka**. We extend our sincere gratitude for her contributions to the community.

- Sukka's Surge-compatible rule collection: [SukkaW/Surge](https://github.com/SukkaW/Surge)

## License

This project is licensed under the MIT License.

