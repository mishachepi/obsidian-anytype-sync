import { PropertyValue } from '../types';
import { Logger } from './logger';
import { ALLOWED_PROPERTY_FORMATS, READ_ONLY_PROPERTIES, SYSTEM_PROPERTIES } from '../constants/property-filters';
import { PropertyProcessingOptions } from '../types';
import { TagResolver } from './tag-resolver';

/**
 * Centralized property processing utilities
 * Consolidates all property-related operations in one place
 */
export class PropertyProcessor {
  private logger: Logger;
  private tagResolver: TagResolver;

  constructor(logger: Logger, tagResolver: TagResolver) {
    this.logger = logger;
    this.tagResolver = tagResolver;
  }

  /**
   * Extract properties from API response format to frontend format
   * Enhanced to resolve tag IDs to names for select/multi_select properties
   */
  extractFromResponse(responseProperties: any[], availableProperties?: any[]): Record<string, any> {
    if (!Array.isArray(responseProperties)) {
      return {};
    }

    const extractedProperties: Record<string, any> = {};
    
    // Create property map for format lookup
    const propertyMap = new Map<string, any>();
    if (availableProperties) {
      for (const prop of availableProperties) {
        propertyMap.set(prop.key, prop);
      }
    }

    for (const prop of responseProperties) {
      if (!prop || !prop.key) {
        continue;
      }

      const key = prop.key;
      let value: any = null;

      // Extract value based on property format
      if (prop.text !== undefined) {
        value = prop.text;
      } else if (prop.number !== undefined) {
        value = prop.number;
      } else if (prop.checkbox !== undefined) {
        value = prop.checkbox;
      } else if (prop.date !== undefined) {
        value = prop.date;
      } else if (prop.url !== undefined) {
        value = prop.url;
      } else if (prop.email !== undefined) {
        value = prop.email;
      } else if (prop.phone !== undefined) {
        value = prop.phone;
      } else if (prop.select !== undefined) {
        // Handle select property - try to resolve ID to name
        const propertyDef = propertyMap.get(key);
        if (propertyDef && this.tagResolver.areTagsCached(propertyDef.id)) {
          // If we have tag info (with name), use it directly
          if (prop.select.name) {
            value = prop.select.name;
          } else if (prop.select.id) {
            // Try to resolve tag ID to name
            const tagName = this.tagResolver.resolveTagIdToName(propertyDef.id, prop.select.id);
            value = tagName || prop.select.id; // Fallback to ID if resolution fails
            this.logger.debug(`Resolved tag ID "${prop.select.id}" to name "${value}" for property "${key}"`);
          } else {
            // Use whatever value we have
            value = prop.select;
          }
        } else {
          // No tag cache available, use name if available or fallback to ID/value
          value = prop.select.name || prop.select.id || prop.select;
        }
      } else if (prop.multi_select !== undefined && Array.isArray(prop.multi_select)) {
        // Handle multi_select property - try to resolve IDs to names
        const propertyDef = propertyMap.get(key);
        if (propertyDef && this.tagResolver.areTagsCached(propertyDef.id)) {
          const tagValues: string[] = [];
          for (const tag of prop.multi_select) {
            if (tag.name) {
              // If we have tag info with name, use it directly
              tagValues.push(tag.name);
            } else if (tag.id) {
              // Try to resolve tag ID to name
              const tagName = this.tagResolver.resolveTagIdToName(propertyDef.id, tag.id);
              tagValues.push(tagName || tag.id); // Fallback to ID if resolution fails
            } else {
              // Use whatever value we have
              tagValues.push(tag);
            }
          }
          value = tagValues.filter(Boolean);
          this.logger.debug(`Resolved ${tagValues.length} tags for multi_select property "${key}"`);
        } else {
          // No tag cache available, use names if available or fallback to IDs/values
          value = prop.multi_select.map((tag: any) => tag.name || tag.id || tag).filter(Boolean);
        }
      } else if (prop.files && Array.isArray(prop.files)) {
        value = prop.files.map((file: any) => file.id || file).filter(Boolean);
      } else if (prop.objects && Array.isArray(prop.objects)) {
        // This will be converted to wikilinks later in the pipeline
        value = prop.objects.map((obj: any) => obj.id || obj).filter(Boolean);
      }

      if (value !== null) {
        extractedProperties[key] = value;
        this.logger.debug(`Extracted property: ${key} = ${JSON.stringify(value)}`);
      }
    }

    const extractedCount = Object.keys(extractedProperties).length;
    this.logger.debug(`Extracted ${extractedCount} properties from API response`);
    
    return extractedProperties;
  }

