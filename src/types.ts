export interface AnyTypeSettings {
  apiKey: string;
  spaceId: string;
  spaceName: string;
  logLevel: 'error' | 'info' | 'debug';
  encodedApiKey: string;
  isAuthenticated: boolean;
  // UI Control Flags
  showSyncButton: boolean;
  showImportButton: boolean;
  hideQuickSetup: boolean;
  // Content Control Flag
  skipSystemProperties: boolean;
  // Object Types to sync
  syncObjectTypes: string[];
  // Performance optimization for large imports
  resolveObjectLinks: boolean;
  // Safe Import - preserve existing markdown content during import
  safeImport: boolean;
  // Import folder - folder where imported objects are created
  importFolder: string;
}

export const DEFAULT_SETTINGS: AnyTypeSettings = {
  apiKey: '',
  spaceId: '',
  spaceName: '',
  logLevel: 'info',
  encodedApiKey: '',
  isAuthenticated: false,
  showSyncButton: true,
  showImportButton: false,
  hideQuickSetup: false,
  skipSystemProperties: true,
  syncObjectTypes: ['page'],
  resolveObjectLinks: true,
  safeImport: true,
  importFolder: ''
};

export interface SyncStatus {
  isConnected: boolean;
  lastSync: Date | null;
}

export interface AnyTypeObject {
  id: string;
  name: string;
  type_key: string;
  markdown?: string;
  space_id: string;
  properties: Record<string, string | number | boolean | string[] | null>;
}

export interface CreateObjectRequest {
  name?: string;
  type_key: string;
  body?: string;
  icon?: Record<string, unknown>;
  template_id?: string;
  properties?: PropertyValue[];
}

export interface SyncOptions {
  skipSystemProperties?: boolean;
  resolveObjectLinks?: boolean;
  safeImport?: boolean;
  objectTypes?: string[];
  updateStatusCallback?: (status: string) => void;
  importFolder?: string;
}

export interface NoteCreationOptions {
  skipSystemProperties?: boolean;
  safeImport?: boolean;
  importFolder?: string;
}

export interface PropertyProcessingOptions {
  skipSystemProperties?: boolean;
}

// Property value types based on Anytype API specification
export interface PropertyValue {
  key: string;
  text?: string;
  number?: number;
  checkbox?: boolean;
  date?: string;
  url?: string;
  email?: string;
  phone?: string;
  select?: string;
  multi_select?: string[];
  files?: string[];
  objects?: string[];
}

export interface SyncResult {
  created: number;
  updated: number;
  failed: number;
  skipped?: number;
  byType?: Record<string, { created: number; updated: number; failed: number }>;
  objectTypes?: string[];
}

// Space interfaces
export interface AnyTypeSpace {
  id: string;
  name: string;
  description?: string;
  icon?: {
    format: string;
    emoji?: string;
    file?: string;
    name?: string;
    color?: string;
  };
  network_id: string;
  object: string;
}

export interface ListSpacesResponse {
  data: AnyTypeSpace[];
  pagination: {
    has_more: boolean;
    limit: number;
    offset: number;
    total: number;
  };
}

// Object Type interfaces
export interface AnyTypeObjectType {
  id: string;
  key: string;
  name: string;
  plural_name: string;
  layout: 'basic' | 'profile' | 'action' | 'note' | 'bookmark' | 'set' | 'collection' | 'participant';
  archived: boolean;
  icon?: {
    format: string;
    emoji?: string;
    file?: string;
    name?: string;
    color?: string;
  };
  object: string;
  properties: AnyTypeProperty[];
}

export interface AnyTypeProperty {
  id: string;
  key: string;
  name: string;
  format: 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'files' | 'checkbox' | 'url' | 'email' | 'phone' | 'objects';
  object: string;
}

export interface ListTypesResponse {
  data: AnyTypeObjectType[];
  pagination: {
    has_more: boolean;
    limit: number;
    offset: number;
    total: number;
  };
}
