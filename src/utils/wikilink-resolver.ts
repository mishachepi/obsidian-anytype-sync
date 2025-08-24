import { App } from 'obsidian';
import { Logger } from './logger';

/**
 * Utility class for resolving wikilinks to Anytype object IDs
 * Searches through vault notes to find corresponding Anytype objects
 */
export class WikilinkResolver {
  private app: App;
  private logger: Logger;
  private noteCache: Map<string, { objectId: string; spaceId: string }> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 30000; // 30 seconds

  constructor(app: App, logger: Logger) {
    this.app = app;
    this.logger = logger;
  }

  /**
   * Convert Obsidian wikilinks to Anytype object URLs in markdown content
   */
  convertWikilinksToAnyTypeUrls(markdown: string, currentSpaceId: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return markdown || '';
    }

    try {
      // Refresh cache if expired
      this.refreshCacheIfNeeded();

      // Pattern to match Obsidian wikilinks: [[Link Text]] or [[Link Text|Display Text]]
      const wikilinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      
      const convertedMarkdown = markdown.replace(wikilinkPattern, (match, linkTarget, displayText) => {
        // Use display text if provided, otherwise use link target
        const displayName = displayText || linkTarget;
        const cleanTarget = linkTarget.trim();
        
        // Try to find the Anytype object for this wikilink
        const objectInfo = this.findObjectByName(cleanTarget);
        
        if (objectInfo && objectInfo.spaceId === currentSpaceId) {
          // Convert to Anytype URL format
          const anyTypeUrl = `anytype://object?objectId=${objectInfo.objectId}&spaceId=${objectInfo.spaceId}`;
          this.logger.debug(`Converted wikilink [[${cleanTarget}]] to Anytype URL`);
          return `[${displayName}](${anyTypeUrl})`;
        } else {
          // Object not found or belongs to different space - keep as wikilink
          this.logger.debug(`No Anytype object found for wikilink [[${cleanTarget}]], keeping as wikilink`);
          return match; // Keep original wikilink
        }
      });

      return convertedMarkdown;
    } catch (error) {
      this.logger.error(`Failed to convert wikilinks to Anytype URLs: ${error.message}`);
      return markdown; // Return original on error
    }
  }

  /**
   * Find Anytype object info by note name
   */
  private findObjectByName(noteName: string): { objectId: string; spaceId: string } | null {
    // First try exact match
    if (this.noteCache.has(noteName)) {
      return this.noteCache.get(noteName)!;
    }

    // Try case-insensitive match
    for (const [cachedName, objectInfo] of this.noteCache.entries()) {
      if (cachedName.toLowerCase() === noteName.toLowerCase()) {
        this.logger.debug(`Found case-insensitive match for "${noteName}" -> "${cachedName}"`);
        return objectInfo;
      }
    }

    // Try partial match (if note name contains the wikilink target)
    for (const [cachedName, objectInfo] of this.noteCache.entries()) {
      if (cachedName.includes(noteName) || noteName.includes(cachedName)) {
        this.logger.debug(`Found partial match for "${noteName}" -> "${cachedName}"`);
        return objectInfo;
      }
    }

    return null;
  }

  /**
   * Refresh the note cache if it's expired or empty
   */
  private refreshCacheIfNeeded(): void {
    const now = Date.now();
    
    if (this.noteCache.size === 0 || now > this.cacheExpiry) {
      this.buildNoteCache();
      this.cacheExpiry = now + this.CACHE_DURATION;
      this.logger.debug(`Refreshed wikilink cache with ${this.noteCache.size} notes`);
    }
  }

  /**
   * Build cache of note names to Anytype object IDs
   */
  private buildNoteCache(): void {
    this.noteCache.clear();
    
    const allFiles = this.app.vault.getMarkdownFiles();
    
    for (const file of allFiles) {
      try {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
        const objectId = frontmatter.id;
        const spaceId = frontmatter.space_id;
        
        // Only cache notes that have both Anytype ID and space ID
        if (objectId && spaceId && 
            typeof objectId === 'string' && 
            typeof spaceId === 'string' &&
            objectId.trim().length > 0 && 
            spaceId.trim().length > 0) {
          
          // Cache by filename without extension
          const noteName = file.basename;
          this.noteCache.set(noteName, {
            objectId: objectId.trim(),
            spaceId: spaceId.trim()
          });
          
          // Also cache by 'name' property if it exists and differs from filename
          const nameProperty = frontmatter.name;
          if (nameProperty && 
              typeof nameProperty === 'string' && 
              nameProperty.trim() !== noteName) {
            this.noteCache.set(nameProperty.trim(), {
              objectId: objectId.trim(),
              spaceId: spaceId.trim()
            });
          }
          
          this.logger.debug(`Cached note "${noteName}" -> ${objectId}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to process file ${file.basename} for wikilink cache: ${error.message}`);
      }
    }
  }

  /**
   * Clear the cache (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.noteCache.clear();
    this.cacheExpiry = 0;
    this.logger.debug('Cleared wikilink resolver cache');
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { size: number; expiry: Date | null } {
    return {
      size: this.noteCache.size,
      expiry: this.cacheExpiry > 0 ? new Date(this.cacheExpiry) : null
    };
  }
}