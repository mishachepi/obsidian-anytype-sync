import { App, TFile, MarkdownView, normalizePath, Notice } from 'obsidian';
import { AnyTypeObject, CreateObjectRequest, SyncResult, PropertyValue, SyncOptions, NoteCreationOptions, PropertyProcessingOptions } from '../types';
import { Logger, Validation, PropertyProcessor, TextProcessor, WikilinkResolver } from '../utils';
import { AnyTypeApiService } from './api-service';
import { MAX_NOTE_SIZE } from '../constants';
import { FRONTMATTER_SKIP_PROPERTIES } from '../constants/property-filters';

export class SyncService {
  private app: App;
  private apiService: AnyTypeApiService;
  private logger: Logger;
  private propertyProcessor: PropertyProcessor;
  private wikilinkResolver: WikilinkResolver;

  constructor(app: App, apiService: AnyTypeApiService, logger: Logger) {
    this.app = app;
    this.apiService = apiService;
    this.logger = logger;
    this.propertyProcessor = new PropertyProcessor(logger);
    this.wikilinkResolver = new WikilinkResolver(app, logger);
  }

  private findExistingFileByAnyTypeId(anyTypeId: string): TFile | null {
    const existingFiles = this.app.vault.getMarkdownFiles();
    return existingFiles.find(f => {
      const frontmatter = this.app.metadataCache.getFileCache(f)?.frontmatter || {};
      return frontmatter.id === anyTypeId;
    }) || null;
  }


  private getNotesWithAnyTypeMetadata(): TFile[] {
    const allFiles = this.app.vault.getMarkdownFiles();
    const eligibleFiles: TFile[] = [];

    for (const file of allFiles) {
      try {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
        const objectId = frontmatter.id;
        const spaceId = frontmatter.space_id;
        
        // Check if note has both object_id and space_id
        const hasAnyTypeMetadata = objectId && 
                                  Validation.isValidAnyTypeId(objectId) && 
                                  spaceId && 
                                  typeof spaceId === 'string' && 
                                  spaceId.trim().length > 0;

        if (hasAnyTypeMetadata) {
          eligibleFiles.push(file);
          this.logger.debug(`Found note with Anytype metadata: ${file.basename}`);
        }
      } catch (error) {
        this.logger.warn(`Skipping file ${file.basename} due to frontmatter error: ${error.message}`);
      }
    }

    this.logger.info(`Found ${eligibleFiles.length} notes with Anytype metadata out of ${allFiles.length} total`);
    return eligibleFiles;
  }

  generateYamlFrontmatter(object: AnyTypeObject, skipSystemProperties = true, preservedProperties?: Record<string, any>): string {
    try {
      // Validate required fields
      if (!object.id || !object.space_id || !object.type_key) {
        throw new Error('Missing required object fields');
      }

      // Sanitize core fields
      const frontmatter: Record<string, any> = {
        id: TextProcessor.sanitizeForYaml(object.id),
        space_id: TextProcessor.sanitizeForYaml(object.space_id),
        type_key: TextProcessor.sanitizeForYaml(object.type_key),
        name: TextProcessor.sanitizeForYaml(object.name) || 'Untitled'
      };

      // Add other properties with validation (only if they exist and are not empty)
      if (object.properties && typeof object.properties === 'object' && Object.keys(object.properties).length > 0) {
        let includedProperties = 0;
        let skippedSystemProperties = 0;

        for (const [key, value] of Object.entries(object.properties)) {
          // Skip system properties first (if setting is enabled)
          if (skipSystemProperties && this.isSystemProperty(key)) {
            skippedSystemProperties++;
            this.logger.debug(`Skipping system property: ${key}`);
            continue;
          }

          // Validate key name and value
          if (this.isValidYamlKey(key) && value !== null && value !== undefined) {
            // Sanitize and add property value
            const sanitizedValue = TextProcessor.sanitizePropertyValue(value);
            if (sanitizedValue !== null) {
              frontmatter[key] = sanitizedValue;
              includedProperties++;
            }
          }
        }

        this.logger.debug(`Property filtering for object ${object.id}: ${includedProperties} included, ${skippedSystemProperties} system properties skipped`);
      }

      // Add preserved custom Obsidian properties (properties that don't exist in Anytype)
      if (preservedProperties && typeof preservedProperties === 'object') {
        let preservedCount = 0;
        for (const [key, value] of Object.entries(preservedProperties)) {
          // Only preserve properties that:
          // 1. Don't exist in Anytype object properties
          // 2. Are not core Anytype fields (id, space_id, type_key, name)
          // 3. Are valid YAML keys
          const isAnytypeProperty = object.properties && Object.prototype.hasOwnProperty.call(object.properties, key);
          const isCoreField = ['id', 'space_id', 'type_key', 'name'].includes(key);
          
          if (!isAnytypeProperty && !isCoreField && this.isValidYamlKey(key)) {
            const sanitizedValue = TextProcessor.sanitizePropertyValue(value);
            if (sanitizedValue !== null) {
              frontmatter[key] = sanitizedValue;
              preservedCount++;
              this.logger.debug(`Preserved custom Obsidian property: ${key}`);
            }
          }
        }
        
        if (preservedCount > 0) {
          this.logger.info(`Preserved ${preservedCount} custom Obsidian properties during sync`);
        }
      }

      this.logger.debug(`Generated frontmatter for object ${object.id}`);

      // Generate YAML string safely
      let yamlContent = '---\n';
      for (const [key, value] of Object.entries(frontmatter)) {
        if (value !== null && value !== undefined) {
          const yamlLine = TextProcessor.formatYamlLine(key, value);
          yamlContent += yamlLine;
        }
      }
      yamlContent += '---\n\n';

      return yamlContent;
    } catch (error) {
      this.logger.error(`Failed to generate YAML frontmatter for object ${object.id}: ${error.message}`);
      // Return minimal safe frontmatter as fallback
      const safeId = TextProcessor.sanitizeForYaml(object.id) || 'unknown';
      const safeSpaceId = TextProcessor.sanitizeForYaml(object.space_id) || 'unknown';
      const safeTypeKey = TextProcessor.sanitizeForYaml(object.type_key) || 'page';
      const safeName = TextProcessor.sanitizeForYaml(object.name) || 'Untitled';
      
      return `---\nid: ${safeId}\nspace_id: ${safeSpaceId}\n'type_key': ${safeTypeKey}\nname: ${safeName}\n---\n\n`;
    }
  }

