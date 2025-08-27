import { Notice, Plugin, MarkdownView } from 'obsidian';
import { 
  AnyTypeSettings, 
  DEFAULT_SETTINGS, 
  SyncStatus,
  AnyTypeObject,
  Logger,
  SimpleEncoding,
  AnyTypeApiService,
  SyncService,
  AnyTypeAuthService,
  AnyTypeSettingsTab
} from './src';

export default class AnyTypeSyncPlugin extends Plugin {
  settings: AnyTypeSettings;
  syncStatus: SyncStatus;
  statusBarItem: HTMLElement;
  isConnected = false;
  logger: Logger;
  apiService: AnyTypeApiService;
  syncService: SyncService;
  authService: AnyTypeAuthService;
  
  // Ribbon button references
  private syncRibbonIcon: HTMLElement | null = null;
  private importRibbonIcon: HTMLElement | null = null;

  async onload() {
    this.logger = new Logger();
    this.logger.info('Loading Anytype Sync Plugin');

    await this.loadSettings();
    
    // Initialize services
    this.authService = new AnyTypeAuthService();
    this.apiService = new AnyTypeApiService(this.logger);
    this.syncService = new SyncService(this.app, this.apiService, this.logger);
    
    // Initialize sync status
    this.syncStatus = {
      isConnected: false,
      lastSync: null
    };

    // Status bar
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();

    // Initialize ribbon buttons
    this.initializeSyncRibbon();
    this.initializeImportRibbon();

    // Add commands
    this.addCommands();

    // Settings tab
    this.addSettingTab(new AnyTypeSettingsTab(this.app, this, this.logger));

    // Test connection on startup if authenticated
    if (this.settings.isAuthenticated && this.settings.apiKey && this.settings.spaceId) {
      this.logger.info('Auto-testing connection on startup');
      this.testConnection();
    }

    this.logger.info('Anytype Sync Plugin loaded successfully');
  }

  onunload() {
    this.logger.info('Unloading Anytype Sync Plugin');
    
    // Clean up ribbon buttons
    this.removeSyncRibbon();
    this.removeImportRibbon();
    
    // Clean up caches to prevent memory leaks
    if (this.syncService) {
      this.syncService.cleanup();
    }
    
    this.updateStatusBar('Disconnected');
  }

  private initializeSyncRibbon() {
    this.updateSyncRibbonVisibility();
  }

  updateSyncRibbonVisibility() {
    if (this.settings.showSyncButton && !this.syncRibbonIcon) {
      this.syncRibbonIcon = this.addRibbonIcon('sync', 'Anytype Sync current note', 
        () => this.smartSyncCurrentNote());
    } else if (!this.settings.showSyncButton && this.syncRibbonIcon) {
      this.syncRibbonIcon.remove();
      this.syncRibbonIcon = null;
    }
  }

  private removeSyncRibbon() {
    if (this.syncRibbonIcon) {
      this.syncRibbonIcon.remove();
      this.syncRibbonIcon = null;
    }
  }

  private initializeImportRibbon() {
    this.updateImportRibbonVisibility();
  }

  updateImportRibbonVisibility() {
    if (this.settings.showImportButton && !this.importRibbonIcon) {
      this.importRibbonIcon = this.addRibbonIcon('download', 'Anytype Import current note', 
        () => this.importCurrentNote());
    } else if (!this.settings.showImportButton && this.importRibbonIcon) {
      this.importRibbonIcon.remove();
      this.importRibbonIcon = null;
    }
  }

  private removeImportRibbon() {
    if (this.importRibbonIcon) {
      this.importRibbonIcon.remove();
      this.importRibbonIcon = null;
    }
  }

  private async ensureAuthenticated(): Promise<boolean> {
    if (!this.settings.isAuthenticated) {
      new Notice('🔒 Please authenticate with Anytype first');
      return false;
    }
    
    if (!this.isConnected && !await this.testConnection()) {
      return false;
    }
    
    return true;
  }

