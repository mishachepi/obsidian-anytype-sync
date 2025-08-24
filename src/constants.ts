/**
 * Essential constants for Anytype sync plugin
 */

// Core API settings that are used in multiple places
export const ANYTYPE_API_URL = 'http://localhost:31009';
export const ANYTYPE_API_VERSION = '2025-05-20';

// Content size limits (prevent memory issues)
export const MAX_CONTENT_SIZE = 1000000; // 1MB
export const MAX_NOTE_SIZE = 10000000;   // 10MB

// Authentication
export const AUTH_CODE_LENGTH = 4;

// Pagination
export const API_PAGE_SIZE = 100;