  private isValidYamlKey(key: string): boolean {
    return !!(key && typeof key === 'string' && key.length <= 100);
  }

  private isSystemProperty(key: string): boolean {
    // When skipSystemProperties is enabled, only skip these specific properties
    return FRONTMATTER_SKIP_PROPERTIES.includes(key as any);
  }






  private checkForProblematicCharacters(name: string): { hasProblematicChars: boolean; problematicChars: string[] } {
    if (!name || typeof name !== 'string') {
      return { hasProblematicChars: false, problematicChars: [] };
    }

    // Characters that can break wikilinks or cause display issues
    const problematicPatterns = [
      { pattern: /\[\[/, name: 'double brackets [[' },
      { pattern: /\]\]/, name: 'double brackets ]]' },
      { pattern: /\|/, name: 'pipe |' },
      { pattern: /#/, name: 'hash #' },
      { pattern: /\^/, name: 'caret ^' },
      { pattern: /\n/, name: 'newline' },
      { pattern: /\r/, name: 'carriage return' },
      { pattern: /\t/, name: 'tab' }
    ];

    const foundProblematic: string[] = [];
    
    for (const { pattern, name: charName } of problematicPatterns) {
      if (pattern.test(name)) {
        foundProblematic.push(charName);
      }
    }

    return {
      hasProblematicChars: foundProblematic.length > 0,
      problematicChars: foundProblematic
    };
  }

  generateUniqueFilename(baseName: string, importFolder: string = ''): { filename: string; hasConflict: boolean; isManualNoteConflict: boolean } {
    if (!baseName || typeof baseName !== 'string') {
      baseName = 'Untitled';
    }

    // Use centralized filename sanitization
    const safeName = TextProcessor.sanitizeFilename(baseName);
    
    this.logger.debug(`Sanitized filename from "${baseName}" to "${safeName}"`);
    
    // Check if file exists in the target folder
    const targetPath = importFolder.trim() 
      ? normalizePath(`${importFolder.trim()}/${safeName}.md`)
      : normalizePath(`${safeName}.md`);
    
    const existingFile = this.app.vault.getAbstractFileByPath(targetPath);
    
    if (!existingFile) {
      return { filename: safeName, hasConflict: false, isManualNoteConflict: false };
    }

    // File exists - check if it's a manual note (no Anytype metadata)
    const frontmatter = this.app.metadataCache.getFileCache(existingFile as any)?.frontmatter || {};
    const isManualNote = !frontmatter.id && !frontmatter.space_id;
    
    if (isManualNote) {
      this.logger.warn(`Name conflict with manual note: "${safeName}". This may break existing wikilinks.`);
    }

    // Find unique name with counter in the target folder
    let counter = 1;
    const maxCounter = 1000;
    while (counter <= maxCounter) {
      const testName = `${safeName} ${counter}`;
      const testPath = importFolder.trim() 
        ? normalizePath(`${importFolder.trim()}/${testName}.md`)
        : normalizePath(`${testName}.md`);
      
      if (!this.app.vault.getAbstractFileByPath(testPath)) {
        this.logger.debug(`Generated unique filename: ${testName}`);
        return { 
          filename: testName, 
          hasConflict: true, 
          isManualNoteConflict: isManualNote 
        };
      }
      counter++;
    }
    
    // Fallback to timestamp if we can't find a unique name
    const timestamp = Date.now();
    return { 
      filename: `${safeName} ${timestamp}`, 
      hasConflict: true, 
      isManualNoteConflict: isManualNote 
    };
  }

  async createOrUpdateObsidianNote(object: AnyTypeObject, options: NoteCreationOptions = {}): Promise<void> {
    const { skipSystemProperties = true, safeImport = true, importFolder = '' } = options;
    try {
      this.logger.debug(`Looking for existing note with Anytype ID: ${object.id}`);
      const existingFile = this.findExistingFileByAnyTypeId(object.id);
      
      const preservedCustomProperties = this.extractPreservedPropertiesForImport(existingFile, object);
      this.validateObjectName(object);
      const yamlFrontmatter = this.generateYamlFrontmatter(object, skipSystemProperties, 
        Object.keys(preservedCustomProperties).length > 0 ? preservedCustomProperties : undefined);
      
      if (existingFile) {
        await this.updateExistingNote(existingFile, object, yamlFrontmatter, safeImport);
      } else {
        await this.createNewNote(object, yamlFrontmatter, importFolder);
      }

    } catch (error) {
      this.logger.error(`Failed to create/update note for object ${object.id}: ${error.message}`);
      throw error;
    }
  }

  private extractPreservedPropertiesForImport(existingFile: TFile | null, object: AnyTypeObject): Record<string, any> {
    const preservedCustomProperties: Record<string, any> = {};
    
    if (existingFile) {
      this.logger.debug(`Found existing note: ${existingFile.basename}`);
      
      const existingFrontmatter = this.app.metadataCache.getFileCache(existingFile)?.frontmatter || {};
      const objectPropertyKeys = new Set(Object.keys(object.properties || {}));
      const coreFields = new Set(['id', 'space_id', 'type_key', 'name']);
      
      for (const [key, value] of Object.entries(existingFrontmatter)) {
        if (!coreFields.has(key) && 
            !objectPropertyKeys.has(key) && 
            value !== null && 
            value !== undefined) {
          preservedCustomProperties[key] = value;
          this.logger.debug(`Preserving custom Obsidian property during import: ${key}`);
        }
      }
      
      const customCount = Object.keys(preservedCustomProperties).length;
      if (customCount > 0) {
        this.logger.info(`Preserving ${customCount} custom Obsidian properties during import update`);
      }
    }
    
    return preservedCustomProperties;
  }

  private validateObjectName(object: AnyTypeObject): void {
    const charCheck = this.checkForProblematicCharacters(object.name || '');
    if (charCheck.hasProblematicChars) {
      const charList = charCheck.problematicChars.join(', ');
      this.logger.warn(`Object "${object.name}" contains problematic characters: ${charList}`);
      new Notice(`⚠️ Anytype object "${object.name}" contains characters (${charList}) that may cause linking issues`, 8000);
    }
  }

  private async updateExistingNote(existingFile: TFile, object: AnyTypeObject, yamlFrontmatter: string, safeImport: boolean): Promise<void> {
    if (safeImport) {
      this.logger.info(`Safe Import: Updating frontmatter only for existing note: ${existingFile.basename}`);
      
      const existingContent = await this.app.vault.read(existingFile);
      const existingBodyMatch = existingContent.match(/^---[\s\S]*?---\n\n?([\s\S]*)$/);
      const existingBody = existingBodyMatch ? existingBodyMatch[1] : existingContent;
      
      const safeNoteContent = yamlFrontmatter + existingBody;
      await this.app.vault.process(existingFile, () => safeNoteContent);
    } else {
      const markdownContent = TextProcessor.convertAnyTypeLinksToWikilinks(object.markdown || '');
      const noteContent = yamlFrontmatter + markdownContent;
      
      this.logger.info(`Full Import: Updating existing note: ${existingFile.basename} with fresh markdown content (${markdownContent.length} chars)`);
      await this.app.vault.process(existingFile, () => noteContent);
      
      // Rename file to match AnyType object name when SAFE import is disabled
      const currentName = existingFile.basename;
      const targetName = TextProcessor.sanitizeFilename(object.name || 'Untitled');
      
      if (currentName !== targetName) {
        const parentPath = existingFile.parent?.path || '';
        const newPath = parentPath ? `${parentPath}/${targetName}.md` : `${targetName}.md`;
        
        try {
          // Check if target name already exists
          const existingTarget = this.app.vault.getAbstractFileByPath(newPath);
          if (existingTarget && existingTarget !== existingFile) {
            this.logger.warn(`Cannot rename "${currentName}" to "${targetName}" - target name already exists`);
            new Notice(`⚠️ Cannot rename "${currentName}" to "${targetName}" - target name already exists`, 6000);
          } else {
            await this.app.vault.rename(existingFile, newPath);
            this.logger.info(`Renamed file from "${currentName}" to "${targetName}"`);
            new Notice(`📝 Renamed "${currentName}" to "${targetName}"`, 4000);
          }
        } catch (error) {
          this.logger.error(`Failed to rename file from "${currentName}" to "${targetName}": ${error.message}`);
          new Notice(`⚠️ Failed to rename file: ${error.message}`, 6000);
        }
      }
    }
  }

  private async createNewNote(object: AnyTypeObject, yamlFrontmatter: string, importFolder: string = ''): Promise<void> {
    const markdownContent = TextProcessor.convertAnyTypeLinksToWikilinks(object.markdown || '');
    const noteContent = yamlFrontmatter + markdownContent;
    
    const filenameResult = this.generateUniqueFilename(object.name || 'Untitled', importFolder);
    
    if (filenameResult.isManualNoteConflict) {
      new Notice(`🔗 Name conflict: "${object.name}" already exists as a manual note. Created "${filenameResult.filename}" instead. Existing wikilinks may be broken.`, 10000);
    }
    
    // Construct full path with import folder
    const fullPath = importFolder.trim() 
      ? normalizePath(`${importFolder.trim()}/${filenameResult.filename}.md`)
      : normalizePath(`${filenameResult.filename}.md`);
    
    // Ensure import folder exists if specified
    if (importFolder.trim()) {
      const folder = this.app.vault.getAbstractFileByPath(importFolder.trim());
      if (!folder) {
        await this.app.vault.createFolder(importFolder.trim());
        this.logger.info(`Created import folder: ${importFolder.trim()}`);
      }
    }
    
    this.logger.info(`Creating new note: ${fullPath}`);
    await this.app.vault.create(fullPath, noteContent);
  }

  async syncFromAnyType(spaceId: string, apiKey: string, options: SyncOptions = {}): Promise<SyncResult> {
    const {
      skipSystemProperties = true,
      updateStatusCallback,
      objectTypes = ['page'],
      resolveObjectLinks = true,
      safeImport = true,
      importFolder = ''
    } = options;
    
    this.logger.info('Starting sync from Anytype to Obsidian');
    this.logger.time('Sync From Anytype');

    const syncStats = this.initializeSyncStatistics(objectTypes);
    updateStatusCallback?.('Starting real-time import from Anytype...');
    
    const onObjectProcessed = this.createObjectProcessorCallback(syncStats, skipSystemProperties, safeImport, importFolder, updateStatusCallback);
    
    try {
      await this.apiService.getAllObjects(spaceId, apiKey, objectTypes, onObjectProcessed, resolveObjectLinks);
      return this.finalizeSyncResults(syncStats, objectTypes);
    } catch (error) {
      this.logger.error(`Sync from Anytype failed: ${error.message}`);
      throw error;
    }
  }

  private initializeSyncStatistics(objectTypes: string[]) {
    const syncStats = {
      created: 0,
      updated: 0, 
      failed: 0,
      byType: {} as Record<string, { created: number; updated: number; failed: number }>
    };
    
    objectTypes.forEach(type => {
      syncStats.byType[type] = { created: 0, updated: 0, failed: 0 };
    });
    
    return syncStats;
  }

  private createObjectProcessorCallback(
    syncStats: { created: number; updated: number; failed: number; byType: Record<string, { created: number; updated: number; failed: number }> }, 
    skipSystemProperties: boolean, 
    safeImport: boolean, 
    importFolder: string,
    updateStatusCallback?: (status: string) => void
  ) {
    return async (object: AnyTypeObject) => {
      const objectType = object.type_key || 'unknown';
      
      try {
        const existingFile = this.findExistingFileByAnyTypeId(object.id);
        await this.createOrUpdateObsidianNote(object, { skipSystemProperties, safeImport, importFolder });
        
        if (existingFile) {
          syncStats.updated++;
          if (syncStats.byType[objectType]) syncStats.byType[objectType].updated++;
          this.logger.debug(`Updated ${objectType}: ${object.name}`);
        } else {
          syncStats.created++;
          if (syncStats.byType[objectType]) syncStats.byType[objectType].created++;
          this.logger.debug(`Created ${objectType}: ${object.name}`);
        }

        const totalProcessed = syncStats.created + syncStats.updated;
        if (totalProcessed % 10 === 0) {
          updateStatusCallback?.(`Imported ${totalProcessed} objects (${syncStats.created} new, ${syncStats.updated} updated)...`);
        }

      } catch (error) {
        syncStats.failed++;
        if (syncStats.byType[objectType]) syncStats.byType[objectType].failed++;
        this.logger.error(`Failed to process ${objectType} ${object.name} (${object.id}): ${error.message}`);
      }
    };
  }

  private finalizeSyncResults(
    syncStats: { created: number; updated: number; failed: number; byType: Record<string, { created: number; updated: number; failed: number }> }, 
    objectTypes: string[]
  ): SyncResult {
    const { created, updated, failed, byType } = syncStats;
    const totalProcessed = created + updated + failed;
    
    this.logger.info(`Retrieved and processed ${totalProcessed} objects from Anytype`);
    
    if (totalProcessed === 0) {
      this.logger.warn(`No ${objectTypes.join(', ')} objects found in Anytype space`);
      return { created: 0, updated: 0, failed: 0, byType, objectTypes };
    }

    this.logger.timeEnd('Sync From Anytype');
    this.logger.info(`Sync from Anytype complete: ${created} created, ${updated} updated, ${failed} failed`);
    
    for (const [type, stats] of Object.entries(byType)) {
      if (stats.created + stats.updated + stats.failed > 0) {
        this.logger.info(`${type}: ${stats.created} created, ${stats.updated} updated, ${stats.failed} failed`);
      }
    }
    
    return { created, updated, failed, byType, objectTypes };
  }

  async pushToAnyTypeWithProperties(spaceId: string, apiKey: string, skipSystemProperties = true, updateStatusCallback?: (status: string) => void): Promise<AnyTypeObject> {
    this.validateAuthInputs(spaceId, apiKey);

    const file = this.getActiveNoteFile();
    this.logger.info(`Starting enhanced push to Anytype with properties for note: ${file.basename}`);
    this.logger.time('Push To Anytype With Properties');

    try {
      const content = await this.app.vault.read(file);
      
      // Validate content size
      if (content.length > MAX_NOTE_SIZE) {
        throw new Error(`Note content is too large (max ${MAX_NOTE_SIZE / 1000000}MB)`);
      }
      
      this.logger.debug(`Note content length: ${content.length} characters`);
      
      // Check if note already has Anytype ID (prevent duplicates)
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      if (frontmatter.id) {
        throw new Error('Note already exists in Anytype. Use sync instead.');
      }

      updateStatusCallback?.('Fetching available properties from Anytype...');
      
      // Get available properties to validate against
      const availableProperties = await this.apiService.listProperties(spaceId, apiKey);
      this.logger.debug(`Found ${availableProperties.length} available properties in space`);

      updateStatusCallback?.('Creating object with properties in Anytype...');

      // Extract content without existing frontmatter if present
      let markdownContent = content;
      let noteFrontmatter = {};
      
      if (content.startsWith('---')) {
        const frontmatterEndIndex = content.indexOf('---', 3);
        if (frontmatterEndIndex !== -1) {
          const frontmatterText = content.substring(3, frontmatterEndIndex).trim();
          markdownContent = content.substring(frontmatterEndIndex + 3).trim();
          
          // Parse existing frontmatter to extract properties
          try {
            noteFrontmatter = this.parseFrontmatter(frontmatterText);
            this.logger.debug(`Parsed frontmatter with ${Object.keys(noteFrontmatter).length} properties`);
          } catch (error) {
            this.logger.warn(`Failed to parse frontmatter: ${error.message}`);
          }
          
          this.logger.debug(`Extracted markdown content without frontmatter, length: ${markdownContent.length}`);
        }
      }

      // Validate extracted content
      if (!markdownContent || markdownContent.length === 0) {
        markdownContent = `# ${file.basename}\n\n*Empty note*`;
        this.logger.warn('Note has no content, using placeholder');
      }

      // Build validated properties array for API request
      const validatedProperties = this.buildValidatedProperties(noteFrontmatter, availableProperties, { skipSystemProperties });
      this.logger.debug(`Built ${validatedProperties.length} validated properties for object creation`);
      
      // Log each property being sent for debugging
      if (validatedProperties.length > 0) {
        this.logger.debug('Properties to be created:');
        validatedProperties.forEach(prop => {
          this.logger.debug(`  - ${prop.key}: ${JSON.stringify(prop)}`);
        });
      }

      // Convert wikilinks to Anytype object URLs before sending to Anytype
      updateStatusCallback?.('Converting wikilinks to Anytype object links...');
      const processedMarkdown = TextProcessor.convertWikilinksToAnyTypeUrls(
        markdownContent, 
        this.wikilinkResolver, 
        spaceId
      );
      
      if (processedMarkdown !== markdownContent) {
        this.logger.info('Converted wikilinks to Anytype object URLs for push to Anytype');
      }

      // Get object type from frontmatter, default to 'page'
      const typeKey = noteFrontmatter.type_key || 'page';
      this.logger.debug(`Using object type: ${typeKey}`);

      // Create object in Anytype with properties
      const objectData: CreateObjectRequest = {
        name: file.basename,
        type_key: typeKey,
        body: processedMarkdown,
        properties: validatedProperties.length > 0 ? validatedProperties : undefined
      };

      const createdObject = await this.apiService.createObject(spaceId, apiKey, objectData);
      
      // Update the note's frontmatter with Anytype information and all properties
      updateStatusCallback?.('Updating note frontmatter with object data...');
      const newFrontmatter = this.generateYamlFrontmatter(createdObject, skipSystemProperties);
      
      // Log frontmatter generation details
      const propertyCount = Object.keys(createdObject.properties || {}).length;
      this.logger.debug(`Generated frontmatter with ${propertyCount} properties`);
      if (propertyCount > 0) {
        this.logger.debug('Properties in frontmatter:', Object.keys(createdObject.properties));
      }
      
      const newContent = newFrontmatter + markdownContent;
      
      await this.app.vault.process(file, () => newContent);
      this.logger.info(`Successfully updated note with Anytype metadata and properties`);

      this.logger.timeEnd('Push To Anytype With Properties');
      this.logger.info(`Successfully pushed note "${file.basename}" to Anytype as object ${createdObject.id} with ${validatedProperties.length} properties`);

      return createdObject;

    } catch (error) {
      this.logger.error(`Enhanced push to Anytype failed for note ${file.basename}: ${error.message}`);
      throw error;
    }
  }


  async syncNoteToAnyType(file: TFile, fallbackSpaceId: string, apiKey: string, skipSystemProperties = true): Promise<void> {
    this.logger.info(`Enhanced syncing note to Anytype with properties: ${file.basename}`);

    try {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      
      // Check if file has Anytype id and type_key (both required for sync)
      const objectId = frontmatter.id;
      const objectType = frontmatter['type_key'];
      
      if (!objectId) {
        throw new Error(`File "${file.basename}" missing required 'id' property in frontmatter`);
      }
      
      if (!objectType) {
        throw new Error(`File "${file.basename}" missing required 'type_key' property in frontmatter`);
      }
      
      // Use space_id from note's frontmatter if it exists, otherwise use fallback (settings)
      const noteSpaceId = frontmatter.space_id;
      const targetSpaceId = (noteSpaceId && typeof noteSpaceId === 'string' && noteSpaceId.trim().length > 0) 
        ? noteSpaceId.trim() 
        : fallbackSpaceId;
      
      this.logger.info(`Using space ID for enhanced sync: ${targetSpaceId} ${noteSpaceId ? '(from note)' : '(from settings)'}`);
      
      // Get available properties to validate against
      const availableProperties = await this.apiService.listProperties(targetSpaceId, apiKey);
      this.logger.debug(`Found ${availableProperties.length} available properties for validation`);

      // Extract custom Obsidian properties before sync to preserve them
      const customObsidianProperties = this.extractCustomObsidianProperties(frontmatter, availableProperties);

      // Extract and validate properties from frontmatter
      const validatedProperties = this.extractPropertiesFromFrontmatter(frontmatter, availableProperties, { skipSystemProperties });
      this.logger.debug(`Extracted ${validatedProperties.length} validated properties from frontmatter`);

      // Enhanced sync: Update name + properties in Anytype
      const updatedObject = await this.apiService.updateObjectWithProperties(targetSpaceId, apiKey, objectId, {
        name: file.basename,
        properties: validatedProperties.length > 0 ? validatedProperties : undefined
      });
      
      if (!updatedObject) {
        throw new Error('Failed to update object in Anytype');
      }

      // Ensure the name is correctly updated in the response
      if (updatedObject.name !== file.basename) {
        this.logger.warn(`Object name in response "${updatedObject.name}" doesn't match file basename "${file.basename}"`);
        // Force the name to be correct for consistency
        updatedObject.name = file.basename;
      }

      // Fetch the complete updated object with wikilink resolution (same as import)
      this.logger.info(`Fetching complete updated object with wikilink resolution from Anytype`);
      const completeUpdatedObject = await this.apiService.getObjectWithWikilinks(targetSpaceId, apiKey, objectId);
      
      // Ensure name consistency in the complete object as well
      if (completeUpdatedObject.name !== file.basename) {
        this.logger.warn(`Complete object name "${completeUpdatedObject.name}" doesn't match file basename "${file.basename}", correcting`);
        completeUpdatedObject.name = file.basename;
      }
      
      // Update note frontmatter with fresh properties from Anytype response AND preserved custom properties
      this.logger.info(`Updating note frontmatter with refreshed properties, wikilinks from Anytype, and preserved custom properties`);
      const updatedFrontmatter = this.generateYamlFrontmatter(completeUpdatedObject, skipSystemProperties, customObsidianProperties);
      
      // Read current content and replace frontmatter
      const currentContent = await this.app.vault.read(file);
      let markdownContent = currentContent;
      
      // Extract markdown content without frontmatter
      if (currentContent.startsWith('---')) {
        const frontmatterEndIndex = currentContent.indexOf('---', 3);
        if (frontmatterEndIndex !== -1) {
          markdownContent = currentContent.substring(frontmatterEndIndex + 3).trim();
        }
      }
      
      const newContent = updatedFrontmatter + markdownContent;
      await this.app.vault.process(file, () => newContent);

      const customCount = Object.keys(customObsidianProperties).length;
      this.logger.info(`Successfully synced note "${file.basename}" to Anytype with ${validatedProperties.length} properties, preserved ${customCount} custom Obsidian properties, and refreshed frontmatter`);

    } catch (error) {
      this.logger.error(`Enhanced sync failed for ${file.basename}: ${error.message}`);
      throw error;
    }
  }

  private validateAuthInputs(spaceId: string, apiKey: string): void {
    Validation.validateApiInputs(spaceId, apiKey);
  }

  private getActiveNoteFile(): TFile {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || !activeView.file) {
      throw new Error('No active note to work with');
    }
    return activeView.file;
  }

