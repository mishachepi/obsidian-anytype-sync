/**
 * Shared property filtering constants for Anytype sync operations
 * Used by both sync and API services to maintain consistency
 */

/**
 * System properties that should be skipped when skipSystemProperties is enabled
 * These are core properties that shouldn't be modified during sync operations
 */
export const SYSTEM_PROPERTIES = [
  'id', 
  'space_id', 
  'created_date', 
  'last_modified_date', 
  'last_opened_date', 
  'type_key',
  'name'
] as const;

/**
 * Read-only/system-managed properties that cannot be set directly via Anytype API
 * These properties cause API errors if included in create/update requests
 */
export const READ_ONLY_PROPERTIES = [
  'links', 
  'backlinks', 
  'created_date', 
  'last_modified_date', 
  'last_opened_date',
  'last_modified_by', 
  'creator', 
  'size_in_bytes', 
  'file_ext', 
  'height_in_pixels', 
  'width_in_pixels', 
  'camera_iso', 
  'aperture', 
  'exposure', 
  'focal_ratio'
] as const;

/**
 * Property formats that are currently allowed for safe API operations
 * Limited to prevent API errors until full property type support is implemented
 */
export const ALLOWED_PROPERTY_FORMATS = ['text', 'number'] as const;

/**
 * System properties to skip specifically for frontmatter generation
 * Subset of SYSTEM_PROPERTIES with only the properties that should never appear in frontmatter
 */
export const FRONTMATTER_SKIP_PROPERTIES = [
  'last_modified_by', 
  'last_opened_date', 
  'creator', 
  'created_date'
] as const;

/**
 * Bundled/system properties that cannot have their keys changed via API
 * These are built-in Anytype properties that cause API errors if key modification is attempted
 */
export const IMMUTABLE_KEY_PROPERTIES = [
  'links',
  'backlinks', 
  'created_date',
  'last_modified_date',
  'last_opened_date',
  'last_modified_by',
  'creator',
  'size_in_bytes',
  'file_ext',
  'height_in_pixels',
  'width_in_pixels',
  'camera_iso',
  'aperture',
  'exposure',
  'focal_ratio',
  'audio_album',
  'artist',
  'audio_genre',
  'audio_lyrics',
  'released_year',
  'audio_album_track_number'
] as const;