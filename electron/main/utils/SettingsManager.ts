import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class SettingsManager {
  private settingsPath: string;
  private settings: Record<string, any> = {};

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        this.settings = JSON.parse(data);
        console.log(`[SettingsManager] Loaded from ${this.settingsPath}`);
      }
    } catch (e) {
      console.error('[SettingsManager] Failed to load settings:', e);
      this.settings = {};
    }
  }

  public get(key: string): any {
    return this.settings[key] ?? null;
  }

  public set(key: string, value: any): void {
    this.settings[key] = value;
    this.save();
  }

  private save(): void {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (e) {
      console.error('[SettingsManager] Failed to save settings:', e);
    }
  }
}