  /**
   * Extract custom Obsidian properties that should be preserved during sync
   * These are properties that exist in the note but not in Anytype
   */
  private extractCustomObsidianProperties(frontmatter: Record<string, any>, availableProperties: any[]): Record<string, any> {
    const customProperties: Record<string, any> = {};
    const anytypePropertyKeys = new Set(availableProperties.map(prop => prop.key));
    const coreFields = new Set(['id', 'space_id', 'type_key', 'name']);
    
    for (const [key, value] of Object.entries(frontmatter)) {
      // Keep properties that are:
      // 1. Not core Anytype fields
      // 2. Not available in Anytype space
      // 3. Have valid values
      if (!coreFields.has(key) && 
          !anytypePropertyKeys.has(key) && 
          value !== null && 
          value !== undefined) {
        customProperties[key] = value;
        this.logger.debug(`Found custom Obsidian property to preserve: ${key}`);
      }
    }
    
    const customCount = Object.keys(customProperties).length;
    if (customCount > 0) {
      this.logger.info(`Found ${customCount} custom Obsidian properties to preserve`);
    }
    
    return customProperties;
  }

  generateImportSummary(result: SyncResult): string {
    const totalProcessed = result.created + result.updated + (result.failed || 0);
    
    if (totalProcessed === 0) {
      return `Import Complete\n\nNo objects found in Anytype space.`;
    }

    let summary = `Import Complete\n\n`;
    
    // Add main statistics with emoji indicators
    summary += `Total: ${totalProcessed} objects\n`;
    
    const stats: string[] = [];
    if (result.created > 0) stats.push(`✅ ${result.created} created`);
    if (result.updated > 0) stats.push(`🔄 ${result.updated} updated`);
    if (result.failed && result.failed > 0) stats.push(`❌ ${result.failed} failed`);
    
    if (stats.length > 0) {
      summary += stats.join('\n') + '\n';
    }
    
    // Add detailed breakdown by type if available
    if (result.byType && result.objectTypes) {
      const typesWithData = result.objectTypes.filter(type => {
        const typeStats = result.byType![type];
        return typeStats && (typeStats.created + typeStats.updated + typeStats.failed) > 0;
      });
      
      if (typesWithData.length > 0) {
        summary += '\nBy Type:\n';
        
        for (const type of typesWithData) {
          const typeStats = result.byType[type];
          const typeTotal = typeStats.created + typeStats.updated + typeStats.failed;
          
          summary += `• ${type}: ${typeTotal}`;
          
          // Add breakdown for this type if it has mixed results
          const typeParts: string[] = [];
          if (typeStats.created > 0) typeParts.push(`${typeStats.created} new`);
          if (typeStats.updated > 0) typeParts.push(`${typeStats.updated} updated`);
          if (typeStats.failed > 0) typeParts.push(`${typeStats.failed} failed`);
          
          if (typeParts.length > 1) {
            summary += ` (${typeParts.join(', ')})`;
          }
          summary += '\n';
        }
      }
    }
    
    return summary.trim();
  }

