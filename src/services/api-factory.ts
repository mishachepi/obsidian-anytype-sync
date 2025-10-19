import { Logger } from '../utils/logger';
import { AnyTypeSettings } from '../types';
import { AnyTypeApiService } from './api-service';

/**
 * Factory for creating the appropriate API service based on settings
 */
export class ApiServiceFactory {
  /**
   * Create API service instance
   */
  static create(settings: AnyTypeSettings, logger: Logger): AnyTypeApiService {
    logger.info('Using legacy API service');
    return new AnyTypeApiService(logger);
  }

  /**
   * Cleanup any resources used by the service
   */
  static cleanup(service: AnyTypeApiService): void {
    // No cleanup needed for legacy service
  }
}

/**
 * Interface that both API services must implement
 * This ensures compatibility between old and new services
 */
export interface IApiService {
  canUpdatePropertyKey(propertyKey: string): boolean;
  listSpaces(apiKey: string): Promise<any[]>;
  listTypes(spaceId: string, apiKey: string): Promise<any[]>;
  listProperties(spaceId: string, apiKey: string): Promise<any[]>;
  getObjectsByType(spaceId: string, typeId: string, apiKey: string): Promise<any[]>;
  createObject(spaceId: string, data: any, apiKey: string): Promise<any>;
  updateObject(objectId: string, spaceId: string, properties: any, apiKey: string): Promise<any>;
  testConnection(spaceId: string, apiKey: string): Promise<boolean>;
  updateType(spaceId: string, apiKey: string, typeId: string, typeData: any): Promise<boolean>;
  updateProperty(spaceId: string, apiKey: string, propertyId: string, propertyData: any): Promise<boolean>;
}