import { Logger } from './logger';

export interface TagInfo {
  id: string;
  name: string;
  color?: string;
}

/**
 * Tag resolver utility for converting tag names to IDs and vice versa
 * Caches tag information to avoid repeated API calls
 */
export class TagResolver {
  private tagCache = new Map<string, TagInfo[]>();
  private cacheTimestamps = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Set tags for a property (called after fetching from API)
   */
  setTagsForProperty(propertyId: string, tags: TagInfo[]): void {
    this.tagCache.set(propertyId, tags);
    this.cacheTimestamps.set(propertyId, Date.now());
    this.logger.debug(`Cached ${tags.length} tags for property ${propertyId}`);
  }

  /**
   * Get cached tags for a property
   */
  getTagsForProperty(propertyId: string): TagInfo[] | null {
    const timestamp = this.cacheTimestamps.get(propertyId);
    if (!timestamp || Date.now() - timestamp > this.CACHE_TTL) {
      this.tagCache.delete(propertyId);
      this.cacheTimestamps.delete(propertyId);
      return null;
    }
    return this.tagCache.get(propertyId) || null;
  }

  /**
   * Resolve tag name to tag ID for a specific property
   */
  resolveTagNameToId(propertyId: string, tagName: string): string | null {
    const tags = this.getTagsForProperty(propertyId);
    if (!tags) {
      this.logger.warn(`No cached tags for property ${propertyId}, cannot resolve tag name: ${tagName}`);
      return null;
    }

    const tag = tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag) {
      this.logger.warn(`Tag name "${tagName}" not found in property ${propertyId} tags`);
      return null;
    }

    this.logger.debug(`Resolved tag name "${tagName}" to ID "${tag.id}" for property ${propertyId}`);
    return tag.id;
  }

  /**
   * Resolve multiple tag names to IDs
   */
  resolveTagNamesToIds(propertyId: string, tagNames: string[]): string[] {
    const resolvedIds: string[] = [];
    const failedNames: string[] = [];

    for (const tagName of tagNames) {
      const tagId = this.resolveTagNameToId(propertyId, tagName);
      if (tagId) {
        resolvedIds.push(tagId);
      } else {
        failedNames.push(tagName);
      }
    }

    if (failedNames.length > 0) {
      this.logger.warn(`Failed to resolve ${failedNames.length} tag names for property ${propertyId}: ${failedNames.join(', ')}`);
    }

    this.logger.debug(`Resolved ${resolvedIds.length}/${tagNames.length} tag names to IDs for property ${propertyId}`);
    return resolvedIds;
  }

  /**
   * Resolve tag ID to tag name for a specific property
   */
  resolveTagIdToName(propertyId: string, tagId: string): string | null {
    const tags = this.getTagsForProperty(propertyId);
    if (!tags) {
      this.logger.warn(`No cached tags for property ${propertyId}, cannot resolve tag ID: ${tagId}`);
      return null;
    }

    const tag = tags.find(t => t.id === tagId);
    if (!tag) {
      this.logger.warn(`Tag ID "${tagId}" not found in property ${propertyId} tags`);
      return null;
    }

    this.logger.debug(`Resolved tag ID "${tagId}" to name "${tag.name}" for property ${propertyId}`);
    return tag.name;
  }

  /**
   * Resolve multiple tag IDs to names
   */
  resolveTagIdsToNames(propertyId: string, tagIds: string[]): string[] {
    const resolvedNames: string[] = [];
    const failedIds: string[] = [];

    for (const tagId of tagIds) {
      const tagName = this.resolveTagIdToName(propertyId, tagId);
      if (tagName) {
        resolvedNames.push(tagName);
      } else {
        failedIds.push(tagId);
      }
    }

    if (failedIds.length > 0) {
      this.logger.warn(`Failed to resolve ${failedIds.length} tag IDs for property ${propertyId}: ${failedIds.join(', ')}`);
    }

    this.logger.debug(`Resolved ${resolvedNames.length}/${tagIds.length} tag IDs to names for property ${propertyId}`);
    return resolvedNames;
  }

  /**
   * Check if tags are cached for a property
   */
  areTagsCached(propertyId: string): boolean {
    const timestamp = this.cacheTimestamps.get(propertyId);
    return timestamp !== undefined && Date.now() - timestamp <= this.CACHE_TTL;
  }

  /**
   * Clear cache for a specific property
   */
  clearPropertyCache(propertyId: string): void {
    this.tagCache.delete(propertyId);
    this.cacheTimestamps.delete(propertyId);
    this.logger.debug(`Cleared tag cache for property ${propertyId}`);
  }

  /**
   * Clear all cached tags
   */
  clearAllCache(): void {
    this.tagCache.clear();
    this.cacheTimestamps.clear();
    this.logger.debug('Cleared all tag cache');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { properties: number; totalTags: number } {
    let totalTags = 0;
    this.tagCache.forEach((tags) => {
      totalTags += tags.length;
    });
    return {
      properties: this.tagCache.size,
      totalTags
    };
  }
}