# Clash Config Auto Generator

## Overview

A server application to generate proxy configuration files. It uses V2RayN-compatible format for server definitions and currently produces configurations compatible with Clash Meta.

Future support is planned for other proxy software such as Surge and Sing-box.

## Core Functionality

*   Manages proxy server definitions (V2RayN format).
*   Manages rule sources for generating proxy rules.
*   Generates Clash Meta compatible configuration files.
*   Provides API endpoints for management and configuration download.
*   Basic Authentication for API protection.

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

*   Access API endpoints (e.g., `/proxy-config` to download, other endpoints for management as per `API.md`).
*   (Optional) Use the provided basic web UI for managing rule sources if deployed and accessible.

## Future Plans

*   Expand configuration output support to include Surge, Sing-box, and other popular proxy tools.
*   Develop API endpoints for managing server definitions (`servers.json`).
*   Enhance UI for more comprehensive management.

## Acknowledgements

This project utilizes rule configurations and concepts inspired by the work of **Sukka**. We extend our sincere gratitude for her contributions to the community.

-   Sukka's Surge-compatible rule collection: [SukkaW/Surge](https://github.com/SukkaW/Surge)

## License

This project is licensed under the MIT License.