  async smartSync(spaceId: string, apiKey: string, options: Pick<SyncOptions, 'skipSystemProperties' | 'updateStatusCallback'> = {}): Promise<{ action: 'create' | 'sync', result: AnyTypeObject | boolean }> {
    const { skipSystemProperties = true, updateStatusCallback } = options;
    this.validateAuthInputs(spaceId, apiKey);

    const file = this.getActiveNoteFile();
    
    // Validate file
    if (!file.basename || file.basename.trim().length === 0) {
      throw new Error('Note must have a valid name');
    }

    this.logger.info(`Starting smart sync for note: ${file.basename}`);

    try {
      // Check if note has Anytype ID and space_id in frontmatter
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      const objectId = frontmatter.id;
      const noteSpaceId = frontmatter.space_id;
      
      // Check if note has both required identifiers
      const hasAnyTypeMetadata = objectId && 
                                Validation.isValidAnyTypeId(objectId) && 
                                noteSpaceId && 
                                typeof noteSpaceId === 'string' && 
                                noteSpaceId.trim().length > 0;

      if (hasAnyTypeMetadata) {
        // Note exists in Anytype - perform sync (update name only)
        this.logger.info(`Note "${file.basename}" has Anytype metadata, performing sync`);
        updateStatusCallback?.('🔄 Syncing existing note with properties to Anytype...');
        
        await this.syncNoteToAnyType(file, spaceId.trim(), apiKey.trim(), skipSystemProperties);
        return { action: 'sync', result: true };
        
      } else {
        // Note doesn't have object_id and space_id - create new object with properties
        this.logger.info(`Note "${file.basename}" missing Anytype metadata, creating new object with properties`);
        updateStatusCallback?.('✨ Creating new Anytype object with properties...');
        
        const createdObject = await this.pushToAnyTypeWithProperties(spaceId.trim(), apiKey.trim(), skipSystemProperties, updateStatusCallback);
        return { action: 'create', result: createdObject };
      }
    } catch (error) {
      this.logger.error(`Smart sync failed for note "${file.basename}": ${error.message}`);
      throw error;
    }
  }