  private getSafeErrorMessage(errorMessage: string, defaultMessage: string): string {
    const safePatterns = [/no active note|not authenticated|connection failed|invalid.*(?:id|key)|note must have.*name|missing required|already exists/i];
    
    if (safePatterns.some(pattern => pattern.test(errorMessage))) {
      return `❌ ${errorMessage}`;
    }
    
    this.logger.warn(`Generic error for: ${errorMessage}`);
    return `❌ ${defaultMessage}. Check console for details.`;
  }

  private addCommands() {
    const commands = [
      // Import Commands
      {
        id: 'import-current-note',
        name: 'Import current note from Anytype',
        checkCallback: (checking: boolean) => {
          const hasActiveNote = !!this.app.workspace.getActiveViewOfType(MarkdownView);
          if (hasActiveNote && !checking) this.importCurrentNote();
          return hasActiveNote;
        }
      },
      {
        id: 'import-all-from-anytype',
        name: 'Import all objects from Anytype',
        callback: () => this.importFromAnyType()
      },
      {
        id: 're-import-existing-notes',
        name: 'Re-import all existing notes from Anytype',
        callback: () => this.reImportExistingNotes()
      },
      {
        id: 'delete-current-note-from-anytype',
        name: 'Delete current note from Anytype',
        checkCallback: (checking: boolean) => {
          const hasActiveNote = !!this.app.workspace.getActiveViewOfType(MarkdownView);
          if (hasActiveNote && !checking) this.deleteCurrentNoteFromAnytype();
          return hasActiveNote;
        }
      },
      
      // Sync Commands
      {
        id: 'smart-sync-current-note',
        name: 'Smart Sync current note',
        checkCallback: (checking: boolean) => {
          const hasActiveNote = !!this.app.workspace.getActiveViewOfType(MarkdownView);
          if (hasActiveNote && !checking) this.smartSyncCurrentNote();
          return hasActiveNote;
        }
      },
      {
        id: 'sync-all-notes',
        name: 'Sync All',
        callback: () => this.syncAllNotes()
      },
      
      // Connection Commands
      {
        id: 'test-anytype-connection',
        name: 'Test Anytype connection',
        callback: () => this.testConnection()
      }
    ];

    commands.forEach(cmd => this.addCommand(cmd));
    this.logger.debug('Added simplified commands: Import, Smart Sync, Sync All, and Connection');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    
    this.logger?.setLogLevel(this.settings.logLevel);
    
    // Decode stored API key if available
    if (this.settings.encodedApiKey && !this.settings.apiKey) {
      const decodedKey = SimpleEncoding.decode(this.settings.encodedApiKey);
      if (decodedKey) {
        this.settings.apiKey = decodedKey;
        this.settings.isAuthenticated = true;
        this.logger?.info('API key loaded from encoded storage');
      } else {
        this.logger?.error('Failed to decode stored API key');
        this.settings.encodedApiKey = '';
        this.settings.isAuthenticated = false;
      }
    }

    this.logger?.debug('Settings loaded', { 
      isAuthenticated: this.settings.isAuthenticated,
      hasSpaceId: !!this.settings.spaceId,
      logLevel: this.settings.logLevel
    });
  }

  async saveSettings() {
    if (this.settings.apiKey && this.settings.isAuthenticated) {
      this.settings.encodedApiKey = SimpleEncoding.encode(this.settings.apiKey);
      const settingsToSave = { ...this.settings, apiKey: '' };
      await this.saveData(settingsToSave);
    } else {
      await this.saveData(this.settings);
    }
    
    this.logger.debug('Settings saved');
  }

  updateStatusBar(text?: string) {
    if (text) {
      this.statusBarItem.setText(`Anytype: ${text}`);
      return;
    }
    
    if (!this.settings.isAuthenticated) {
      this.statusBarItem.setText('Anytype: 🔒 Not Authenticated');
      return;
    }
    
    const status = this.isConnected ? 'Connected' : 'Disconnected';
    const lastSync = this.syncStatus.lastSync ? 
      ` | Last sync: ${this.syncStatus.lastSync.toLocaleTimeString()}` : '';
    this.statusBarItem.setText(`Anytype: ${status}${lastSync}`);
  }