  /**
   * Extract and validate properties from frontmatter for API submission
   * Enhanced with property preservation - only sync properties available in Anytype
   */
  extractFromFrontmatter(frontmatter: Record<string, any>, availableProperties: any[], options: PropertyProcessingOptions = {}): PropertyValue[] {
    const { skipSystemProperties = true } = options;
    const extractedProperties: PropertyValue[] = [];
    const preservedProperties: string[] = [];
    const propertyMap = new Map<string, any>();
    
    for (const prop of availableProperties) {
      propertyMap.set(prop.key, prop);
    }

    for (const [key, value] of Object.entries(frontmatter)) {
      // Skip system properties if requested
      if (skipSystemProperties && SYSTEM_PROPERTIES.includes(key as any)) {
        this.logger.debug(`Skipping system property for update: ${key}`);
        continue;
      }
      
      // Skip read-only properties that cause API errors
      if (READ_ONLY_PROPERTIES.includes(key as any)) {
        this.logger.debug(`Skipping read-only property for update: ${key}`);
        continue;
      }
      
      // Check if property exists in available properties
      const propertyDef = propertyMap.get(key);
      if (!propertyDef) {
        // FIXED: Instead of completely skipping missing properties, attempt to infer their type and sync them
        const inferredFormat = this.inferPropertyFormat(key, value);
        if (inferredFormat) {
          this.logger.info(`Property "${key}" not found in Anytype, inferring format as "${inferredFormat}" and attempting sync`);
          // Create a mock property definition for processing (used for logging context)
          const formattedProperty = this.formatForAPI(key, value, inferredFormat, undefined);
          if (formattedProperty) {
            extractedProperties.push(formattedProperty);
            this.logger.debug(`Syncing inferred property: ${key} (${inferredFormat})`);
          }
        } else {
          preservedProperties.push(key);
          this.logger.debug(`Property "${key}" not found in Anytype properties and cannot infer format - preserving in Obsidian only`);
        }
        continue;
      }
      
      // All property formats are now supported
      if (!ALLOWED_PROPERTY_FORMATS.includes(propertyDef.format as any)) {
        this.logger.debug(`Skipping property "${key}" with unsupported format "${propertyDef.format}"`);
        continue;
      }
      
      // Format property according to its type
      const formattedProperty = this.formatForAPI(key, value, propertyDef.format, propertyDef.id);
      if (formattedProperty) {
        extractedProperties.push(formattedProperty);
        this.logger.debug(`Extracted property for update: ${key} (${propertyDef.format})`);
      }
    }

    if (preservedProperties.length > 0) {
      this.logger.info(`Preserved ${preservedProperties.length} Obsidian-only properties: ${preservedProperties.join(', ')}`);
    }
    this.logger.info(`Extracted ${extractedProperties.length} properties for API submission (all supported types)`);
    return extractedProperties;
  }

