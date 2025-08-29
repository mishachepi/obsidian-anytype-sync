import { App, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import AnyTypeSyncPlugin from '../../main';
import { Logger } from '../utils/logger';
import { AUTH_CODE_LENGTH } from '../constants';
import { AnyTypeSpace, AnyTypeObjectType, AnyTypeProperty } from '../types';

export class AnyTypeSettingsTab extends PluginSettingTab {
  plugin: AnyTypeSyncPlugin;
  connectionStatus: HTMLElement | null = null;
  authStatus: HTMLElement | null = null;
  private logger: Logger;
  private spaces: AnyTypeSpace[] = [];
  private objectTypes: AnyTypeObjectType[] = [];
  private properties: AnyTypeProperty[] = [];

  constructor(app: App, plugin: AnyTypeSyncPlugin, logger: Logger) {
    super(app, plugin);
    this.plugin = plugin;
    this.logger = logger;
  }

  private async saveApiKeyAndRefresh(apiKey: string, source: string): Promise<void> {
    try {
      this.plugin.settings.apiKey = apiKey;
      this.plugin.settings.isAuthenticated = true;
      await this.plugin.saveSettings();
      
      new Notice('✅ Authentication successful! API key saved securely.');
      this.logger.info(`Authentication completed successfully via ${source}`);
      this.display(); // Refresh the settings
    } catch (error) {
      this.logger.error(`Failed to save API key from ${source}: ${error.message}`);
      new Notice(`❌ Failed to save authentication: ${error.message}`, 5000);
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    // Essential setup only
    this.renderSetup(containerEl);
    this.renderActions(containerEl);
    this.renderInfoPanel(containerEl);
    this.renderAdvancedOptions(containerEl);
  }

  private renderInfoPanel(containerEl: HTMLElement): void {
    const infoPanel = containerEl.createEl('div', { cls: 'info-panel' });
    infoPanel.style.cssText = `
      margin: 24px 0 16px 0;
      padding: 18px 20px;
      background: linear-gradient(90deg, var(--background-secondary-alt) 80%, var(--background-primary) 100%);
      border-radius: 12px;
      border: 1px solid var(--background-modifier-border);
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      font-size: 15px;
    `;
    const header = infoPanel.createEl('h4', { text: '💡 Remember:' });
    header.style.cssText = 'margin-bottom: 10px; color: var(--text-accent); font-size: 17px; font-weight: 600; letter-spacing: 0.5px;';
    const tipsList = infoPanel.createEl('ul');
    tipsList.style.cssText = 'margin: 10px 0; padding-left: 24px; list-style: disc inside;';
    tipsList.createEl('li', { text: '🟣 Obsidian - [[WikiLinks]] <--> ObjectName - Anytype' });
    tipsList.createEl('li', { text: '🔗 Use [[WikiLinks]] for object links in Obsidian.' });
    tipsList.createEl('li', { text: '🙈 Obsidian properties Override Anytype properties when Sync' });
    tipsList.createEl('li', { text: '🙉 Anytype properties Override Obsidian properties when Import' });
    tipsList.createEl('li', { text: '🚫 Avoid using special characters in Anytype object names.' });
    tipsList.createEl('li', { text: '❗ Avoid duplicates in object names in Anytype.' });
  }

  private renderSetupInstructions(containerEl: HTMLElement): void {
    const instructionsPanel = containerEl.createEl('div', { cls: 'setting-item-description' });
    instructionsPanel.style.cssText = `
      margin-bottom: 16px;
    `;
    
    // Status display (always visible)
    const statusEl = instructionsPanel.createEl('div');
    statusEl.style.cssText = `
      margin-bottom: 8px;
      font-weight: bold;
      font-size: 12px;
      color: var(--text-normal);
    `;
    
    const connectionStatus = this.plugin.settings.isAuthenticated ? 
      (this.plugin.isConnected ? '✅ Connected' : '🔐 Authenticated') : 
      '❌ Not Connected';
    const spaceStatus = this.plugin.settings.spaceId ? '✅ Space Selected' : '❌ Space Needed';
    const typesStatus = this.plugin.settings.syncObjectTypes.length > 0 ? '✅ Types Selected' : '❌ Types Needed';
    
    statusEl.innerHTML = `Status: ${connectionStatus} • ${spaceStatus} • ${typesStatus}`;

    // Collapsible instructions panel
    const collapsiblePanel = instructionsPanel.createEl('div');
    collapsiblePanel.style.cssText = `
      background: var(--background-secondary);
      border-radius: 6px;
      border: 1px solid var(--background-modifier-border);
      overflow: hidden;
    `;
    
    // Header with toggle
    const headerEl = collapsiblePanel.createEl('div');
    headerEl.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.2s;
    `;
    
    const titleEl = headerEl.createEl('span', { text: 'Quick Setup' });
    titleEl.style.cssText = 'margin: 0; font-weight: 500; font-size: 12px;';
    
    const arrowEl = headerEl.createEl('span');
    arrowEl.style.cssText = `
      font-size: 8px;
      transition: transform 0.2s;
      color: var(--text-muted);
    `;
    
    // Content area
    const contentEl = collapsiblePanel.createEl('div');
    contentEl.style.cssText = `
      padding: 0 10px 8px 10px;
      transition: max-height 0.3s ease, opacity 0.2s ease;
      overflow: hidden;
    `;
    
    const instructionsList = contentEl.createEl('ol');
    instructionsList.style.cssText = 'margin: 8px 0; padding-left: 16px; font-size: 13px;';
    
    instructionsList.createEl('li', { text: '🔗 Connect: Make sure Anytype Desktop is running and click Connect' });
    instructionsList.createEl('li', { text: '🌐 Select Space: Choose your Anytype workspace' });
    instructionsList.createEl('li', { text: '📋 Select Types: Choose which object types to work with (pages, tasks, etc.)' });
    
    // Toggle functionality
    const updateToggleState = (isExpanded: boolean) => {
      arrowEl.textContent = isExpanded ? '▼' : '▶';
      if (isExpanded) {
        contentEl.style.maxHeight = contentEl.scrollHeight + 'px';
        contentEl.style.opacity = '1';
      } else {
        contentEl.style.maxHeight = '0';
        contentEl.style.opacity = '0';
      }
      this.plugin.settings.hideQuickSetup = !isExpanded;
      this.plugin.saveSettings();
    };
    
    // Initial state based on setting
    const isExpanded = !this.plugin.settings.hideQuickSetup;
    updateToggleState(isExpanded);
    
    // Click handler
    headerEl.addEventListener('click', () => {
      const currentlyExpanded = !this.plugin.settings.hideQuickSetup;
      updateToggleState(!currentlyExpanded);
    });
    
    // Hover effect
    headerEl.addEventListener('mouseenter', () => {
      headerEl.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    
    headerEl.addEventListener('mouseleave', () => {
      headerEl.style.backgroundColor = '';
    });
  }

  private renderSetup(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Setup' });

    // Quick setup instructions right after the Setup title
    this.renderSetupInstructions(containerEl);

    this.renderAuthentication(containerEl);
    this.renderSpaceSelection(containerEl);
    this.renderObjectTypeSelection(containerEl);
  }

  private renderAuthentication(containerEl: HTMLElement): void {
    if (this.plugin.settings.isAuthenticated) {
      // Authenticated - show clear button
      new Setting(containerEl)
        .setName('API Key')
        .setDesc('Connected to Anytype')
        .addButton(btn => btn
          .setButtonText('Clear')
          .setWarning()
          .onClick(async () => {
            await this.plugin.clearAuthentication();
            this.display();
          }));
    } else {
      // Not authenticated - show connect button and code input in same setting
      let challengeId: string | undefined;
      let codeInput: HTMLInputElement;
      
      const connectSetting = new Setting(containerEl)
        .setName('Connect to Anytype')
        .setDesc('Make sure Anytype Desktop is running, then click Connect')
        .addButton(btn => btn
          .setButtonText('Connect')
          .setCta()
          .onClick(async () => {
            try {
              btn.setDisabled(true);
              btn.setButtonText('Connecting...');
              
              const challenge = await this.plugin.authService.createChallenge();
              challengeId = challenge.challenge_id;
              
              btn.setButtonText('Connected');
              new Notice('✅ Check Anytype Desktop for 4-digit code');
              
              // Show the code input and update description
              connectSetting.setDesc('Enter the 4-digit code from Anytype Desktop');
              codeInput.style.display = 'block';
              codeInput.focus();
              
            } catch (error) {
              btn.setDisabled(false);
              btn.setButtonText('Connect');
              new Notice(`Failed to connect: ${error.message}`);
            }
          }))
        .addText(text => {
          codeInput = text.inputEl;
          text.setPlaceholder('1234')
            .onChange(async (value) => {
              if (value.length === AUTH_CODE_LENGTH && /^\d{4}$/.test(value) && challengeId) {
                try {
                  const apiKey = await this.plugin.authService.createApiKey(challengeId, value);
                  await this.saveApiKeyAndRefresh(apiKey.api_key, 'authentication');
                } catch (error) {
                  new Notice(`Authentication failed: ${error.message}`);
                  text.setValue(''); // Clear the input on error
                }
              }
            });
          // Initially hide the code input
          codeInput.style.display = 'none';
        });
    }
  }

  private renderSpaceSelection(containerEl: HTMLElement): void {
    if (!this.plugin.settings.isAuthenticated) {
      // Show placeholder when not authenticated
      new Setting(containerEl)
        .setName('Space Selection')
        .setDesc('Authenticate first to select a space');
      return;
    }

    const spaceSetting = new Setting(containerEl)
      .setName('Space Selection')
      .setDesc('Select your Anytype space from the dropdown');

    if (this.spaces.length === 0) {
      // Show "Get Spaces" button
      spaceSetting.addButton(btn => btn
        .setButtonText('Get Spaces')
        .setCta()
        .onClick(async () => {
          try {
            btn.setDisabled(true);
            btn.setButtonText('Loading...');
            
            this.spaces = await this.plugin.apiService.listSpaces(this.plugin.settings.apiKey);
            
            if (this.spaces.length === 0) {
              new Notice('No spaces found in your Anytype account');
              btn.setButtonText('Retry');
              btn.setDisabled(false);
              return;
            }
            
            new Notice(`Found ${this.spaces.length} spaces`);
            this.display(); // Refresh to show dropdown
            
          } catch (error) {
            this.logger.error(`Failed to fetch spaces: ${error.message}`);
            new Notice(`Failed to fetch spaces: ${error.message}`);
            btn.setButtonText('Retry');
            btn.setDisabled(false);
          }
        }));
    } else {
      // Show dropdown with spaces
      spaceSetting.addDropdown(dropdown => {
        // Add empty option
        dropdown.addOption('', 'Select a space...');
        
        // Add all spaces
        for (const space of this.spaces) {
          dropdown.addOption(space.id, space.name || space.id);
        }
        
        // Set current value
        dropdown.setValue(this.plugin.settings.spaceId || '');
        
        dropdown.onChange(async (value) => {
          if (value) {
            const selectedSpace = this.spaces.find(s => s.id === value);
            if (selectedSpace) {
              this.plugin.settings.spaceId = selectedSpace.id;
              this.plugin.settings.spaceName = selectedSpace.name || selectedSpace.id;
              await this.plugin.saveSettings();
              new Notice(`Selected space: ${selectedSpace.name || selectedSpace.id}`);
              
              // Automatically load object types for the selected space
              await this.loadObjectTypesForSpace();
            }
          } else {
            this.plugin.settings.spaceId = '';
            this.plugin.settings.spaceName = '';
            this.objectTypes = []; // Clear types when no space selected
            await this.plugin.saveSettings();
          }
          
          // Refresh the entire settings display to show updated types
          this.display();
        });
      })
      .addButton(btn => btn
        .setButtonText('Refresh')
        .setTooltip('Reload spaces list')
        .onClick(async () => {
          try {
            btn.setDisabled(true);
            btn.setButtonText('Loading...');
            
            this.spaces = await this.plugin.apiService.listSpaces(this.plugin.settings.apiKey);
            new Notice(`Refreshed: ${this.spaces.length} spaces found`);
            this.display(); // Refresh to update dropdown
            
          } catch (error) {
            this.logger.error(`Failed to refresh spaces: ${error.message}`);
            new Notice(`Failed to refresh spaces: ${error.message}`);
          } finally {
            btn.setDisabled(false);
            btn.setButtonText('Refresh');
          }
        }));
    }
  }

  private renderObjectTypeSelection(containerEl: HTMLElement): void {
    const typesSetting = new Setting(containerEl)
      .setName('Object types');

    // Always show selected types if any exist
    const selectedTypes = this.plugin.settings.syncObjectTypes;
    if (selectedTypes.length > 0) {
      // Get type names if we have them loaded
      if (this.objectTypes.length > 0) {
        const selectedTypeObjects = this.objectTypes.filter(type => selectedTypes.includes(type.key));
        const selectedDisplay = selectedTypeObjects.length > 0 
          ? selectedTypeObjects.map(type => type.name).join(', ')
          : selectedTypes.join(', '); // fallback to keys if names not available
        
        typesSetting.setDesc(`Selected types: ${selectedDisplay}`);
      } else {
        typesSetting.setDesc(`Selected types: ${selectedTypes.join(', ')}`);
      }
    } else {
      typesSetting.setDesc('No types selected - please select types after connecting');
    }

    if (!this.plugin.settings.isAuthenticated || !this.plugin.settings.spaceId) {
      // Show status when not ready, but still show selected types above
      const statusEl = containerEl.createEl('p', { cls: 'setting-item-description' });
      statusEl.style.cssText = 'margin-top: -10px; margin-bottom: 15px; font-style: italic; color: var(--text-muted);';
      statusEl.textContent = 'Connect and select space first to manage object types';
      return;
    }

    if (this.objectTypes.length === 0) {
      // Show "Get Types" button
      typesSetting.addButton(btn => btn
        .setButtonText('Get Types')
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Loading...');
          
          await this.loadObjectTypesForSpace();
          this.display(); // Refresh display after loading
          
          btn.setDisabled(false);
          btn.setButtonText('Get Types');
        }));
    } else {
      // Show selected types clearly
      const selectedTypes = this.plugin.settings.syncObjectTypes;
      const selectedTypeObjects = this.objectTypes.filter(type => selectedTypes.includes(type.key));
      
      // Create visual display of selected types
      if (selectedTypeObjects.length > 0) {
        const selectedDisplay = selectedTypeObjects
          .map(type => type.name)
          .join(', ');
        
        typesSetting.setDesc('');
        typesSetting.descEl.innerHTML = `Selected types: <strong>${selectedDisplay}</strong>`;
      } else {
        typesSetting.setDesc('No types selected (import and sync will be disabled)');
      }
      
      // Only 2 buttons: Select Types and Refresh
      typesSetting
        .addButton(btn => btn
          .setButtonText('Select Types')
          .setCta()
          .onClick(() => this.showTypeSelectionModal()))
        .addButton(btn => btn
          .setButtonText('Refresh')
          .setTooltip('Reload object types')
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText('Loading...');
            
            await this.loadObjectTypesForSpace();
            this.display(); // Refresh display after loading
            
            btn.setDisabled(false);
            btn.setButtonText('Refresh');
          }));
    }
  }

  private showTypeSelectionModal(): void {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: var(--background-primary); border: 1px solid var(--background-modifier-border);
      border-radius: 8px; padding: 20px; z-index: 1000; min-width: 300px; max-height: 400px;
      overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    `;
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.5); z-index: 999;
    `;
    
    const title = modal.createEl('h3', { text: 'Select Object Types' });
    title.style.marginTop = '0';
    
    const checkboxContainer = modal.createEl('div');
    checkboxContainer.style.cssText = 'margin: 15px 0; max-height: 250px; overflow-y: auto;';
    
    for (const objectType of this.objectTypes) {
      const isSelected = this.plugin.settings.syncObjectTypes.includes(objectType.key);
      
      const checkboxDiv = checkboxContainer.createEl('div');
      checkboxDiv.style.cssText = `
        display: flex; align-items: center; padding: 8px; margin: 4px 0;
        border-radius: 4px; cursor: pointer;
        background: var(--background-modifier-hover);
      `;
      
      const checkbox = checkboxDiv.createEl('input', { type: 'checkbox' });
      checkbox.checked = isSelected;
      checkbox.style.marginRight = '10px';
      
      const label = checkboxDiv.createEl('span');
      if (objectType.icon?.emoji) {
        label.textContent = `${objectType.icon.emoji} ${objectType.name} (${objectType.key})`;
      } else {
        label.textContent = `${objectType.name} (${objectType.key})`;
      }
      
      checkboxDiv.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        updateTypes();
      });
    }
    
    const updateTypes = () => {
      const checkboxes = checkboxContainer.querySelectorAll('input[type="checkbox"]');
      const selectedKeys: string[] = [];
      
      checkboxes.forEach((cb, index) => {
        if ((cb as HTMLInputElement).checked) {
          selectedKeys.push(this.objectTypes[index].key);
        }
      });
      
      // Allow empty selection - no default required
      this.plugin.settings.syncObjectTypes = selectedKeys;
      this.plugin.saveSettings();
    };
    
    const buttonContainer = modal.createEl('div');
    buttonContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;';
    
    const closeButton = buttonContainer.createEl('button', { text: 'Done' });
    closeButton.style.cssText = 'padding: 8px 16px; border-radius: 4px; border: none; background: var(--interactive-accent); color: var(--text-on-accent);';
    
    const closeModal = () => {
      document.body.removeChild(overlay);
      document.body.removeChild(modal);
      this.display(); // Refresh settings display
    };
    
    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  private async refreshTypes(): Promise<void> {
    try {
      this.logger.info('Refreshing object types from Anytype');
      this.objectTypes = await this.plugin.apiService.listTypes(
        this.plugin.settings.spaceId, 
        this.plugin.settings.apiKey
      );
      this.logger.info(`Refreshed ${this.objectTypes.length} object types`);
      
      // Refresh the settings display to show updated types
      this.display();
    } catch (error) {
      this.logger.error(`Failed to refresh types: ${error.message}`);
      throw error;
    }
  }

  private async refreshProperties(): Promise<void> {
    try {
      this.logger.info('Refreshing properties from Anytype');
      this.properties = await this.plugin.apiService.listProperties(
        this.plugin.settings.spaceId, 
        this.plugin.settings.apiKey
      );
      this.logger.info(`Refreshed ${this.properties.length} properties`);
      
      // Refresh the settings display to show updated properties
      this.display();
    } catch (error) {
      this.logger.error(`Failed to refresh properties: ${error.message}`);
      throw error;
    }
  }

  private showTypeKeyUpdateModal(): void {
    new TypeKeyUpdateModal(this.app, this.objectTypes, this.plugin, this.logger, () => this.refreshTypes()).open();
  }

  private showPropertyKeyUpdateModal(): void {
    new PropertyKeyUpdateModal(this.app, this.properties, this.plugin, this.logger, () => this.refreshProperties()).open();
  }

  private renderActions(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Sync Actions' });

    new Setting(containerEl)
      .setName('Get from Anytype')
      .setDesc('Import ALL objects of selected types from Anytype to Obsidian')
      .addButton(btn => btn
        .setButtonText('Import')
        .setCta()
        .onClick(async () => {
          // Use the enhanced import method from the main plugin
          await this.plugin.importFromAnyType();
        }));

    new Setting(containerEl)
      .setName('Sync all notes')
      .setDesc('Update all notes that have object_id and space_id properties')
      .addButton(btn => btn
        .setButtonText('Sync')
        .onClick(async () => {
          if (!this.plugin.settings.isAuthenticated || !this.plugin.settings.spaceId) {
            new Notice('Please complete setup first');
            return;
          }
          await this.plugin.syncAllNotes();
        }));
  }

  private renderAdvancedOptions(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Advanced Options' });

    new Setting(containerEl)
      .setName('Import folder')
      .setDesc('Folder where imported Anytype objects will be created (leave empty for vault root)')
      .addText(text => text
        .setPlaceholder('e.g., Anytype/Imported')
        .setValue(this.plugin.settings.importFolder)
        .onChange(async (value) => {
          this.plugin.settings.importFolder = value.trim();
          await this.plugin.saveSettings();
          // No notification - just save silently
        }))
      .addButton(btn => btn
        .setButtonText('Create folder')
        .setTooltip('Create the import folder if it doesn\'t exist')
        .onClick(async () => {
          const folderPath = this.plugin.settings.importFolder.trim();
          if (!folderPath) {
            new Notice('❌ Please specify a folder path first');
            return;
          }
          
          try {
            const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
            if (folder) {
              new Notice(`✅ Folder "${folderPath}" already exists`);
            } else {
              await this.plugin.app.vault.createFolder(folderPath);
              new Notice(`✅ Created folder: ${folderPath}`);
            }
          } catch (error) {
            new Notice(`❌ Failed to create folder: ${error.message}`);
          }
        }));

    new Setting(containerEl)
      .setName('Skip system properties')
      .setDesc('Hide timestamps and system data when importing')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.skipSystemProperties)
        .onChange(async (value) => {
          this.plugin.settings.skipSystemProperties = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Safe Import')
      .setDesc('Preserve existing note content during import - only update properties and frontmatter. If disabled, existing note content will be replaced by anytype body')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.safeImport)
        .onChange(async (value) => {
          this.plugin.settings.safeImport = value;
          await this.plugin.saveSettings();
          const status = value ? 'enabled' : 'disabled';
          new Notice(`Safe Import ${status}. This ${value ? 'preserves' : 'replaces'} existing note content during imports.`);
        }));

    new Setting(containerEl)
      .setName('Resolve object links')
      .setDesc('Convert object IDs to wikilinks (disable for faster imports on large spaces)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.resolveObjectLinks)
        .onChange(async (value) => {
          this.plugin.settings.resolveObjectLinks = value;
          await this.plugin.saveSettings();
          const status = value ? 'enabled' : 'disabled';
          new Notice(`Object link resolution ${status}. This affects new imports.`);
        }));

    new Setting(containerEl)
      .setName('Show sync button')
      .setDesc('Display Smart Sync button in left sidebar')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showSyncButton)
        .onChange(async (value) => {
          this.plugin.settings.showSyncButton = value;
          await this.plugin.saveSettings();
          this.plugin.updateSyncRibbonVisibility();
        }));

    // new Setting(containerEl)
    //   .setName('Show import button')
    //   .setDesc('Display Import Current Note button in left sidebar')
    //   .addToggle(toggle => toggle
    //     .setValue(this.plugin.settings.showImportButton)
    //     .onChange(async (value) => {
    //       this.plugin.settings.showImportButton = value;
    //       await this.plugin.saveSettings();
    //       this.plugin.updateImportRibbonVisibility();
    //     }));

    new Setting(containerEl)
      .setName('Manage type keys')
      .setDesc('Update type keys in Anytype (requires authentication and space selection)')
      .addButton(btn => btn
        .setButtonText('Update Type Keys')
        .onClick(async () => {
          if (!this.plugin.settings.isAuthenticated || !this.plugin.settings.spaceId) {
            new Notice('Please authenticate and select a space first');
            return;
          }
          
          if (this.objectTypes.length === 0) {
            new Notice('Please load object types first by clicking "Get Types" above');
            return;
          }
          
          this.showTypeKeyUpdateModal();
        }));

    new Setting(containerEl)
      .setName('Manage property keys')
      .setDesc('Update property keys in Anytype (requires authentication and space selection)')
      .addButton(btn => btn
        .setButtonText('Update Property Keys')
        .onClick(async () => {
          if (!this.plugin.settings.isAuthenticated || !this.plugin.settings.spaceId) {
            new Notice('Please authenticate and select a space first');
            return;
          }
          
          // Load properties if not already loaded
          if (this.properties.length === 0) {
            try {
              btn.setDisabled(true);
              btn.setButtonText('Loading Properties...');
              
              this.properties = await this.plugin.apiService.listProperties(
                this.plugin.settings.spaceId,
                this.plugin.settings.apiKey
              );
              
              if (this.properties.length === 0) {
                new Notice('No properties found in this space');
                return;
              }
              
            } catch (error) {
              this.logger.error(`Failed to load properties: ${error.message}`);
              new Notice(`Failed to load properties: ${error.message}`);
              return;
            } finally {
              btn.setDisabled(false);
              btn.setButtonText('Update Property Keys');
            }
          }
          
          this.showPropertyKeyUpdateModal();
        }));
  }

  private async loadObjectTypesForSpace(): Promise<void> {
    if (!this.plugin.settings.isAuthenticated || !this.plugin.settings.spaceId) {
      this.logger.debug('Cannot load object types: not authenticated or no space selected');
      return;
    }

    try {
      this.logger.info(`Loading object types for space: ${this.plugin.settings.spaceName}`);
      new Notice('Loading object types...');
      
      this.objectTypes = await this.plugin.apiService.listTypes(
        this.plugin.settings.spaceId,
        this.plugin.settings.apiKey
      );
      
      if (this.objectTypes.length === 0) {
        new Notice('No object types found in this space');
        this.logger.warn(`No object types found in space: ${this.plugin.settings.spaceName}`);
      } else {
        new Notice(`✅ Loaded ${this.objectTypes.length} object types`);
        this.logger.info(`Successfully loaded ${this.objectTypes.length} object types for space: ${this.plugin.settings.spaceName}`);
      }
      
    } catch (error) {
      this.logger.error(`Failed to load object types for space ${this.plugin.settings.spaceName}: ${error.message}`);
      new Notice(`❌ Failed to load object types: ${error.message}`);
      this.objectTypes = []; // Clear on error
    }
  }
}

class TypeKeyUpdateModal extends Modal {
  objectTypes: AnyTypeObjectType[];
  plugin: AnyTypeSyncPlugin;
  logger: Logger;
  selectedType: AnyTypeObjectType | null = null;
  currentKeyInput: HTMLInputElement;
  newKeyInput: HTMLInputElement;
  updateButton: HTMLButtonElement;
  onSuccess?: () => Promise<void>;

  constructor(app: App, objectTypes: AnyTypeObjectType[], plugin: AnyTypeSyncPlugin, logger: Logger, onSuccess?: () => Promise<void>) {
    super(app);
    this.objectTypes = objectTypes;
    this.plugin = plugin;
    this.logger = logger;
    this.onSuccess = onSuccess;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Update Type Key' });
    
    contentEl.createEl('p', {
      text: 'Select a type from the list below, then enter a new key name. Keys should be in snake_case format.',
      attr: { style: 'margin-bottom: 20px; color: var(--text-muted);' }
    });

    // Type selection list
    const typeContainer = contentEl.createEl('div');
    typeContainer.style.cssText = `
      max-height: 200px; overflow-y: auto; border: 1px solid var(--background-modifier-border);
      border-radius: 6px; margin-bottom: 20px;
    `;

    let selectedButton: HTMLElement | null = null;

    this.objectTypes.forEach(objectType => {
      const typeRow = typeContainer.createEl('div');
      typeRow.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px; border-bottom: 1px solid var(--background-modifier-border); 
        cursor: pointer; transition: background-color 0.2s;
      `;

      const leftSide = typeRow.createEl('div');
      leftSide.style.cssText = 'display: flex; align-items: center;';

      if (objectType.icon?.emoji) {
        leftSide.createEl('span', {
          text: objectType.icon.emoji,
          attr: { style: 'margin-right: 10px; font-size: 18px;' }
        });
      }

      leftSide.createEl('span', {
        text: objectType.name,
        attr: { style: 'font-weight: bold; color: var(--text-normal);' }
      });

      typeRow.createEl('span', {
        text: objectType.key,
        attr: { style: 'color: var(--text-muted); font-family: var(--font-monospace); font-size: 13px;' }
      });

      typeRow.addEventListener('click', () => {
        // Clear previous selection
        if (selectedButton) {
          selectedButton.style.background = '';
        }

        // Set new selection
        selectedButton = typeRow;
        this.selectedType = objectType;
        typeRow.style.background = 'var(--background-modifier-hover)';

        // Update inputs
        this.currentKeyInput.value = objectType.key;
        this.newKeyInput.value = objectType.key;
        this.updateButton.disabled = false;

        // Focus new key input
        setTimeout(() => {
          this.newKeyInput.focus();
          this.newKeyInput.select();
        }, 100);
      });

      typeRow.addEventListener('mouseenter', () => {
        if (selectedButton !== typeRow) {
          typeRow.style.background = 'var(--background-modifier-hover)';
        }
      });

      typeRow.addEventListener('mouseleave', () => {
        if (selectedButton !== typeRow) {
          typeRow.style.background = '';
        } else {
          typeRow.style.background = 'var(--background-modifier-hover)';
        }
      });
    });

    // Current key section
    contentEl.createEl('h3', { 
      text: 'Current Key:', 
      attr: { style: 'margin: 20px 0 5px 0; color: var(--text-normal);' }
    });
    
    this.currentKeyInput = contentEl.createEl('input');
    this.currentKeyInput.type = 'text';
    this.currentKeyInput.readOnly = true;
    this.currentKeyInput.placeholder = 'Select a type above to see its current key';
    this.currentKeyInput.style.cssText = `
      width: 100%; padding: 10px; margin: 0 0 20px 0;
      border: 1px solid var(--background-modifier-border); border-radius: 6px;
      background: var(--background-secondary); font-family: var(--font-monospace); 
      color: var(--text-muted); box-sizing: border-box;
    `;

    // New key section  
    contentEl.createEl('h3', { 
      text: 'New Key:', 
      attr: { style: 'margin: 0 0 5px 0; color: var(--text-normal);' }
    });
    
    this.newKeyInput = contentEl.createEl('input');
    this.newKeyInput.type = 'text';
    this.newKeyInput.placeholder = 'Enter new key (e.g., my_custom_type)';
    this.newKeyInput.style.cssText = `
      width: 100%; padding: 10px; margin: 0 0 20px 0;
      border: 1px solid var(--interactive-accent); border-radius: 6px;
      background: var(--background-primary); font-family: var(--font-monospace); 
      color: var(--text-normal); box-sizing: border-box;
    `;

    // Add focus styling for new key input
    this.newKeyInput.addEventListener('focus', () => {
      this.newKeyInput.style.borderColor = 'var(--interactive-accent)';
      this.newKeyInput.style.boxShadow = '0 0 0 2px var(--interactive-accent-hover)';
    });

    this.newKeyInput.addEventListener('blur', () => {
      this.newKeyInput.style.borderColor = 'var(--interactive-accent)';
      this.newKeyInput.style.boxShadow = 'none';
    });

    // Buttons
    const buttonContainer = contentEl.createEl('div');
    buttonContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 30px;';

    const cancelButton = buttonContainer.createEl('button', { 
      text: 'Cancel',
      attr: { style: 'padding: 8px 16px;' }
    });
    cancelButton.addEventListener('click', () => {
      this.close();
    });

    this.updateButton = buttonContainer.createEl('button', { 
      text: 'Update Type Key',
      attr: { style: 'padding: 8px 16px;' }
    });
    this.updateButton.disabled = true;
    this.updateButton.addClass('mod-cta');
    this.updateButton.addEventListener('click', () => {
      this.handleUpdate();
    });
  }

  async handleUpdate() {
    if (!this.selectedType) {
      new Notice('Please select a type');
      return;
    }

    const newKey = this.newKeyInput.value.trim();

    if (!newKey) {
      new Notice('Please enter a new key');
      return;
    }

    if (newKey === this.selectedType.key) {
      new Notice('New key is the same as current key');
      return;
    }

    if (!/^[a-z][a-z0-9_]*$/.test(newKey)) {
      new Notice('Key should be snake_case format (lowercase letters, numbers, underscores)');
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to change the type key from "${this.selectedType.key}" to "${newKey}"?\n\nThis will affect all objects of this type.`
    );

    if (!confirmed) {
      return;
    }

    try {
      this.updateButton.disabled = true;
      this.updateButton.textContent = 'Updating...';

      const success = await this.plugin.apiService.updateType(
        this.plugin.settings.spaceId,
        this.plugin.settings.apiKey,
        this.selectedType.id,
        { key: newKey }
      );

      if (success) {
        new Notice(`✅ Successfully updated type key from "${this.selectedType.key}" to "${newKey}"`);
        this.close();
        
        // Refresh types data after successful update
        if (this.onSuccess) {
          try {
            await this.onSuccess();
            new Notice('🔄 Types refreshed successfully');
          } catch (error) {
            this.logger.error(`Failed to refresh types: ${error.message}`);
            new Notice('⚠️ Update successful but failed to refresh types');
          }
        }
      } else {
        new Notice('❌ Failed to update type key');
      }

    } catch (error) {
      this.logger.error(`Failed to update type key: ${error.message}`);
      new Notice(`❌ Error: ${error.message}`);
    } finally {
      this.updateButton.disabled = false;
      this.updateButton.textContent = 'Update Type Key';
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// TODO: should be combined with class TypeKeyUpdateModal extends Modal {
class PropertyKeyUpdateModal extends Modal {
  properties: AnyTypeProperty[];
  plugin: AnyTypeSyncPlugin;
  logger: Logger;
  selectedProperty: AnyTypeProperty | null = null;
  currentKeyInput: HTMLInputElement;
  newKeyInput: HTMLInputElement;
  updateButton: HTMLButtonElement;
  onSuccess?: () => Promise<void>;

  constructor(app: App, properties: AnyTypeProperty[], plugin: AnyTypeSyncPlugin, logger: Logger, onSuccess?: () => Promise<void>) {
    super(app);
    this.properties = properties;
    this.plugin = plugin;
    this.logger = logger;
    this.onSuccess = onSuccess;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Update Property Key' });
    
    contentEl.createEl('p', {
      text: 'Select a property from the list below, then enter a new key name. Keys should be in snake_case format.',
      attr: { style: 'margin-bottom: 20px; color: var(--text-muted);' }
    });

    // Property selection list
    const propertyContainer = contentEl.createEl('div');
    propertyContainer.style.cssText = `
      max-height: 200px; overflow-y: auto; border: 1px solid var(--background-modifier-border);
      border-radius: 6px; margin-bottom: 20px;
    `;

    let selectedButton: HTMLElement | null = null;

    this.properties.forEach(property => {
      const propertyRow = propertyContainer.createEl('div');
      propertyRow.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px; border-bottom: 1px solid var(--background-modifier-border); 
        cursor: pointer; transition: background-color 0.2s;
      `;

      const leftSide = propertyRow.createEl('div');
      leftSide.style.cssText = 'display: flex; align-items: center; flex-direction: column; align-items: flex-start;';

      leftSide.createEl('span', {
        text: property.name,
        attr: { style: 'font-weight: bold; color: var(--text-normal); margin-bottom: 4px;' }
      });

      leftSide.createEl('span', {
        text: `Format: ${property.format}`,
        attr: { style: 'font-size: 12px; color: var(--text-muted);' }
      });

      propertyRow.createEl('span', {
        text: property.key,
        attr: { style: 'color: var(--text-muted); font-family: var(--font-monospace); font-size: 13px;' }
      });

      propertyRow.addEventListener('click', () => {
        // Clear previous selection
        if (selectedButton) {
          selectedButton.style.background = '';
        }

        // Set new selection
        selectedButton = propertyRow;
        this.selectedProperty = property;
        propertyRow.style.background = 'var(--background-modifier-hover)';

        // Update inputs
        this.currentKeyInput.value = property.key;
        this.newKeyInput.value = property.key;
        this.updateButton.disabled = false;

        // Focus new key input
        setTimeout(() => {
          this.newKeyInput.focus();
          this.newKeyInput.select();
        }, 100);
      });

      propertyRow.addEventListener('mouseenter', () => {
        if (selectedButton !== propertyRow) {
          propertyRow.style.background = 'var(--background-modifier-hover)';
        }
      });

      propertyRow.addEventListener('mouseleave', () => {
        if (selectedButton !== propertyRow) {
          propertyRow.style.background = '';
        } else {
          propertyRow.style.background = 'var(--background-modifier-hover)';
        }
      });
    });

    // Current key section
    contentEl.createEl('h3', { 
      text: 'Current Key:', 
      attr: { style: 'margin: 20px 0 5px 0; color: var(--text-normal);' }
    });
    
    this.currentKeyInput = contentEl.createEl('input');
    this.currentKeyInput.type = 'text';
    this.currentKeyInput.readOnly = true;
    this.currentKeyInput.placeholder = 'Select a property above to see its current key';
    this.currentKeyInput.style.cssText = `
      width: 100%; padding: 10px; margin: 0 0 20px 0;
      border: 1px solid var(--background-modifier-border); border-radius: 6px;
      background: var(--background-secondary); font-family: var(--font-monospace); 
      color: var(--text-muted); box-sizing: border-box;
    `;

    // New key section  
    contentEl.createEl('h3', { 
      text: 'New Key:', 
      attr: { style: 'margin: 0 0 5px 0; color: var(--text-normal);' }
    });
    
    this.newKeyInput = contentEl.createEl('input');
    this.newKeyInput.type = 'text';
    this.newKeyInput.placeholder = 'Enter new key (e.g., my_custom_property)';
    this.newKeyInput.style.cssText = `
      width: 100%; padding: 10px; margin: 0 0 20px 0;
      border: 1px solid var(--interactive-accent); border-radius: 6px;
      background: var(--background-primary); font-family: var(--font-monospace); 
      color: var(--text-normal); box-sizing: border-box;
    `;

    // Add focus styling for new key input
    this.newKeyInput.addEventListener('focus', () => {
      this.newKeyInput.style.borderColor = 'var(--interactive-accent)';
      this.newKeyInput.style.boxShadow = '0 0 0 2px var(--interactive-accent-hover)';
    });

    this.newKeyInput.addEventListener('blur', () => {
      this.newKeyInput.style.borderColor = 'var(--interactive-accent)';
      this.newKeyInput.style.boxShadow = 'none';
    });

    // Buttons
    const buttonContainer = contentEl.createEl('div');
    buttonContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 30px;';

    const cancelButton = buttonContainer.createEl('button', { 
      text: 'Cancel',
      attr: { style: 'padding: 8px 16px;' }
    });
    cancelButton.addEventListener('click', () => {
      this.close();
    });

    this.updateButton = buttonContainer.createEl('button', { 
      text: 'Update Property Key',
      attr: { style: 'padding: 8px 16px;' }
    });
    this.updateButton.disabled = true;
    this.updateButton.addClass('mod-cta');
    this.updateButton.addEventListener('click', () => {
      this.handleUpdate();
    });
  }

  async handleUpdate() {
    if (!this.selectedProperty) {
      new Notice('Please select a property');
      return;
    }

    const newKey = this.newKeyInput.value.trim();

    if (!newKey) {
      new Notice('Please enter a new key');
      return;
    }

    if (newKey === this.selectedProperty.key) {
      new Notice('New key is the same as current key');
      return;
    }

    if (!/^[a-z][a-z0-9_]*$/.test(newKey)) {
      new Notice('Key should be snake_case format (lowercase letters, numbers, underscores)');
      return;
    }

    // Check if this property key can be updated
    if (!this.plugin.apiService.canUpdatePropertyKey(this.selectedProperty.key)) {
      new Notice(`❌ Cannot update key for system property "${this.selectedProperty.key}" - this is a bundled property with an immutable key`);
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to change the property key from "${this.selectedProperty.key}" to "${newKey}"?\n\nThis will affect all objects that use this property.`
    );

    if (!confirmed) {
      return;
    }

    try {
      this.updateButton.disabled = true;
      this.updateButton.textContent = 'Updating...';

      const success = await this.plugin.apiService.updateProperty(
        this.plugin.settings.spaceId,
        this.plugin.settings.apiKey,
        this.selectedProperty.id,
        { key: newKey, name: this.selectedProperty.name }
      );

      if (success) {
        new Notice(`✅ Successfully updated property key from "${this.selectedProperty.key}" to "${newKey}"`);
        this.close();
        
        // Refresh properties data after successful update
        if (this.onSuccess) {
          try {
            await this.onSuccess();
            new Notice('🔄 Properties refreshed successfully');
          } catch (error) {
            this.logger.error(`Failed to refresh properties: ${error.message}`);
            new Notice('⚠️ Update successful but failed to refresh properties');
          }
        }
      } else {
        new Notice('❌ Failed to update property key - this may be a system property with immutable key');
      }

    } catch (error) {
      this.logger.error(`Failed to update property key: ${error.message}`);
      new Notice(`❌ Error: ${error.message}`);
    } finally {
      this.updateButton.disabled = false;
      this.updateButton.textContent = 'Update Property Key';
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