  async authenticateWithApiKey(apiKey: string): Promise<boolean> {
    try {
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        throw new Error('Invalid API key provided');
      }

      this.settings.apiKey = apiKey.trim();
      this.settings.isAuthenticated = true;
      
      await this.saveSettings();
      this.logger.info('API key set successfully');
      return true;
      
    } catch (error) {
      this.logger.error(`Failed to set API key: ${error.message}`);
      return false;
    }
  }

  async clearAuthentication(): Promise<void> {
    this.settings.apiKey = '';
    this.settings.encodedApiKey = '';
    this.settings.isAuthenticated = false;
    await this.saveSettings();
    this.isConnected = false;
    this.updateStatusBar();
    new Notice('🔓 Authentication cleared. You can now re-authenticate.');
    this.logger.info('Authentication cleared by user');
  }

  async testConnection(): Promise<boolean> {
    if (!this.settings.isAuthenticated || !this.settings.apiKey) {
      new Notice('🔒 Please authenticate with Anytype first');
      this.isConnected = false;
      this.updateStatusBar();
      return false;
    }

    if (!this.settings.spaceId) {
      new Notice('Please select Anytype Space in settings');
      this.isConnected = false;
      this.updateStatusBar();
      return false;
    }

    try {
      this.updateStatusBar('Testing...');
      this.logger.info('Testing connection to Anytype');
      
      const connected = await this.apiService.testConnection(this.settings.spaceId, this.settings.apiKey);
      
      this.isConnected = connected;
      if (connected) {
        new Notice('Successfully connected to Anytype!');
        this.logger.info('Connection test successful');
      } else {
        new Notice('Failed to connect to Anytype');
        this.logger.warn('Connection test failed');
      }
      
      this.updateStatusBar();
      return connected;
      
    } catch (error) {
      this.isConnected = false;
      this.logger.error(`Connection test failed: ${error.message}`);
      const userMessage = this.getSafeErrorMessage(error.message, 'Failed to connect to Anytype');
      new Notice(userMessage);
      this.updateStatusBar();
      return false;
    }
  }

  async smartSyncCurrentNote() {
    if (!await this.ensureAuthenticated()) return;

    try {
      this.updateStatusBar('Smart syncing...');
      
      const result = await this.syncService.smartSync(
        this.settings.spaceId,
        this.settings.apiKey,
        {
          skipSystemProperties: this.settings.skipSystemProperties,
          updateStatusCallback: (status: string) => this.updateStatusBar(status)
        }
      );

      this.syncStatus.lastSync = new Date();
      this.updateStatusBar();
      
      if (result.action === 'create') {
        const createdObject = result.result as AnyTypeObject;
        new Notice(`✅ Note created in Anytype as object ${createdObject.id}`);
      } else {
        new Notice('✅ Note synced with Anytype');
      }

    } catch (error) {
      this.logger.error(`Smart sync failed: ${error.message}`);
      // Don't expose detailed error messages to user for security
      const userMessage = this.getSafeErrorMessage(error.message, 'Smart sync failed');
      new Notice(userMessage);
      this.updateStatusBar();
    }
  }


  async importFromAnyType() {
    if (!await this.ensureAuthenticated()) return;

    const objectTypes = this.settings.syncObjectTypes;
    if (!objectTypes || objectTypes.length === 0) {
      new Notice('❌ No object types selected for import');
      return;
    }

    try {
      this.updateStatusBar('Starting import...');
      
      const result = await this.syncService.syncFromAnyType(
        this.settings.spaceId,
        this.settings.apiKey,
        {
          skipSystemProperties: this.settings.skipSystemProperties,
          updateStatusCallback: (status: string) => this.updateStatusBar(status),
          objectTypes,
          resolveObjectLinks: this.settings.resolveObjectLinks,
          safeImport: this.settings.safeImport,
          importFolder: this.settings.importFolder
        }
      );

      this.syncStatus.lastSync = new Date();
      this.updateStatusBar();
      
      // Show detailed import summary
      const summaryMessage = this.syncService.generateImportSummary(result);
      new Notice(summaryMessage, 12000); // Show for 12 seconds for detailed statistics

    } catch (error) {
      this.logger.error(`Import from Anytype failed: ${error.message}`);
      const userMessage = this.getSafeErrorMessage(error.message, 'Import failed');
      new Notice(userMessage);
      this.updateStatusBar();
    }
  }

  async syncAllNotes() {
    if (!await this.ensureAuthenticated()) return;

    try {
      const result = await this.syncService.syncAllNotes(
        this.settings.spaceId, 
        this.settings.apiKey,
        {
          skipSystemProperties: this.settings.skipSystemProperties,
          updateStatusCallback: (status: string) => this.updateStatusBar(status)
        }
      );

      this.syncStatus.lastSync = new Date();
      this.updateStatusBar();
      new Notice(`Sync complete: ${result.updated} synced, ${result.failed} failed, ${result.skipped || 0} skipped`);

    } catch (error) {
      this.logger.error(`Sync all failed: ${error.message}`);
      const userMessage = this.getSafeErrorMessage(error.message, 'Sync all failed');
      new Notice(userMessage);
      this.updateStatusBar();
    }
  }

  async importCurrentNote() {
    if (!await this.ensureAuthenticated()) return;

    try {
      this.updateStatusBar('Importing current note...');
      
      const result = await this.syncService.importCurrentNote(
        this.settings.spaceId,
        this.settings.apiKey,
        {
          skipSystemProperties: this.settings.skipSystemProperties,
          updateStatusCallback: (status: string) => this.updateStatusBar(status),
          safeImport: this.settings.safeImport,
          importFolder: this.settings.importFolder
        }
      );

      this.updateStatusBar();
      
      if (result.success) {
        new Notice(`✅ ${result.message}`);
        this.syncStatus.lastSync = new Date();
      } else {
        new Notice(`❌ ${result.message}`);
      }

    } catch (error) {
      this.logger.error(`Import current note failed: ${error.message}`);
      const userMessage = this.getSafeErrorMessage(error.message, 'Import current note failed');
      new Notice(userMessage);
      this.updateStatusBar();
    }
  }

  async reImportExistingNotes() {
    if (!await this.ensureAuthenticated()) return;

    try {
      this.updateStatusBar('Re-importing existing notes...');
      
      const result = await this.syncService.reImportExistingNotes(
        this.settings.spaceId,
        this.settings.apiKey,
        {
          skipSystemProperties: this.settings.skipSystemProperties,
          updateStatusCallback: (status: string) => this.updateStatusBar(status),
          safeImport: this.settings.safeImport,
          importFolder: this.settings.importFolder
        }
      );

      this.syncStatus.lastSync = new Date();
      this.updateStatusBar();
      
      const summaryMessage = `✅ Re-import complete: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped`;
      new Notice(summaryMessage, 12000);

    } catch (error) {
      this.logger.error(`Re-import existing notes failed: ${error.message}`);
      const userMessage = this.getSafeErrorMessage(error.message, 'Re-import existing notes failed');
      new Notice(userMessage);
      this.updateStatusBar();
    }
  }

  async deleteCurrentNoteFromAnytype() {
    if (!await this.ensureAuthenticated()) return;

    try {
      this.updateStatusBar('Deleting from Anytype...');
      
      const result = await this.syncService.deleteCurrentNote(
        this.settings.spaceId,
        this.settings.apiKey,
        {
          updateStatusCallback: (status: string) => this.updateStatusBar(status)
        }
      );

      this.updateStatusBar();
      
      if (result.success) {
        new Notice(`✅ ${result.message}`);
      } else {
        new Notice(`❌ ${result.message}`);
      }

    } catch (error) {
      this.logger.error(`Delete current note from Anytype failed: ${error.message}`);
      const userMessage = this.getSafeErrorMessage(error.message, 'Delete from Anytype failed');
      new Notice(userMessage);
      this.updateStatusBar();
    }
  }
}