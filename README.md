# Obsidian - Anytype Sync

A plugin for synchronization between Obsidian notes and Anytype objects.

## Overview

This plugin enables seamless integration between Obsidian and Anytype, allowing you to work with your knowledge base. You can import objects from Anytype to Obsidian and sync Obsidian notes with Anytype objects. It automatically converts Anytype object links to Obsidian wikilinks, letting you harness the power of both platforms.

**Note**: This is like a pre-release version that ~~may~~ definitely contains some bugs and incomplete functionality. Be carefull with your data.

**Developed with ClaudeCode.**

### Key Features

- **Sync**: Automatically detects whether to create new objects in Anytype or update existing ones (updating is limited now)
- **Import**: Import objects from Anytype with saved properties and converted Anytype links to `[[WikiLinks]]`
- **Bidirectional Wikilink Conversion**: Preserves knowledge graph connections across platforms

You can process a single note or your entire vault. Choose which types to sync and select your target space.

### Additional Features
- **Update Type|Property keys**: Modify type and property keys for better readability

## Roadmap

- Improve smart syncing: Sync markdown note content (blocked by: https://github.com/anyproto/anytype-api/issues/5)
- Reduce codebase complexity
- Add automatic background syncing
- Support all property types (currently only text and numbers sync correctly)
- change type of Anytype object by syncing change type_key in Obsidian and sync
- Add better multi-space support
- Sync only selected properties (specify it in settings)
- Security audit (seeking someone with good typescript expertise)

## Installation

### Requirements
- **Anytype Desktop**: Must be installed and running
- **Desktop only**: Not supported on mobile

<!-- ### From Obsidian Community Plugins (Recommended) -->
<!-- 1. Open Obsidian Settings -->
<!-- 2. Go to Community Plugins and disable Safe Mode -->
<!-- 3. Click Browse and search for "Anytype Sync" -->
<!-- 4. Install and enable the plugin -->

### Manual Installation
1. Download the latest release from GitHub
2. Extract to `YourVault/.obsidian/plugins/obsidian-anytype-sync/`
3. run `npm install` and `npm run build`
4. Ensure the folder contains `main.js`, `styles.css`, and `manifest.json`

## Setup

1. **Connect**: Click connect button and provide code, Anytype must be running
2. **Select Space**: Choose your Anytype space
3. **Choose Types**: Select object types to sync (pages, tasks, bookmarks, etc.)

## Usage

### Access Methods
- **Left Sidebar Buttons**: Smart Sync and Import Current Note in left sidebar
- **Command Palette**: All sync operations via Cmd+P
- **Settings Panel**: Bulk operations and configuration

### Workflow
1. **Import**: Bring existing Anytype objects into Obsidian notes with properties (Note: Markdown is not AnyBlocks - some formatting may be lost)
2. **Sync**: Push notes to Anytype with automatic link conversion

## Configuration

- **Safe Import**: Rewrite existing note content in Obsidian if disabled
- **Skip system property**: Hide last_modified_by last_opened_date creator created_date


## Privacy & Security

- **Local Only**: All communication between local applications via `localhost:31009`
- **No Telemetry**: No usage statistics or personal data collected


## Contributing

1. Fork the repository
2. Create a feature branch  
3. Submit a pull request


## Support

- **Issues**: Report bugs and request features on GitHub
- **Documentation**: See CLAUDE.md for technical details

I am open to communication and ready to contribute, feel free to create Issues and contact me. 

## Useful links

- [Anytype developer portal](https://developers.anytype.io/)
