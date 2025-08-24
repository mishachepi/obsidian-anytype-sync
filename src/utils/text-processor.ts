
/**
 * Centralized text processing utilities
 * Consolidates all sanitization and text processing logic
 */
export class TextProcessor {
  

  /**
   * YAML-safe value sanitization with length limits
   */
  static sanitizeForYaml(value: any, maxLength = 1000): string | null {
    if (value === null || value === undefined) return null;
    
    let str = String(value);
    
    // Remove control characters
    // eslint-disable-next-line no-control-regex
    str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Apply length limit
    return str.substring(0, maxLength);
  }

  /**
   * Property value sanitization for different types
   */
  static sanitizePropertyValue(value: any): any {
    if (value == null) return null;
    
    if (typeof value === 'string') {
      return this.sanitizeForYaml(value);
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    
    if (Array.isArray(value) && value.length <= 50) {
      const filteredArray = value.filter(v => typeof v === 'string' || typeof v === 'number')
                                  .map(v => this.sanitizeForYaml(v))
                                  .filter(v => v !== null);
      return filteredArray.length > 0 ? filteredArray : null;
    }
    
    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value);
        return json.length <= 500 ? this.sanitizeForYaml(json, 500) : null;
      } catch { 
        return null; 
      }
    }
    
    return null;
  }

  /**
   * Filename sanitization - removes invalid filesystem characters
   */
  static sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      return 'Untitled';
    }

    // Replace invalid filesystem characters with dashes
    let safeName = filename
      .replace(/[\\/:*?"<>|]/g, '-')  // Replace invalid chars with dash
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .trim();
    
    // Handle empty or very short names
    if (!safeName || safeName.length < 1) {
      safeName = 'Untitled';
    }
    
    // Remove multiple consecutive dashes and trim dashes from ends
    safeName = safeName.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    
    // Ensure we still have a valid name after sanitization
    if (!safeName || safeName.length === 0) {
      safeName = 'Untitled';
    }

    // Limit filename length
    if (safeName.length > 100) {
      safeName = safeName.substring(0, 100);
    }
    
    return safeName;
  }

  /**
   * Convert Anytype object links to Obsidian wikilinks
   */
  static convertAnyTypeLinksToWikilinks(markdown: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return markdown || '';
    }

    try {
      // Convert Anytype object links to Obsidian wikilinks
      // Pattern: [Link Text](anytype://object?objectId=bafyreic...)
      const anyTypeLinkPattern = /\[([^\]]+)\]\(anytype:\/\/object\?objectId=([^)]+)\)/g;
      
      const convertedMarkdown = markdown.replace(anyTypeLinkPattern, (_, linkText) => {
        // Extract clean link text and convert to wikilink format
        const cleanLinkText = linkText.trim();
        return `[[${cleanLinkText}]]`;
      });

      return convertedMarkdown;
    } catch {
      // Return original on error
      return markdown;
    }
  }

  /**
   * Convert Obsidian wikilinks to Anytype object URLs
   * Uses WikilinkResolver to find corresponding Anytype objects
   */
  static convertWikilinksToAnyTypeUrls(markdown: string, wikilinkResolver: any, currentSpaceId: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return markdown || '';
    }

    if (!wikilinkResolver || !currentSpaceId) {
      return markdown; // Return original if resolver or spaceId not provided
    }

    try {
      return wikilinkResolver.convertWikilinksToAnyTypeUrls(markdown, currentSpaceId);
    } catch {
      // Return original markdown on error to prevent data loss
      return markdown;
    }
  }

  /**
   * Format YAML line with proper escaping and quoting
   */
  static formatYamlLine(key: string, value: any): string {
    // Handle arrays (like wikilinks from object properties) with proper YAML formatting
    if (Array.isArray(value)) {
      let yamlArray = `${key}:\n`;
      for (const item of value) {
        const itemString = String(item);
        // Quote array items if they contain special characters or are wikilinks
        if (itemString.includes(':') || itemString.includes('\n') || 
            itemString.includes('"') || itemString.includes("'") ||
            itemString.startsWith(' ') || itemString.endsWith(' ') ||
            itemString.startsWith('[[') || itemString.endsWith(']]')) {
          const escapedItem = itemString.replace(/"/g, '\\"').replace(/\n/g, '\\n');
          yamlArray += `- "${escapedItem}"\n`;
        } else {
          yamlArray += `- ${itemString}\n`;
        }
      }
      return yamlArray;
    }
    
    const stringValue = String(value);
    
    // Escape special YAML characters and quote if necessary
    if (typeof value === 'string' && 
        (stringValue.includes(':') || stringValue.includes('\n') || 
         stringValue.includes('"') || stringValue.includes("'") ||
         stringValue.startsWith(' ') || stringValue.endsWith(' '))) {
      
      const escapedValue = stringValue.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      return `${key}: "${escapedValue}"\n`;
    } else {
      return `${key}: ${stringValue}\n`;
    }
  }
}