  async syncAllNotes(spaceId: string, apiKey: string, options: Pick<SyncOptions, 'skipSystemProperties' | 'updateStatusCallback'> = {}): Promise<SyncResult> {
    const { skipSystemProperties = true, updateStatusCallback } = options;
    this.validateAuthInputs(spaceId, apiKey);

    this.logger.info('Starting sync all notes with Anytype metadata');
    this.logger.time('Sync All Notes');

    // Find notes that have both object_id and space_id
    const eligibleFiles = this.getNotesWithAnyTypeMetadata();
    const totalFiles = this.app.vault.getMarkdownFiles().length;

    if (eligibleFiles.length === 0) {
      this.logger.warn('No notes found with Anytype metadata (object_id and space_id)');
      return { created: 0, updated: 0, failed: 0, skipped: totalFiles };
    }

    let synced = 0;
    let failed = 0;
    const skipped = totalFiles - eligibleFiles.length;

    updateStatusCallback?.(`Syncing ${eligibleFiles.length} notes with properties to Anytype...`);

    for (let index = 0; index < eligibleFiles.length; index++) {
      const file = eligibleFiles[index];
      try {
        await this.syncNoteToAnyType(file, spaceId, apiKey, skipSystemProperties);
        synced++;
        
        if ((index + 1) % 5 === 0) {
          updateStatusCallback?.(`Synced ${index + 1}/${eligibleFiles.length} notes...`);
        }

      } catch (error) {
        failed++;
        this.logger.error(`Failed to sync ${file.basename}: ${error.message}`);
      }
    }

    this.logger.timeEnd('Sync All Notes');
    this.logger.info(`Sync all notes complete: ${synced} synced, ${failed} failed, ${skipped} skipped`);

    return { created: 0, updated: synced, failed, skipped };
  }