  /**
   * Build validated properties from note frontmatter for object creation
   * Enhanced to support all property types with preservation logic
   */
  buildValidatedProperties(noteFrontmatter: Record<string, any>, availableProperties: any[], options: PropertyProcessingOptions = {}): any[] {
    const { skipSystemProperties = true } = options;
    const validatedProperties: any[] = [];
    const preservedProperties: string[] = [];
    
    // Create a map of available property keys for quick lookup
    const propertyMap = new Map<string, any>();
    for (const prop of availableProperties) {
      propertyMap.set(prop.key, prop);
    }
    
    this.logger.debug(`Available property keys: ${Array.from(propertyMap.keys()).join(', ')}`);

    for (const [key, value] of Object.entries(noteFrontmatter)) {
      // Skip system properties if requested
      if (skipSystemProperties && SYSTEM_PROPERTIES.includes(key as any)) {
        this.logger.debug(`Skipping system property: ${key}`);
        continue;
      }
      
      // Skip read-only properties that cause API errors
      if (READ_ONLY_PROPERTIES.includes(key as any)) {
        this.logger.debug(`Skipping read-only property for creation: ${key}`);
        continue;
      }
      
      // Check if property exists in available properties
      const propertyDef = propertyMap.get(key);
      if (!propertyDef) {
        // FIXED: Instead of completely skipping missing properties, attempt to infer their type and sync them
        const inferredFormat = this.inferPropertyFormat(key, value);
        if (inferredFormat) {
          this.logger.info(`Property "${key}" not found in Anytype, inferring format as "${inferredFormat}" and attempting sync`);
          // Create a mock property definition for processing
          const formattedProperty = this.formatForAPI(key, value, inferredFormat, undefined);
          if (formattedProperty) {
            validatedProperties.push(formattedProperty);
            this.logger.debug(`Syncing inferred property: ${key} (${inferredFormat})`);
          }
        } else {
          preservedProperties.push(key);
          this.logger.debug(`Property "${key}" not found in Anytype properties and cannot infer format - will be preserved in Obsidian only`);
        }
        continue;
      }
      
      // All property formats are now supported
      if (!ALLOWED_PROPERTY_FORMATS.includes(propertyDef.format as any)) {
        this.logger.debug(`Skipping property "${key}" with unsupported format "${propertyDef.format}"`);
        continue;
      }
      
      // Format property according to its type
      const formattedProperty = this.formatForAPI(key, value, propertyDef.format, propertyDef.id);
      if (formattedProperty) {
        validatedProperties.push(formattedProperty);
        this.logger.debug(`Added validated property: ${key} (${propertyDef.format})`);
      }
    }
    
    if (preservedProperties.length > 0) {
      this.logger.info(`Will preserve ${preservedProperties.length} Obsidian-only properties: ${preservedProperties.join(', ')}`);
    }
    this.logger.info(`Built ${validatedProperties.length} properties for creation (all supported types)`);
    return validatedProperties;
  }

  /**
   * Check if a property is tag-like based on its key name
   * Centralized tag detection logic
   */
  private isTagProperty(key: string): boolean {
    const tagKeywords = ['tag', 'tags', 'category', 'categories', 'status', 'priority', 'type', 'label', 'labels'];
    const lowerKey = key.toLowerCase();
    return tagKeywords.some(keyword => lowerKey.includes(keyword)) || lowerKey === 'tags';
  }

  /**
   * Infer property format based on key name and value type
   * Used when property doesn't exist in Anytype yet
   * Enhanced with DRY tag detection
   */
  private inferPropertyFormat(key: string, value: any): string | null {
    // Priority 1: Tag-like properties (most important for user's issue)
    if (this.isTagProperty(key)) {
      if (Array.isArray(value)) {
        return 'multi_select';
      } else if (typeof value === 'string') {
        return 'select';
      }
    }
    
    // Priority 2: Special property name 'tags' - ALWAYS multi_select
    if (key.toLowerCase() === 'tags') {
      return 'multi_select';
    }
    
    // Priority 3: Infer by value type
    if (typeof value === 'string') {
      // Check for specific formats
      if (value.match(/^\d{4}-\d{2}-\d{2}/) || value.match(/^\d{4}-\d{2}-\d{2}T/)) {
        return 'date';
      }
      if (value.startsWith('http://') || value.startsWith('https://')) {
        return 'url';
      }
      if (value.includes('@') && value.includes('.')) {
        return 'email';
      }
      if (value.match(/^[\d\s\-+()]+$/)) {
        return 'phone';
      }
      // Default to text for strings
      return 'text';
    } else if (typeof value === 'number') {
      return 'number';
    } else if (typeof value === 'boolean') {
      return 'checkbox';
    } else if (Array.isArray(value)) {
      // Default array to multi_select (likely tags)
      return 'multi_select';
    }
    
    return null; // Cannot infer
  }

