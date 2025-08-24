import { PropertyValue } from '../types';
import { Logger } from './logger';
import { ALLOWED_PROPERTY_FORMATS, READ_ONLY_PROPERTIES, SYSTEM_PROPERTIES } from '../constants/property-filters';
import { PropertyProcessingOptions } from '../types';

/**
 * Centralized property processing utilities
 * Consolidates all property-related operations in one place
 */
export class PropertyProcessor {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Extract properties from API response format to frontend format
   */
  extractFromResponse(responseProperties: any[]): Record<string, any> {
    if (!Array.isArray(responseProperties)) {
      return {};
    }

    const extractedProperties: Record<string, any> = {};

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
      } else if (prop.select && prop.select.name) {
        value = prop.select.name;
      } else if (prop.multi_select && Array.isArray(prop.multi_select)) {
        value = prop.multi_select.map((tag: any) => tag.name || tag).filter(Boolean);
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
   */
  extractFromFrontmatter(frontmatter: Record<string, any>, availableProperties: any[], options: PropertyProcessingOptions = {}): PropertyValue[] {
    const { skipSystemProperties = true } = options;
    const extractedProperties: PropertyValue[] = [];
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
        this.logger.debug(`Property "${key}" not found in available properties, skipping for update`);
        continue;
      }
      
      // Only allow safe property formats for now
      if (!ALLOWED_PROPERTY_FORMATS.includes(propertyDef.format as any)) {
        this.logger.debug(`Skipping property "${key}" with unsupported format "${propertyDef.format}" (only text and number allowed for now)`);
        continue;
      }
      
      // Format property according to its type
      const formattedProperty = this.formatForAPI(key, value, propertyDef.format);
      if (formattedProperty) {
        extractedProperties.push(formattedProperty);
        this.logger.debug(`Extracted safe property for update: ${key} (${propertyDef.format})`);
      }
    }

    this.logger.info(`Extracted ${extractedProperties.length} safe properties for API submission (text/number only)`);
    return extractedProperties;
  }

  /**
   * Build validated properties from note frontmatter for object creation
   */
  buildValidatedProperties(noteFrontmatter: Record<string, any>, availableProperties: any[], options: PropertyProcessingOptions = {}): any[] {
    const { skipSystemProperties = true } = options;
    const validatedProperties: any[] = [];
    
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
        this.logger.warn(`Property "${key}" not found in available properties, skipping`);
        continue;
      }
      
      // Only allow safe property formats for now
      if (!ALLOWED_PROPERTY_FORMATS.includes(propertyDef.format as any)) {
        this.logger.debug(`Skipping property "${key}" with unsupported format "${propertyDef.format}" (only text and number allowed for now)`);
        continue;
      }
      
      // Format property according to its type
      const formattedProperty = this.formatForAPI(key, value, propertyDef.format);
      if (formattedProperty) {
        validatedProperties.push(formattedProperty);
        this.logger.debug(`Added validated safe property: ${key} (${propertyDef.format})`);
      }
    }
    
    this.logger.info(`Built ${validatedProperties.length} safe properties for creation (text/number only)`);
    return validatedProperties;
  }

  /**
   * Format a property value for API submission based on its type
   */
  private formatForAPI(key: string, value: any, format: string): PropertyValue | null {
    try {
      switch (format) {
        case 'text':
          return { key, text: String(value) };
          
        case 'number': {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            this.logger.warn(`Invalid number value for property "${key}": ${value}`);
            return null;
          }
          return { key, number: numValue };
        }
          
        case 'checkbox':
          return { key, checkbox: Boolean(value) };
          
        case 'date':
          // Expect ISO date string
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            return { key, date: value };
          }
          this.logger.warn(`Invalid date format for property "${key}": ${value}`);
          return null;
          
        case 'url':
          if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
            return { key, url: value };
          }
          this.logger.warn(`Invalid URL format for property "${key}": ${value}`);
          return null;
          
        case 'email':
          if (typeof value === 'string' && value.includes('@')) {
            return { key, email: value };
          }
          this.logger.warn(`Invalid email format for property "${key}": ${value}`);
          return null;
          
        case 'phone':
          return { key, phone: String(value) };
          
        case 'select':
          // Expect tag ID string
          return { key, select: String(value) };
          
        case 'multi_select':
          // Expect array of tag IDs
          if (Array.isArray(value)) {
            return { key, multi_select: value.map(v => String(v)) };
          }
          this.logger.warn(`multi_select property "${key}" must be an array`);
          return null;
          
        case 'files':
          // Expect array of file IDs
          if (Array.isArray(value)) {
            return { key, files: value.map(v => String(v)) };
          }
          this.logger.warn(`files property "${key}" must be an array`);
          return null;
          
        case 'objects':
          // Expect array of object IDs
          if (Array.isArray(value)) {
            return { key, objects: value.map(v => String(v)) };
          }
          this.logger.warn(`objects property "${key}" must be an array`);
          return null;
          
        default:
          this.logger.warn(`Unsupported property format "${format}" for property "${key}"`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Error formatting property "${key}": ${error.message}`);
      return null;
    }
  }
}