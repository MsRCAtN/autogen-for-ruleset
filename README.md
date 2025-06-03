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

## Future Development Plans

*   **Refine "Save Changes" Button Logic:**
    *   Implement a more precise mechanism to enable/disable the "Save Changes" button. This will involve comparing the current state of rule sources (including `enabled` status, `targetPolicy`, and `isPendingDeletion` flags) against a "last successfully persisted" snapshot to accurately reflect if there are actual unsaved changes.
*   **Drag-and-Drop Reordering:** Allow users to reorder rule sources in the list via drag-and-drop, with changes persisted via the "Save Changes" button.
*   **Backend Enhancements:**
    *   Improve error handling and provide more descriptive error messages to the frontend.
    *   Consider making Basic Authentication credentials configurable via environment variables rather than being hardcoded.
*   **Frontend Enhancements:**
    *   Add more comprehensive client-side validation for input fields.
    *   Implement unit and/or integration tests for critical JavaScript logic (e.g., state management, API interactions).
*   **Documentation:**
    *   Detailed API documentation.
    *   Expand "Getting Started" and "Usage" sections in this README.



## Acknowledgements

This project utilizes rule configurations and concepts inspired by the work of **Sukka**. We extend our sincere gratitude for her contributions to the community.

- Sukka's Surge-compatible rule collection: [SukkaW/Surge](https://github.com/SukkaW/Surge)

## License

This project is licensed under the MIT License.

