import { requestUrl } from 'obsidian';
import { AnyTypeObject, CreateObjectRequest, AnyTypeSpace, ListSpacesResponse, AnyTypeObjectType, AnyTypeProperty, PropertyValue } from '../types';
import { Logger } from '../utils/logger';
import { Validation } from '../utils/validation';
import { ANYTYPE_API_URL, ANYTYPE_API_VERSION, API_PAGE_SIZE, MAX_CONTENT_SIZE } from '../constants';
import { IMMUTABLE_KEY_PROPERTIES } from '../constants/property-filters';

export class AnyTypeApiService {
  private baseUrl = ANYTYPE_API_URL;
  private apiVersion = ANYTYPE_API_VERSION;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Check if a property key can be updated (not a bundled/system property)
   */
  canUpdatePropertyKey(propertyKey: string): boolean {
    return !IMMUTABLE_KEY_PROPERTIES.includes(propertyKey as any);
  }



  async listSpaces(apiKey: string): Promise<AnyTypeSpace[]> {
    try {
      this.logger.info('Fetching available spaces');
      
      const headers = this.createRequestHeaders(apiKey);

      this.logger.time('List Spaces');
      
      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces`,
        method: 'GET',
        headers,
        throw: false
      });

      this.logger.timeEnd('List Spaces');
      this.logger.debug(`List spaces response status: ${response.status}`);
      
      if (response.status >= 400) {
        this.logger.error(`List spaces API call failed (${response.status}): ${response.text}`);
        throw new Error(`Failed to list spaces (${response.status}): ${response.text || 'Unknown error'}`);
      }

      const result: ListSpacesResponse = response.json;
      if (!result || !result.data) {
        this.logger.warn('Invalid response format from list spaces API');
        return [];
      }

      const spaces = result.data;
      this.logger.info(`Successfully retrieved ${spaces.length} spaces`);
      
      return spaces;

    } catch (error) {
      this.logger.error(`Failed to list spaces: ${error.message}`);
      throw error;
    }
  }

  async listTypes(spaceId: string, apiKey: string): Promise<AnyTypeObjectType[]> {
    try {
      this.logger.info(`Fetching object types for space: ${spaceId}`);
      
      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/types`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Anytype-Version': this.apiVersion
        },
        throw: false
      });

      this.logger.debug(`List types response: ${response.status}`);
      
      if (response.status >= 400) {
        throw new Error(`Failed to list types (${response.status}): ${response.text}`);
      }

      const result = response.json;
      if (!result?.data) {
        return [];
      }

      // Return all active types - let user choose
      const types = result.data.filter((type: any) => !type.archived);
      
      this.logger.info(`Found ${types.length} object types`);
      return types;

    } catch (error) {
      this.logger.error(`Failed to list types: ${error.message}`);
      throw error;
    }
  }

  async testConnection(spaceId: string, apiKey: string): Promise<boolean> {
    try {
      this.logger.info(`Testing connection to space: ${spaceId}`);
      
      const headers = this.createRequestHeaders(apiKey);

      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}`,
        method: 'GET',
        headers,
        throw: false
      });

      this.logger.debug(`Connection test response status: ${response.status}`);
      
      if (response.status >= 400) {
        this.logger.warn(`Connection test failed with status: ${response.status}`);
        return false;
      }

      const result = response.json;
      if (result && result.space) {
        const spaceName = result.space.name || 'Unknown Space';
        this.logger.info(`Successfully connected to Anytype space: ${spaceName}`);
        return true;
      } else {
        this.logger.warn('Connection test returned invalid response format');
        return false;
      }
    } catch (error) {
      this.logger.error(`Connection test failed: ${error.message}`);
      return false;
    }
  }

  async getAllObjects(spaceId: string, apiKey: string, objectTypes: string[] = ['page'], onObjectProcessed?: (object: AnyTypeObject) => Promise<void>, resolveObjectLinks: boolean = true): Promise<AnyTypeObject[]> {
    const allObjects: AnyTypeObject[] = [];
    let offset = 0;
    const limit = API_PAGE_SIZE;
    let totalProcessed = 0;

    this.logger.info(`Starting to fetch all ${objectTypes.join(', ')} objects from space ${spaceId}`);
    this.logger.time('Get All Objects');

    try {
      let hasMore = true;
      let pageCount = 0;
      while (hasMore) {
        pageCount++;
        this.logger.info(`Fetching page ${pageCount}: offset ${offset}, limit ${limit}`);
        
        const searchHeaders = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Anytype-Version': this.apiVersion
        };

        // First, get the list of objects
        const searchResponse = await requestUrl({
          url: `${this.baseUrl}/v1/spaces/${spaceId}/search?limit=${limit}&offset=${offset}`,
          method: 'POST',
          headers: searchHeaders,
          body: JSON.stringify({
            query: "",
            types: objectTypes
          }),
          throw: false
        });

        if (searchResponse.status >= 400) {
          throw new Error(`Search API call failed (${searchResponse.status}): ${searchResponse.text}`);
        }

        const searchResult = searchResponse.json;
        if (!searchResult || !searchResult.data) {
          this.logger.debug('No data in search response');
          hasMore = false;
          break;
        }

        const objects = searchResult.data;
        this.logger.debug(`Retrieved ${objects.length} objects from search`);

        // Now fetch full content for each object including markdown
        for (let i = 0; i < objects.length; i++) {
          const obj = objects[i];
          // Process all objects of the requested types (not just 'page')
          if (obj.type && objectTypes.includes(obj.type.key)) {
            try {
              // Fetch full object content with markdown format
              const fullObject = await this.getObjectWithMarkdown(spaceId, obj.id, apiKey, resolveObjectLinks);
              
              let processedObject: AnyTypeObject;
              if (fullObject) {
                processedObject = fullObject;
              } else {
                // Fallback to basic object if full content fetch fails
                this.logger.warn(`Failed to fetch full content for object ${obj.id}, using basic data`);
                processedObject = await this.createBasicAnyTypeObject(obj, spaceId, apiKey, resolveObjectLinks);
              }

              // If callback provided, process object immediately (real-time)
              if (onObjectProcessed) {
                await onObjectProcessed(processedObject);
                totalProcessed++;
                this.logger.debug(`Real-time processed object ${totalProcessed}: ${processedObject.name}`);
              } else {
                // Legacy behavior: accumulate in memory
                allObjects.push(processedObject);
              }
              
              // Progress logging every 25 objects for real-time, 50 for batch
              const logInterval = onObjectProcessed ? 25 : 50;
              const currentCount = onObjectProcessed ? totalProcessed : allObjects.length;
              if (currentCount % logInterval === 0) {
                this.logger.info(`Processed ${currentCount} objects so far...`);
              }
              
            } catch (error) {
              this.logger.error(`Failed to process object ${obj.id}: ${error.message}`);
              // Continue with next object instead of failing completely
            }
          }
        }

        // Check if we have more pages using pagination info
        if (searchResult.pagination && searchResult.pagination.has_more === false) {
          hasMore = false;
        } else if (objects.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }

      this.logger.timeEnd('Get All Objects');
      const finalCount = onObjectProcessed ? totalProcessed : allObjects.length;
      this.logger.info(`Successfully processed ${finalCount} objects (types: ${objectTypes.join(', ')}) from space ${spaceId}`);
      
      // Return empty array when using real-time processing to minimize memory usage
      return onObjectProcessed ? [] : allObjects;

    } catch (error) {
      this.logger.error(`Failed to get all objects from space ${spaceId}: ${error.message}`);
      throw error;
    }
  }

  private async getObjectWithMarkdown(spaceId: string, objectId: string, apiKey: string, resolveObjectLinks: boolean = true): Promise<AnyTypeObject | null> {
    try {
      const headers = this.createRequestHeaders(apiKey);

      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/objects/${objectId}?format=md`,
        method: 'GET',
        headers,
        throw: false
      });

      if (response.status >= 400) {
        this.logger.warn(`Failed to fetch object ${objectId}: ${response.status}`);
        return null;
      }

      const result = response.json;
      if (!result || !result.object) {
        return null;
      }

      const obj = result.object;
      
      // Convert properties array to object with correct type handling
      const propertiesObj: Record<string, any> = {};
      if (obj.properties && Array.isArray(obj.properties)) {
        for (const prop of obj.properties) {
          if (prop.key && this.isValidPropertyKey(prop.key)) {
            const propertyValue = await this.extractPropertyValue(prop, spaceId, apiKey, resolveObjectLinks);
            if (propertyValue !== null) {
              propertiesObj[prop.key] = propertyValue;
            }
          }
        }
      }

      return {
        id: obj.id,
        name: this.sanitizeString(obj.name) || 'Untitled',
        type_key: obj.type?.key || 'page',
        markdown: obj.markdown || '',
        space_id: spaceId,
        properties: propertiesObj
      };

    } catch (error) {
      this.logger.error(`Error fetching object ${objectId} with markdown: ${error.message}`);
      return null;
    }
  }

  private async extractPropertyValue(prop: any, spaceId: string, apiKey: string, resolveObjectLinks: boolean = true): Promise<any> {
    try {
      // Handle different property formats based on Anytype API specification
      // Format can be: text, number, select, multi_select, date, files, checkbox, url, email, phone, objects
      
      switch (prop.format) {
        case 'text':
          return prop.text || null;
        
        case 'number':
          return prop.number !== undefined ? prop.number : null;
        
        case 'date':
          return prop.date || null;
        
        case 'checkbox':
          return prop.checkbox !== undefined ? prop.checkbox : null;
        
        case 'url':
          return prop.url || null;
        
        case 'email':
          return prop.email || null;
        
        case 'phone':
          return prop.phone || null;
        
        case 'files':
          return Array.isArray(prop.files) ? prop.files : null;
        
        case 'objects':
          // Convert object IDs to wikilinks by looking up their names
          if (Array.isArray(prop.objects) && prop.objects.length > 0) {
            if (resolveObjectLinks) {
              const wikilinks = await this.convertObjectIdsToWikilinks(prop.objects, spaceId, apiKey);
              return wikilinks.length > 0 ? wikilinks : null;
            } else {
              // Just return the raw object IDs for performance
              this.logger.debug(`Skipping object link resolution for property ${prop.key} (performance optimization)`);
              return prop.objects;
            }
          }
          return null;
        
        case 'select':
          // For select properties, extract the tag name for display
          if (prop.select && prop.select.name) {
            return prop.select.name;
          }
          return null;
        
        case 'multi_select':
          // For multi-select properties, extract tag names as array
          if (Array.isArray(prop.multi_select)) {
            const tagNames = prop.multi_select
              .filter((tag: any) => tag && tag.name)
              .map((tag: any) => tag.name);
            return tagNames.length > 0 ? tagNames : null;
          }
          return null;
        
        default:
          // Fallback to original behavior for unknown formats
          this.logger.debug(`Unknown property format: ${prop.format} for property ${prop.key}`);
          if (prop.date) return prop.date;
          if (prop.objects && Array.isArray(prop.objects)) {
            if (resolveObjectLinks) {
              // Convert object IDs to wikilinks even for unknown formats
              const wikilinks = await this.convertObjectIdsToWikilinks(prop.objects, spaceId, apiKey);
              return wikilinks.length > 0 ? wikilinks : prop.objects;
            } else {
              // Return raw object IDs for performance
              return prop.objects;
            }
          }
          if (prop.value !== undefined) return prop.value;
          if (prop.name) return prop.name;
          return null;
      }
    } catch (error) {
      this.logger.warn(`Error extracting property value for ${prop.key}: ${error.message}`);
      return null;
    }
  }

  private async createBasicAnyTypeObject(obj: any, spaceId: string, apiKey: string, resolveObjectLinks: boolean = true): Promise<AnyTypeObject> {
    const propertiesObj: Record<string, any> = {};
    if (obj.properties && Array.isArray(obj.properties)) {
      for (const prop of obj.properties) {
        if (prop.key && this.isValidPropertyKey(prop.key)) {
          const propertyValue = await this.extractPropertyValue(prop, spaceId, apiKey, resolveObjectLinks);
          if (propertyValue !== null) {
            propertiesObj[prop.key] = propertyValue;
          }
        }
      }
    }

    return {
      id: obj.id,
      name: this.sanitizeString(obj.name) || 'Untitled',
      type_key: obj.type?.key || 'page',
      markdown: obj.snippet || '',
      space_id: spaceId,
      properties: propertiesObj
    };
  }

  private isValidPropertyKey(key: string): boolean {
    return !!(key && typeof key === 'string' && key.length < 100);
  }

  private sanitizeString(str: string | undefined): string | undefined {
    if (!str || typeof str !== 'string') return str;
    // eslint-disable-next-line no-control-regex
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  private createRequestHeaders(apiKey: string) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Anytype-Version': this.apiVersion
    };
  }


  private validateBasicInputs(spaceId: string, apiKey: string): void {
    Validation.validateApiInputs(spaceId, apiKey);
  }

  async createObject(spaceId: string, apiKey: string, objectData: CreateObjectRequest): Promise<AnyTypeObject> {
    try {
      this.validateBasicInputs(spaceId, apiKey);
      if (!objectData.type_key) throw new Error('Type key required');

      const sanitizedName = this.sanitizeString(objectData.name) || 'Untitled';
      this.logger.info(`Creating new object in space ${spaceId}: ${sanitizedName}`);
      
      const requestPayload: CreateObjectRequest = {
        type_key: objectData.type_key
      };

      // Add optional fields
      if (objectData.name) {
        requestPayload.name = this.sanitizeString(objectData.name) || 'Untitled';
      }
      
      if (objectData.body && objectData.body.length <= MAX_CONTENT_SIZE) {
        requestPayload.body = this.sanitizeMarkdown(objectData.body);
      }

      if (objectData.template_id) {
        requestPayload.template_id = objectData.template_id;
      }
      
      // Add properties if provided
      if (objectData.properties && objectData.properties.length > 0) {
        requestPayload.properties = objectData.properties;
        this.logger.debug(`Including ${objectData.properties.length} properties in object creation`);
        this.logger.debug(`Properties being sent:`, objectData.properties);
      }
      
      const headers = this.createRequestHeaders(apiKey);

      this.logger.debug(`Complete request payload:`, requestPayload);
      this.logger.time(`Create Object: ${sanitizedName}`);
      
      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/objects`,
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
        throw: false
      });

      this.logger.timeEnd(`Create Object: ${sanitizedName}`);
      
      if (response.status >= 400) {
        const errorText = response.text || 'Unknown error';
        this.logger.error(`Create object API call failed (${response.status}):`, errorText);
        if (objectData.properties && objectData.properties.length > 0) {
          this.logger.error('Failed request included properties:', objectData.properties);
        }
        throw new Error(`Create object API call failed (${response.status}): ${errorText}`);
      }

      const result = response.json;
      if (!result || !result.object || !result.object.id) {
        throw new Error('Invalid response from object creation API');
      }

      // Validate response data
      const responseObject = result.object;
      if (!this.isValidId(responseObject.id)) {
        throw new Error('Invalid object ID in response');
      }

      // Extract properties from the API response
      const extractedProperties = this.extractPropertiesFromResponse(responseObject.properties || []);
      
      const createdObject: AnyTypeObject = {
        id: responseObject.id,
        name: this.sanitizeString(responseObject.name) || sanitizedName,
        type_key: responseObject.type_key || objectData.type_key,
        markdown: objectData.body || '', // Store the original body content
        space_id: responseObject.space_id || spaceId,
        properties: extractedProperties
      };

      this.logger.info(`Successfully created object "${createdObject.name}" (${createdObject.id}) in space ${spaceId}`);
      
      // Log successful property creation
      if (objectData.properties && objectData.properties.length > 0) {
        this.logger.info(`✅ Object created with ${objectData.properties.length} properties`);
        this.logger.debug(`Extracted ${Object.keys(extractedProperties).length} properties from response`);
      }
      return createdObject;

    } catch (error) {
      this.logger.error(`Failed to create object in space ${spaceId}: ${error.message}`);
      throw error;
    }
  }

  private isValidId(id: string): boolean {
    return !!(id && typeof id === 'string' && id.length >= 10 && id.length <= 200);
  }


  private sanitizeMarkdown(markdown: string): string {
    if (!markdown) return '';
    // eslint-disable-next-line no-control-regex
    let sanitized = markdown.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (sanitized.length > MAX_CONTENT_SIZE) {
      sanitized = sanitized.substring(0, MAX_CONTENT_SIZE);
    }
    return sanitized;
  }

  private async getObjectName(spaceId: string, objectId: string, apiKey: string): Promise<string | null> {
    try {
      const headers = this.createRequestHeaders(apiKey);

      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/objects/${objectId}`,
        method: 'GET',
        headers,
        throw: false
      });

      if (response.status >= 400) {
        this.logger.debug(`Failed to fetch object name for ${objectId}: ${response.status}`);
        return null;
      }

      const result = response.json;
      if (result && result.object && result.object.name) {
        const objectName = this.sanitizeString(result.object.name) || null;
        this.logger.debug(`Fetched object name: ${objectName} (${objectId})`);
        return objectName;
      }
      
      return null;
    } catch (error) {
      this.logger.debug(`Error fetching object name for ${objectId}: ${error.message}`);
      return null;
    }
  }

  private async convertObjectIdsToWikilinks(objectIds: string[], spaceId: string, apiKey: string): Promise<string[]> {
    const wikilinks: string[] = [];
    
    for (const objectId of objectIds) {
      if (!objectId || typeof objectId !== 'string') {
        continue;
      }
      
      try {
        const objectName = await this.getObjectName(spaceId, objectId, apiKey);
        if (objectName) {
          wikilinks.push(`[[${objectName}]]`);
          this.logger.debug(`Converted object ID ${objectId} to wikilink [[${objectName}]]`);
        } else {
          // Fallback: use the object ID if we can't find the name
          wikilinks.push(`[[${objectId}]]`);
          this.logger.debug(`Could not resolve name for object ${objectId}, using ID as fallback`);
        }
      } catch (error) {
        this.logger.warn(`Error converting object ID ${objectId} to wikilink: ${error.message}`);
        wikilinks.push(`[[${objectId}]]`);
      }
    }
    
    return wikilinks;
  }

  async updateObjectWithProperties(spaceId: string, apiKey: string, objectId: string, objectData: { name?: string, properties?: PropertyValue[] }): Promise<AnyTypeObject | null> {
    try {
      this.validateBasicInputs(spaceId, apiKey);
      if (!objectId) throw new Error('Object ID required');

      this.logger.info(`Updating object ${objectId} in space ${spaceId} with enhanced data`);
      
      const requestPayload: any = {};

      // Add name if provided
      if (objectData.name) {
        requestPayload.name = this.sanitizeString(objectData.name) || 'Untitled';
        this.logger.debug(`Updating object name to: ${requestPayload.name}`);
      }

      // Add properties if provided
      if (objectData.properties && objectData.properties.length > 0) {
        requestPayload.properties = objectData.properties;
        this.logger.debug(`Updating object with ${objectData.properties.length} properties`);
        this.logger.debug(`Properties being sent:`, objectData.properties);
      }

      // Only proceed if we have something to update
      if (Object.keys(requestPayload).length === 0) {
        this.logger.warn('No update data provided for object');
        return null;
      }

      const headers = this.createRequestHeaders(apiKey);
      this.logger.debug(`Complete update payload:`, requestPayload);

      this.logger.time(`Update Object: ${objectId}`);

      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/objects/${objectId}`,
        method: 'PATCH',
        headers,
        body: JSON.stringify(requestPayload),
        throw: false
      });

      this.logger.timeEnd(`Update Object: ${objectId}`);

      if (response.status >= 400) {
        const errorText = response.text || 'Unknown error';
        this.logger.error(`Update object API call failed (${response.status}):`, errorText);
        if (objectData.properties && objectData.properties.length > 0) {
          this.logger.error('Failed request included properties:', objectData.properties);
        }
        throw new Error(`Update object API call failed (${response.status}): ${errorText}`);
      }

      const result = response.json;
      if (!result || !result.object || !result.object.id) {
        throw new Error('Invalid response from object update API');
      }

      // Extract properties from the API response
      const responseObject = result.object;
      const extractedProperties = this.extractPropertiesFromResponse(responseObject.properties || []);
      
      const updatedObject: AnyTypeObject = {
        id: responseObject.id,
        name: this.sanitizeString(responseObject.name) || 'Untitled',
        type_key: responseObject.type?.key || responseObject.type_key || 'page',
        markdown: responseObject.markdown || '',
        space_id: responseObject.space_id || spaceId,
        properties: extractedProperties
      };

      this.logger.info(`Successfully updated object "${updatedObject.name}" (${updatedObject.id}) in space ${spaceId}`);
      
      // Log successful property update
      if (objectData.properties && objectData.properties.length > 0) {
        this.logger.info(`✅ Object updated with ${objectData.properties.length} properties`);
        this.logger.debug(`Extracted ${Object.keys(extractedProperties).length} properties from response`);
      }

      return updatedObject;

    } catch (error) {
      this.logger.error(`Failed to update object ${objectId} in space ${spaceId}: ${error.message}`);
      throw error;
    }
  }

  async updateObject(spaceId: string, apiKey: string, objectId: string, objectData: { name: string }): Promise<boolean> {
    try {
      // Use the enhanced method internally for consistency
      const updatedObject = await this.updateObjectWithProperties(spaceId, apiKey, objectId, {
        name: objectData.name
      });
      
      return updatedObject !== null;

    } catch (error) {
      this.logger.error(`Failed to update object ${objectId} in space ${spaceId}: ${error.message}`);
      throw error;
    }
  }

  async deleteObject(spaceId: string, apiKey: string, objectId: string): Promise<boolean> {
    try {
      this.validateBasicInputs(spaceId, apiKey);
      if (!objectId) throw new Error('Object ID required');

      this.logger.info(`Deleting object ${objectId} from space ${spaceId}`);
      
      const headers = this.createRequestHeaders(apiKey);

      this.logger.time('Delete Object');

      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/objects/${objectId}`,
        method: 'DELETE',
        headers,
        throw: false
      });

      this.logger.timeEnd('Delete Object');
      this.logger.debug(`Delete object response status: ${response.status}`);

      if (response.status >= 400) {
        const errorText = response.text || 'Unknown error';
        this.logger.error(`Delete object API call failed (${response.status}): ${errorText}`);
        throw new Error(`Failed to delete object (${response.status}): ${errorText}`);
      }

      this.logger.info(`Successfully deleted object ${objectId} from space ${spaceId}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to delete object ${objectId} in space ${spaceId}: ${error.message}`);
      throw error;
    }
  }

  async updateType(spaceId: string, apiKey: string, typeId: string, typeData: { key: string; name?: string; plural_name?: string }): Promise<boolean> {
    try {
      // Basic validation
      if (!spaceId) throw new Error('Space ID required');
      if (!typeId) throw new Error('Type ID required');
      if (!apiKey) throw new Error('API key required');
      if (!typeData.key) throw new Error('Type key required');

      const sanitizedKey = this.sanitizeString(typeData.key) || 'untitled_type';
      this.logger.info(`Updating type ${typeId} in space ${spaceId} with key: ${sanitizedKey}`);
      
      const requestPayload: any = {
        key: sanitizedKey
      };

      // Add optional fields if provided
      if (typeData.name) {
        requestPayload.name = this.sanitizeString(typeData.name);
      }
      if (typeData.plural_name) {
        requestPayload.plural_name = this.sanitizeString(typeData.plural_name);
      }

      const headers = this.createRequestHeaders(apiKey);

      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/types/${typeId}`,
        method: 'PATCH',
        headers,
        body: JSON.stringify(requestPayload),
        throw: false
      });

      if (response.status >= 400) {
        const errorText = response.text || 'Unknown error';
        throw new Error(`Update type API call failed (${response.status}): ${errorText}`);
      }

      this.logger.info(`Successfully updated type "${sanitizedKey}" (${typeId}) in space ${spaceId}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to update type ${typeId} in space ${spaceId}: ${error.message}`);
      return false;
    }
  }

  async listProperties(spaceId: string, apiKey: string): Promise<AnyTypeProperty[]> {
    try {
      this.logger.info(`Fetching properties for space: ${spaceId}`);
      
      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/properties`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Anytype-Version': this.apiVersion
        },
        throw: false
      });

      this.logger.debug(`List properties response: ${response.status}`);
      
      if (response.status >= 400) {
        throw new Error(`Failed to list properties (${response.status}): ${response.text}`);
      }

      const result = response.json;
      if (!result?.data) {
        return [];
      }

      // Return all properties
      const properties = result.data;
      
      this.logger.info(`Found ${properties.length} properties`);
      return properties;

    } catch (error) {
      this.logger.error(`Failed to list properties: ${error.message}`);
      throw error;
    }
  }

  async updateProperty(spaceId: string, apiKey: string, propertyId: string, propertyData: { key?: string; name: string }): Promise<boolean> {
    try {
      // Basic validation
      if (!spaceId) throw new Error('Space ID required');
      if (!propertyId) throw new Error('Property ID required');
      if (!apiKey) throw new Error('API key required');
      if (!propertyData.name) throw new Error('Property name required');

      this.logger.info(`Updating property ${propertyId} in space ${spaceId}`);
      
      const requestPayload: any = {
        name: this.sanitizeString(propertyData.name) || 'Untitled Property'
      };

      // Add optional key field if provided, but check for immutable properties first
      if (propertyData.key) {
        const sanitizedKey = this.sanitizeString(propertyData.key);
        
        // Check if this is a bundled/system property that cannot have its key changed
        if (IMMUTABLE_KEY_PROPERTIES.includes(sanitizedKey as any)) {
          this.logger.warn(`Cannot update key for bundled property "${sanitizedKey}" - keys are immutable for system properties`);
          // Only update the name for system properties
        } else {
          requestPayload.key = sanitizedKey;
        }
      }

      const headers = this.createRequestHeaders(apiKey);

      const response = await requestUrl({
        url: `${this.baseUrl}/v1/spaces/${spaceId}/properties/${propertyId}`,
        method: 'PATCH',
        headers,
        body: JSON.stringify(requestPayload),
        throw: false
      });

      if (response.status >= 400) {
        const errorText = response.text || 'Unknown error';
        throw new Error(`Update property API call failed (${response.status}): ${errorText}`);
      }

      this.logger.info(`Successfully updated property (${propertyId}) in space ${spaceId}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to update property ${propertyId} in space ${spaceId}: ${error.message}`);
      return false;
    }
  }

  // Public method to get object with wikilink resolution (same as import)
  async getObjectWithWikilinks(spaceId: string, apiKey: string, objectId: string): Promise<AnyTypeObject> {
    this.validateBasicInputs(spaceId, apiKey);
    if (!objectId) throw new Error('Object ID required');

    this.logger.debug(`Fetching object ${objectId} with wikilink resolution for sync operation`);
    
    const objectWithWikilinks = await this.getObjectWithMarkdown(spaceId, objectId, apiKey, true);
    
    if (!objectWithWikilinks) {
      throw new Error(`Failed to fetch object ${objectId} with wikilinks`);
    }
    
    this.logger.debug(`Successfully fetched object ${objectId} with wikilink resolution for sync`);
    return objectWithWikilinks;
  }

  // Extract properties from Anytype API response and convert to simple key-value format
  private extractPropertiesFromResponse(properties: any[]): Record<string, any> {
    const extractedProperties: Record<string, any> = {};
    
    if (!Array.isArray(properties)) {
      this.logger.warn('Properties in response is not an array');
      return extractedProperties;
    }

    for (const prop of properties) {
      if (!prop || !prop.key) {
        this.logger.warn('Property missing key:', prop);
        continue;
      }

      try {
        // Extract the actual value based on property format
        let value: any = null;
        
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
          // For select properties, use the tag name if available
          value = prop.select.name || prop.select.id || prop.select;
        } else if (prop.multi_select !== undefined) {
          // For multi-select properties, extract tag names
          if (Array.isArray(prop.multi_select)) {
            value = prop.multi_select.map((tag: any) => tag.name || tag.id || tag);
          } else {
            value = prop.multi_select;
          }
        } else if (prop.files !== undefined) {
          value = prop.files;
        } else if (prop.objects !== undefined) {
          value = prop.objects;
        }

        if (value !== null) {
          extractedProperties[prop.key] = value;
          this.logger.debug(`Extracted property: ${prop.key} = ${JSON.stringify(value)}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to extract property ${prop.key}: ${error.message}`);
      }
    }

    this.logger.debug(`Total properties extracted: ${Object.keys(extractedProperties).length}`);
    return extractedProperties;
  }
}