  // Enhanced property validation and processing methods

  private parseFrontmatter(frontmatterText: string): Record<string, any> {
    const frontmatter: Record<string, any> = {};
    const lines = frontmatterText.split('\n');
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        
        if (key && value) {
          // Parse different value types
          if (value === 'true' || value === 'false') {
            frontmatter[key] = value === 'true';
          } else if (/^\d+$/.test(value)) {
            frontmatter[key] = parseInt(value, 10);
          } else if (/^\d+\.\d+$/.test(value)) {
            frontmatter[key] = parseFloat(value);
          } else if (value.startsWith('"') && value.endsWith('"')) {
            frontmatter[key] = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            frontmatter[key] = value.slice(1, -1);
          } else {
            frontmatter[key] = value;
          }
        }
      }
    }
    
    return frontmatter;
  }

  private extractPropertiesFromFrontmatter(frontmatter: Record<string, any>, availableProperties: any[], options: PropertyProcessingOptions): PropertyValue[] {
    return this.propertyProcessor.extractFromFrontmatter(frontmatter, availableProperties, options);
  }

  private buildValidatedProperties(noteFrontmatter: Record<string, any>, availableProperties: any[], options: PropertyProcessingOptions): any[] {
    return this.propertyProcessor.buildValidatedProperties(noteFrontmatter, availableProperties, options);
  }

  /**
   * Clean up service resources and caches
   */
  cleanup(): void {
    this.wikilinkResolver.clearCache();
    this.logger.debug('SyncService cleanup completed');
  }

  async importCurrentNote(spaceId: string, apiKey: string, options: Pick<SyncOptions, 'skipSystemProperties' | 'updateStatusCallback' | 'safeImport' | 'importFolder'> = {}): Promise<{ success: boolean; message: string }> {
    const { skipSystemProperties = true, updateStatusCallback, safeImport = true, importFolder = '' } = options;
    this.logger.info('Starting import of current note from Anytype');
    
    try {
      // Validate authentication inputs
      this.validateAuthInputs(spaceId, apiKey);
      
      // Get the active note
      const activeNote = this.getActiveNoteFile();
      this.logger.info(`Importing current note: ${activeNote.basename}`);
      
      // Get frontmatter to extract Anytype ID and space_id
      const frontmatter = this.app.metadataCache.getFileCache(activeNote)?.frontmatter || {};
      
      // Check if note has required Anytype metadata
      const objectId = frontmatter.id;
      const noteSpaceId = frontmatter.space_id;
      
      if (!objectId) {
        return {
          success: false,
          message: 'Current note does not have an Anytype ID (missing "id" property in frontmatter)'
        };
      }
      
      if (!noteSpaceId) {
        return {
          success: false,
          message: 'Current note does not have an Anytype space_id (missing "space_id" property in frontmatter)'
        };
      }
      
      // Validate that the space_id matches the current workspace
      if (noteSpaceId !== spaceId) {
        return {
          success: false,
          message: `Note belongs to different Anytype space (${noteSpaceId}) than current workspace (${spaceId})`
        };
      }
      
      updateStatusCallback?.(`Fetching object ${objectId} from Anytype...`);
      
      // Fetch the object from Anytype
      const anyTypeObject = await this.apiService.getObjectWithWikilinks(spaceId, apiKey, objectId);
      
      if (!anyTypeObject) {
        return {
          success: false,
          message: `Object ${objectId} not found in Anytype space`
        };
      }
      
      updateStatusCallback?.(`Importing "${anyTypeObject.name}" to Obsidian...`);
      
      // Import the object using existing logic (note: propertyPrecedence currently handled in existing logic)
      await this.createOrUpdateObsidianNote(anyTypeObject, { skipSystemProperties, safeImport, importFolder });
      
      this.logger.info(`Successfully imported current note "${activeNote.basename}" from Anytype object ${objectId}`);
      
      return {
        success: true,
        message: `Successfully imported "${anyTypeObject.name}" from Anytype`
      };
      
    } catch (error) {
      this.logger.error(`Failed to import current note: ${error.message}`);
      return {
        success: false,
        message: `Import failed: ${error.message}`
      };
    }
  }

  async reImportExistingNotes(spaceId: string, apiKey: string, options: Pick<SyncOptions, 'skipSystemProperties' | 'updateStatusCallback' | 'safeImport' | 'importFolder'> = {}): Promise<{ successful: number; failed: number; skipped: number }> {
    const { skipSystemProperties = true, updateStatusCallback, safeImport = true, importFolder = '' } = options;
    this.logger.info('Starting re-import of existing notes from Anytype');
    
    try {
      // Validate authentication inputs
      this.validateAuthInputs(spaceId, apiKey);
      
      // Get all notes with Anytype metadata
      const notesWithMetadata = this.getNotesWithAnyTypeMetadata();
      
      if (notesWithMetadata.length === 0) {
        this.logger.info('No notes with Anytype metadata found');
        updateStatusCallback?.('No notes with Anytype metadata found');
        return { successful: 0, failed: 0, skipped: 0 };
      }
      
      this.logger.info(`Found ${notesWithMetadata.length} notes with Anytype metadata to re-import`);
      updateStatusCallback?.(`Found ${notesWithMetadata.length} notes to re-import...`);
      
      let successful = 0;
      let failed = 0;
      let skipped = 0;
      
      // Process each note
      for (let i = 0; i < notesWithMetadata.length; i++) {
        const file = notesWithMetadata[i];
        const progress = `(${i + 1}/${notesWithMetadata.length})`;
        
        try {
          updateStatusCallback?.(`${progress} Re-importing "${file.basename}"...`);
          this.logger.debug(`${progress} Processing note: ${file.basename}`);
          
          const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
          const objectId = frontmatter.id;
          const noteSpaceId = frontmatter.space_id;
          
          // Validate that the space_id matches the current workspace
          if (noteSpaceId !== spaceId) {
            this.logger.warn(`${progress} Skipping ${file.basename}: belongs to different space (${noteSpaceId})`);
            skipped++;
            continue;
          }
          
          // Fetch the object from Anytype
          const anyTypeObject = await this.apiService.getObjectWithWikilinks(spaceId, apiKey, objectId);
          
          if (!anyTypeObject) {
            this.logger.error(`${progress} Object ${objectId} not found in Anytype for ${file.basename}`);
            failed++;
            continue;
          }
          
          // Import the object using existing logic
          await this.createOrUpdateObsidianNote(anyTypeObject, { skipSystemProperties, safeImport, importFolder });
          
          this.logger.info(`${progress} Successfully re-imported ${file.basename} from Anytype object ${objectId}`);
          successful++;
          
        } catch (error) {
          this.logger.error(`${progress} Failed to re-import ${file.basename}: ${error.message}`);
          failed++;
        }
      }
      
      this.logger.info(`Re-import completed: ${successful} successful, ${failed} failed, ${skipped} skipped`);
      updateStatusCallback?.('Re-import completed');
      
      return { successful, failed, skipped };
      
    } catch (error) {
      this.logger.error(`Re-import process failed: ${error.message}`);
      throw error;
    }
  }

  async deleteCurrentNote(spaceId: string, apiKey: string, options: Pick<SyncOptions, 'updateStatusCallback'> = {}): Promise<{ success: boolean; message: string }> {
    const { updateStatusCallback } = options;
    this.logger.info('Starting deletion of current note from Anytype');
    
    try {
      // Validate authentication inputs
      this.validateAuthInputs(spaceId, apiKey);
      
      // Get the active note
      const activeNote = this.getActiveNoteFile();
      this.logger.info(`Attempting to delete note: ${activeNote.basename}`);
      
      // Get frontmatter to extract Anytype ID and space_id
      const frontmatter = this.app.metadataCache.getFileCache(activeNote)?.frontmatter || {};
      
      // Check if note has required Anytype metadata
      const objectId = frontmatter.id;
      const noteSpaceId = frontmatter.space_id;
      
      if (!objectId) {
        return {
          success: false,
          message: 'Current note does not have an Anytype ID (missing "id" property in frontmatter)'
        };
      }
      
      if (!noteSpaceId) {
        return {
          success: false,
          message: 'Current note does not have an Anytype space_id (missing "space_id" property in frontmatter)'
        };
      }
      
      // Validate that the space_id matches the current workspace
      if (noteSpaceId !== spaceId) {
        return {
          success: false,
          message: `Note belongs to different Anytype space (${noteSpaceId}) than current workspace (${spaceId})`
        };
      }
      
      updateStatusCallback?.(`Deleting object ${objectId} from Anytype...`);
      
      // Delete the object from Anytype
      const deleted = await this.apiService.deleteObject(spaceId, apiKey, objectId);
      
      if (!deleted) {
        return {
          success: false,
          message: `Failed to delete object ${objectId} from Anytype`
        };
      }
      
      updateStatusCallback?.('Removing Anytype metadata from note...');
      
      // Remove Anytype metadata from the note's frontmatter
      const content = await this.app.vault.read(activeNote);
      let updatedContent = content;
      
      if (content.startsWith('---')) {
        const frontmatterEndIndex = content.indexOf('---', 3);
        if (frontmatterEndIndex !== -1) {
          const frontmatterText = content.substring(3, frontmatterEndIndex).trim();
          const markdownContent = content.substring(frontmatterEndIndex + 3);
          
          try {
            const parsedFrontmatter = this.parseFrontmatter(frontmatterText);
            
            // Remove Anytype-specific properties
            delete parsedFrontmatter.id;
            delete parsedFrontmatter.space_id;
            delete parsedFrontmatter.type_key;
            delete parsedFrontmatter.created_at;
            delete parsedFrontmatter.updated_at;
            
            // Rebuild frontmatter without Anytype metadata
            if (Object.keys(parsedFrontmatter).length > 0) {
              const newFrontmatterText = Object.entries(parsedFrontmatter)
                .map(([key, value]) => `${key}: ${this.formatYamlValue(value)}`)
                .join('\n');
              updatedContent = `---\n${newFrontmatterText}\n---${markdownContent}`;
            } else {
              // Remove frontmatter entirely if empty
              updatedContent = markdownContent.trim();
            }
          } catch (error) {
            this.logger.warn(`Failed to parse frontmatter for cleanup: ${error.message}`);
            // Keep the original content if parsing fails
          }
        }
      }
      
      // Update the note content
      await this.app.vault.process(activeNote, () => updatedContent);
      
      this.logger.info(`Successfully deleted note "${activeNote.basename}" from Anytype and cleaned up metadata`);
      
      return {
        success: true,
        message: `Successfully deleted "${activeNote.basename}" from Anytype and removed metadata`
      };
      
    } catch (error) {
      this.logger.error(`Failed to delete current note: ${error.message}`);
      return {
        success: false,
        message: `Delete failed: ${error.message}`
      };
    }
  }

}