  /**
   * Process tag-like property values with unified logic
   * DRY method for select, multi_select, and inferred tag properties
   */
  private processTagProperty(key: string, value: any, format: 'select' | 'multi_select', propertyId?: string): PropertyValue | null {
    if (format === 'select') {
      const selectValue = String(value).trim();
      if (selectValue.length === 0) {
        this.logger.debug(`Empty select value for property "${key}"`);
        return null;
      }
      
      this.logger.debug(`Processing select/tag property "${key}" with value "${selectValue}", propertyId: ${propertyId}`);
      
      // Try to resolve tag name to ID if we have a propertyId
      if (propertyId && this.tagResolver.areTagsCached(propertyId)) {
        this.logger.debug(`Tags are cached for property ${propertyId}, attempting resolution`);
        const tagId = this.tagResolver.resolveTagNameToId(propertyId, selectValue);
        if (tagId) {
          this.logger.debug(`Resolved tag name "${selectValue}" to ID "${tagId}" for property "${key}"`);
          return { key, select: tagId };
        } else {
          this.logger.warn(`Could not resolve tag name "${selectValue}" for property "${key}", preserving as tag name`);
          return { key, select: selectValue };
        }
      } else {
        if (!propertyId) {
          this.logger.warn(`No propertyId provided for select property "${key}"`);
        } else {
          this.logger.warn(`Tags not cached for property ${propertyId} (key: "${key}")`);
        }
        return { key, select: selectValue };
      }
    } else { // multi_select
      // Handle various array formats
      let arrayValue: string[];
      
      if (Array.isArray(value)) {
        arrayValue = value.filter(v => v !== null && v !== undefined && v !== '')
                         .map(v => String(v).trim())
                         .filter(v => v.length > 0);
      } else if (typeof value === 'string') {
        // Try to parse comma-separated values
        arrayValue = value.split(',')
                         .map(v => v.trim())
                         .filter(v => v.length > 0);
      } else {
        this.logger.warn(`multi_select property "${key}" must be an array or comma-separated string`);
        return null;
      }
      
      if (arrayValue.length === 0) {
        this.logger.debug(`Empty multi_select array for property "${key}"`);
        return null;
      }
      
      // Try to resolve tag names to IDs if we have a propertyId
      if (propertyId && this.tagResolver.areTagsCached(propertyId)) {
        // Handle mixed resolution: some tags exist, some don't
        const resolvedValues: string[] = [];
        let resolvedCount = 0;
        
        for (const tagName of arrayValue) {
          const tagId = this.tagResolver.resolveTagNameToId(propertyId, tagName);
          if (tagId) {
            resolvedValues.push(tagId);
            resolvedCount++;
          } else {
            // Keep the original tag name - Anytype may create it
            resolvedValues.push(tagName);
            this.logger.debug(`Preserving unresolved tag "${tagName}" for property "${key}"`);
          }
        }
        
        if (resolvedCount > 0) {
          this.logger.debug(`Resolved ${resolvedCount}/${arrayValue.length} tag names to IDs for property "${key}"`);
        } else {
          this.logger.debug(`No tags resolved for property "${key}", preserving all as tag names`);
        }
        
        return { key, multi_select: resolvedValues };
      } else {
        // Assume values are already tag IDs or we don't have tags cached
        this.logger.debug(`Using values as-is for multi_select property "${key}"`);
        return { key, multi_select: arrayValue };
      }
    }
  }

