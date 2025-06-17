# Clash Config Auto Generator

## Overview

A full-stack tool for managing proxy servers and rule sources, then exporting a ready-to-use **Clash Meta** configuration file. Servers are stored in V2RayN JSON format; rule sources pull from Sukka’s public rule sets.

Future support is planned for other proxy software such as Surge and Sing-box.

## Core Functionality

*   Web UI to **add / edit / delete** proxy servers and rule sources, with immediate backend persistence.
*   Generates Clash Meta-compatible `config.yaml` using a template + fetched rule sources.
*   REST API (`GET/POST/PUT/DELETE`) for servers, `POST /api/rule-sources`, `POST /api/trigger-generation`, etc. (see `API.md`).
*   Atomic overwrite of `servers.json` when saving full lists; legacy single-append still supported.
*   Basic Auth protects all management endpoints.

## Getting Started

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Configure environment variables (e.g., in a `.env` file or directly):
    *   `PORT` (e.g., 3000)
    *   `ADMIN_USERNAME`
    *   `ADMIN_PASSWORD`
    *   `SERVERS_JSON_PATH` (optional, defaults to `config/servers.json`)
    *   `RULE_SOURCES_JSON_PATH` (optional, defaults to `config/rule-sources.json`)
    *   `CONFIG_TEMPLATE_PATH` (optional, defaults to `config/config.template.yaml`)
    *   `OUTPUT_CONFIG_PATH` (optional, defaults to `output/config.yaml`)
4.  Start the server: `npm start`
    *   For production, use PM2: `npm run pm2:start` (ensure PM2 is installed: `npm install pm2 -g`)

## Usage

*   Navigate to `/` with your browser, log in with the admin credentials, and manage proxies / rule sources via the Materialize UI.
*   Trigger config generation from the UI or call `POST /api/trigger-generation`.
*   Download the generated configuration at `/proxy-config`.
*   Full API details are documented in `API.md`; curl or automation friendly.

## Roadmap

*   Add output generators for Surge, Sing-box, etc.
*   OAuth option in addition to Basic Auth.
*   Live log panel in UI for config generation progress.

## Acknowledgements

This project utilizes rule configurations and concepts inspired by the work of **Sukka**. We extend our sincere gratitude for her contributions to the community.

-   Sukka's Surge-compatible rule collection: [SukkaW/Surge](https://github.com/SukkaW/Surge)

## License

This project is licensed under the MIT License.
