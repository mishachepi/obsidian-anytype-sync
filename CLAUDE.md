# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Technical guidance for Claude Code when working with the Obsidian-Anytype Sync Plugin.

# Obsidian-Anytype Sync Plugin

Bidirectional synchronization between Obsidian and Anytype with wikilink preservation.

## Core Functionality

### Wikilinks

Wikilinks are the plugin's core value - preserving knowledge connections across platforms:

1. **Anytype → Obsidian**: `[Object](anytype://...)` becomes `[[Object]]`
2. **Obsidian → Anytype**: `[[Note]]` becomes `[Note](anytype://object?objectId=...)`
3. **Link Resolution**: Object IDs resolved to obsidian wikilinks

### Synchronization Features

1. **Import from Anytype**: Import objects with wikilink conversion
2. **Import Current Note**: Selective import by Anytype ID
3. **Sync All**: Push and Pull notes with link preservation
4. **Sync Current Note**: Intelligent create/update based on note state

### Advanced Features

5. **Bidirectional Wikilinks**: Smart resolution with 30-second caching
6. **Safe Import**: Preserve existing content, update frontmatter only

## Anytype API Integration

- **Base URL**: `http://localhost:31009`
- **API Version**: `2025-05-20`
- **Authentication**: Bearer token via API key
- **CORS**: Uses Obsidian's `requestUrl()`

### Key Endpoints
- Authentication, spaces, objects, properties, types
- Full CRUD operations with markdown format support

### Property Handling

- **Property Sync**: User-selectable with real-time filtering
- **Wikilink Resolution**: Object properties → wikilinks in Obsidian
- **Property Types**: text, objects (→wikilinks), select, date, checkbox, etc.
- **API Format**: Standard JSON with property key/value pairs

## Core Sync Flow

1. **Import**: Anytype → Obsidian with link conversion
2. **Export**: Obsidian → Anytype with link preservation  

## Architecture

```
src/
├── services/              # Core business logic
│   ├── api-service.ts    # Anytype API interactions
│   ├── sync-service.ts   # Sync operations and wikilink resolution
│   └── auth-service.ts   # Authentication handling
├── ui/                   # User interface
│   └── settings-tab.ts   # Plugin settings
├── utils/                # Utilities (DRY implementation)
│   ├── text-processor.ts # Link conversion
│   ├── property-processor.ts # Property handling
│   ├── wikilink-resolver.ts # Link resolution
│   ├── validation.ts     # Core validation
│   ├── api-validator.ts  # API parameter validation
│   ├── encryption.ts     # Security utilities
│   └── logger.ts         # Debug and error logging
├── constants/            # Application constants
│   └── property-filters.ts # Property filtering rules
├── types.ts              # TypeScript interfaces
├── constants.ts          # Core constants
└── main.ts               # Plugin entry point
```

### Key Decisions

1. **Service Layer**: Clean separation of concerns
2. **CORS**: Uses Obsidian's `requestUrl()`  
3. **Wikilink Priority**: Knowledge graph preservation
4. **Property Precedence**: User-controlled conflict resolution
5. **Safe Import**: Content preservation by default
6. **Caching**: 30-second cache for performance
7. **DRY/KISS**: Centralized utilities

### Data Flow

1. **Import**: Fetch → Convert links → Generate frontmatter → Create notes
2. **Export**: Extract properties → Convert wikilinks → Create objects
3. **Property Sync**: Select properties → Apply precedence → Validate → Sync
4. **Wikilink Resolution**: Cache names → Match patterns → Convert links

## User Interface

- **Setup**: 3-step guide with status indicators
- **Auto-loading**: Types refresh when space selected
- **Real-time**: Immediate feedback and updates
- **Accessibility**: Standard sections, no collapsing

## Code Quality

### DRY Implementation
- **TextProcessor**: Unified text processing and link conversion
- **PropertyProcessor**: Centralized property handling
- **ApiValidator**: Single validation point
- **Unified Requests**: Single `makeApiRequest()` method

### Error Handling
- **Multi-layer Validation**: Parameters, formats, size limits
- **User-friendly Messages**: Clear, actionable guidance
- **Graceful Degradation**: Fallback behavior
- **Comprehensive Logging**: Debug, info, error levels

## Development Guidelines

### Standards
- **TypeScript**: Strict typing with comprehensive interfaces
- **ESLint**: Code quality enforcement
- **Error Boundaries**: Robust error handling
- **Performance**: Real-time processing with progress indicators

