import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { app, shell } from 'electron';
import * as os from 'os';

export class UpdateDownloader {
  private static downloadRequest: any = null;

  /**
   * Download update file to temp directory
   */
  static async downloadUpdate(url: string, onProgress: (progress: number) => void, targetPath?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        let filePath = targetPath;

        // If no target path provided (first call), calculate it from the URL
        if (!filePath) {
            const tempDir = app.getPath('temp');
            const urlObj = new URL(url);
            let fileName = path.basename(urlObj.pathname);
            
            // Fallback if filename is empty or invalid
            if (!fileName || fileName.length < 3) {
                fileName = `mirrord-update-${Date.now()}.bin`; 
            }
            // Ensure extension exists if possible (simple heuristic)
            if (!path.extname(fileName) && url.endsWith('.dmg')) {
                 fileName += '.dmg';
            } else if (!path.extname(fileName) && url.endsWith('.exe')) {
                 fileName += '.exe';
            }

            filePath = path.join(tempDir, fileName);
        }
        
        // Non-null assertion for TS
        const finalFilePath = filePath!;

        console.log(`[UpdateDownloader] Downloading to: ${finalFilePath}`);

        const request = https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 302 || response.statusCode === 301) {
                if (response.headers.location) {
                    // console.log(`[UpdateDownloader] Redirecting to: ${response.headers.location}`);
                    // Pass the SAME filePath to the recursive call
                    this.downloadUpdate(response.headers.location, onProgress, finalFilePath)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const totalLength = parseInt(response.headers['content-length'] || '0', 10);
            console.log(`[UpdateDownloader] Total length: ${totalLength}`);

            // Overwrite file if exists (createWriteStream does this by default)
            const file = fs.createWriteStream(finalFilePath);
            let downloaded = 0;

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                file.write(chunk);
                
                if (totalLength > 0) {
                    const percent = Math.round((downloaded / totalLength) * 100);
                    onProgress(percent);
                }
            });

            response.on('end', () => {
                file.end();
                console.log('[UpdateDownloader] Download complete');
                resolve(finalFilePath);
            });
        });

        request.on('error', (err) => {
            if (finalFilePath && fs.existsSync(finalFilePath)) {
                 fs.unlink(finalFilePath, () => {}); // Delete failed file
            }
            reject(err);
        });

        this.downloadRequest = request;
    });
  }

  /**
   * Cancel current download
   */
  static cancelDownload() {
      if (this.downloadRequest) {
          this.downloadRequest.destroy();
          this.downloadRequest = null;
      }
  }

  /**
   * Install the update (open the file)
   */
  static async installUpdate(filePath: string): Promise<boolean> {
      try {
          console.log(`[UpdateDownloader] Opening: ${filePath}`);
          
          if (process.platform === 'darwin') {
             // On macOS, we might simply open the DMG
             await shell.openPath(filePath);
          } else {
             // Windows/Linux exec
             await shell.openPath(filePath);
          }
          
          console.log('[UpdateDownloader] Installer opened. Quitting application...');
          setTimeout(() => {
              app.quit();
          }, 1000);

          return true;
      } catch (error) {
          console.error('[UpdateDownloader] Failed to launch installer:', error);
          return false;
      }
  }
}