  /**
   * Format a property value for API submission based on its type
   * Enhanced to handle all Anytype property types with robust validation
   * DRY implementation using unified tag processing
   */
  private formatForAPI(key: string, value: any, format: string, propertyId?: string): PropertyValue | null {
    try {
      // Handle null/undefined values - but allow arrays and objects to be processed by their specific handlers
      if (value === null || value === undefined) {
        this.logger.debug(`Skipping null/undefined value for property "${key}"`);
        return null;
      }
      
      // Only skip empty strings for non-array/non-object formats
      if (value === '' && !Array.isArray(value) && typeof value !== 'object') {
        this.logger.debug(`Skipping empty string value for property "${key}"`);
        return null;
      }

      switch (format) {
        case 'text':
          return { key, text: String(value) };
          
        case 'number': {
          // Handle both number and string representations
          const numValue = typeof value === 'number' ? value : Number(value);
          if (isNaN(numValue) || !isFinite(numValue)) {
            this.logger.warn(`Invalid number value for property "${key}": ${value}`);
            return null;
          }
          return { key, number: numValue };
        }
          
        case 'checkbox': {
          // Handle various boolean representations
          let boolValue: boolean;
          if (typeof value === 'boolean') {
            boolValue = value;
          } else if (typeof value === 'string') {
            boolValue = value.toLowerCase() === 'true' || value === '1' || value === 'yes';
          } else if (typeof value === 'number') {
            boolValue = value !== 0;
          } else {
            boolValue = Boolean(value);
          }
          return { key, checkbox: boolValue };
        }
          
        case 'date': {
          // Handle various date formats
          let dateValue: string;
          
          if (typeof value === 'string') {
            // Check for ISO format first
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
              dateValue = value;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              // Convert YYYY-MM-DD to ISO format
              dateValue = `${value}T00:00:00.000Z`;
            } else {
              // Try to parse as date
              const parsed = new Date(value);
              if (isNaN(parsed.getTime())) {
                this.logger.warn(`Invalid date format for property "${key}": ${value}`);
                return null;
              }
              dateValue = parsed.toISOString();
            }
          } else if (value instanceof Date) {
            dateValue = value.toISOString();
          } else if (typeof value === 'number') {
            // Assume timestamp
            dateValue = new Date(value).toISOString();
          } else {
            this.logger.warn(`Invalid date format for property "${key}": ${value}`);
            return null;
          }
          
          return { key, date: dateValue };
        }
          
        case 'url': {
          const urlString = String(value);
          // More flexible URL validation
          if (urlString.startsWith('http://') || 
              urlString.startsWith('https://') || 
              urlString.startsWith('ftp://') || 
              urlString.startsWith('mailto:')) {
            return { key, url: urlString };
          }
          // Try to auto-fix common cases
          if (urlString.includes('.') && !urlString.includes(' ')) {
            const fixedUrl = `https://${urlString}`;
            this.logger.debug(`Auto-fixing URL for property "${key}": ${value} -> ${fixedUrl}`);
            return { key, url: fixedUrl };
          }
          this.logger.warn(`Invalid URL format for property "${key}": ${value}`);
          return null;
        }
          
        case 'email': {
          const emailString = String(value).trim();
          // Basic email validation
          if (emailString.includes('@') && emailString.includes('.')) {
            return { key, email: emailString };
          }
          this.logger.warn(`Invalid email format for property "${key}": ${value}`);
          return null;
        }
          
        case 'phone':
          // Accept any string for phone numbers
          return { key, phone: String(value).trim() };
          
        case 'select':
          return this.processTagProperty(key, value, 'select', propertyId);
          
        case 'multi_select':
          return this.processTagProperty(key, value, 'multi_select', propertyId);
          
        case 'files': {
          // Handle file ID arrays
          let fileIds: string[];
          
          if (Array.isArray(value)) {
            fileIds = value.filter(v => v !== null && v !== undefined && v !== '')
                          .map(v => String(v).trim())
                          .filter(v => v.length > 0);
          } else if (typeof value === 'string') {
            // Single file ID or comma-separated
            fileIds = value.split(',')
                          .map(v => v.trim())
                          .filter(v => v.length > 0);
          } else {
            this.logger.warn(`files property "${key}" must be an array of file IDs or comma-separated string`);
            return null;
          }
          
          if (fileIds.length === 0) {
            this.logger.debug(`Empty files array for property "${key}"`);
            return null;
          }
          
          return { key, files: fileIds };
        }
          
        case 'objects': {
          // Handle object ID arrays
          let objectIds: string[];
          
          if (Array.isArray(value)) {
            objectIds = value.filter(v => v !== null && v !== undefined && v !== '')
                            .map(v => String(v).trim())
                            .filter(v => v.length > 0);
          } else if (typeof value === 'string') {
            // Single object ID or comma-separated
            objectIds = value.split(',')
                            .map(v => v.trim())
                            .filter(v => v.length > 0);
          } else {
            this.logger.warn(`objects property "${key}" must be an array of object IDs or comma-separated string`);
            return null;
          }
          
          if (objectIds.length === 0) {
            this.logger.debug(`Empty objects array for property "${key}"`);
            return null;
          }
          
          return { key, objects: objectIds };
        }
          
        default:
          this.logger.warn(`Unsupported property format "${format}" for property "${key}"`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Error formatting property "${key}": ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}