### Security
- **Local Operation**: No external communication
- **Input Sanitization**: Comprehensive validation
- **API Key Security**: Encrypted local storage
- **Content Validation**: Size and format limits

## Development Commands

```bash
npm install    # Install dependencies
npm run dev    # Development build with watch
npm run build  # Production build (includes type check)
npx eslint .   # Lint all files using eslint.config.mjs
npx tsc --noEmit --skipLibCheck # Type check only
```

### Testing
- Anytype Desktop must be running on `localhost:31009`
- Test authentication and sync operations

## Architecture Details

### Service Layer
- **ApiService**: Anytype API communication
- **SyncService**: Note-to-object synchronization
- **AuthService**: Authentication management
- **Settings UI**: Configuration with real-time feedback

### Processing Pipeline
1. **Validation**: Ensure valid API parameters
2. **Processing**: Handle properties and text conversion
3. **Communication**: API requests with error handling
4. **File Operations**: Obsidian file management

### Performance
- **Real-time Processing**: Immediate object processing
- **Intelligent Caching**: Object name resolution
- **Error Recovery**: Continue after individual failures

## Implementation Notes

### Wikilink Conversion
- **Import**: `[Text](anytype://...)` → `[[Text]]`
- **Export**: `[[Note]]` → `[Note](anytype://object?objectId=...)`

### Property Sync
- **Selection**: Properties by ID, used by key in API
- **Type Safety**: Format validation before submission
- **System Exclusion**: Filter read-only properties
- **Custom Preservation**: Maintain Obsidian-specific properties

### API Integration
- **Authentication**: Challenge/response with 4-digit code
- **Unified Requests**: Single `makeApiRequest()` method
- **Error Handling**: User-friendly status messages
- **Performance Timing**: Logged execution times

## Development Instructions

### Reminders
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files
- NEVER proactively create documentation files

### Architecture Status
Optimized for maintainable, scalable code with knowledge graph preservation:

- **Code Quality**: DRY/KISS principles with centralized utilities
- **User Experience**: Intuitive UI with automatic type loading
- **Performance**: Real-time processing with intelligent caching
- **Reliability**: Comprehensive error handling and validation
- **Security**: Local operation with proper sanitization


---

## Issues

  📊 Impact Assessment

  | Issue             | Lines Affected   | Maintenance Impact | Bug Risk |
  |-------------------|------------------|--------------------|----------|
  | Large files       | 3,400+           | 🔴 High            | 🔴 High  |
  | Inline CSS        | 30+              | 🟡 Medium          | 🟢 Low   |
  | Error handling    | 54+ catch blocks | 🟡 Medium          | 🔴 High  |
  | Type safety       | 29+ instances    | 🔴 High            | 🔴 High  |
  | Hardcoded strings | 51+ messages     | 🟡 Medium          | 🟢 Low   |


### WikilinkResolver Cache
- Location: src/utils/wikilink-resolver.ts:11
- Type: Map<string, { objectId: string; spaceId: string }>
- Risk Level: 🟡 LOW to MEDIUM
- Mitigation: Has 30-second TTL expiry ✅
- Size: Limited by vault size (number of notes)
- Cleanup: Has clearCache() method but not called on unload

  1. 🚨 GIANT FILES (Most Hated)

  - sync-service.ts: 880+ lines - MASSIVE class doing everything
  - api-service.ts: 940+ lines - God object antipattern
  - settings-tab.ts: 1,100+ lines - UI nightmare

  Fix: Break into focused, single-responsibility classes

  2. 🚨 METHODS FROM HELL

  // 100+ line monsters that do 5 different things
  async syncFromAnyType() { /* 80 lines of mixed logic */ }
  async createOrUpdateObsidianNote() { /* 60 lines */ }
  Fix: Extract into smaller, focused methods

  3. 🚨 NO SEPARATION OF CONCERNS

  - SyncService does: API calls, file I/O, UI notices,
  validation, text processing
  - ApiService does: HTTP, caching, validation, text processing,
   business logic
  - Everything mixed together = debugging nightmare

  Fix: Separate layers (API → Business Logic → UI)

  4. 🚨 HARDCODED STRINGS EVERYWHERE

  new Notice(`⚠️ Anytype object "${name}" contains
  characters...`, 8000);
  // Scattered throughout codebase
  Fix: Constants file for all user-facing strings
