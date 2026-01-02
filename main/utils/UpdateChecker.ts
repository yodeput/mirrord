import { app, shell } from 'electron';
import * as https from 'https';
import * as semver from 'semver';

export interface UpdateInfo {
  available: boolean;
  version: string;
  url: string;
  downloadUrl: string;
  releaseNotes: string;
}

export class UpdateChecker {
  private static readonly REPO_OWNER = 'yodeput';
  private static readonly REPO_NAME = 'mirrord';

  /**
   * Check for updates
   */
  static async checkForUpdates(): Promise<UpdateInfo> {
    try {
      const currentVersion = app.getVersion();
      const release = await this.getLatestRelease();
      
      if (!release) {
        return { available: false, version: currentVersion, url: '', releaseNotes: '', downloadUrl: '' };
      }

      // Cleanup version strings (remove 'v' prefix if present)
      const latestVersion = release.tag_name.replace(/^v/, '');
      const cleanCurrent = currentVersion.replace(/^v/, '');

      console.log(`[UpdateChecker] Current: ${cleanCurrent}, Latest: ${latestVersion}`);

      if (semver.gt(latestVersion, cleanCurrent)) {
        // Find suitable asset
        const asset = this.findAsset(release.assets);
        
        return {
          available: true,
          version: release.tag_name,
          url: release.html_url, // Web URL
          downloadUrl: asset ? asset.browser_download_url : '', // Direct download URL
          releaseNotes: release.body || ''
        };
      }

      return { available: false, version: currentVersion, url: '', downloadUrl: '', releaseNotes: '' };
    } catch (error) {
      console.error('[UpdateChecker] Failed to check for updates:', error);
      // Return false on error
      return { available: false, version: '', url: '', downloadUrl: '', releaseNotes: '' };
    }
  }

  private static findAsset(assets: any[]): any {
    if (!assets || !Array.isArray(assets)) return null;

    const platform = process.platform;
    const arch = process.arch; // 'x64', 'arm64', etc.

    console.log(`[UpdateChecker] Finding asset for Platform: ${platform}, Arch: ${arch}`);

    return assets.find(asset => {
      const name = asset.name.toLowerCase();
      // console.log(`[UpdateChecker] Checking asset: ${name}`); 

      if (platform === 'darwin') {
        // macOS
        if (!name.endsWith('.dmg')) return false;
        
        // Architecture Check
        if (arch === 'arm64') {
            // Must contain arm64
             return name.includes('arm64');
        } else {
             // Intel (x64) - must contain x64 and NOT arm64
             return name.includes('x64') && !name.includes('arm64');
        }
      } else if (platform === 'win32') {
        // Windows
        return name.endsWith('.exe') && !name.includes('blockmap'); 
      } else if (platform === 'linux') {
        // Linux
        // prioritize .deb for now if apt based, but AppImage is safer generic
        // Let's pick AppImage as it's universal, or deb if arch matches
        if (name.endsWith('.appimage') && name.includes(arch === 'x64' ? 'x64' : arch)) return true;
        if (name.endsWith('.deb') && name.includes(arch === 'x64' ? 'amd64' : arch)) return true;
        return false;
      }
      return false;
    });
  }

  private static getLatestRelease(): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.REPO_OWNER}/${this.REPO_NAME}/releases/latest`,
        headers: {
          'User-Agent': 'Mirrord-App',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      https.get(options, (res) => {
        if (res.statusCode !== 200) {
            // Consume data to free memory
            res.resume();
            reject(new Error(`GitHub API Error: ${res.statusCode}`));
            return;
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }
}
