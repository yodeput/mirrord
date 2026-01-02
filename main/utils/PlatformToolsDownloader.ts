import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import { app } from 'electron';

/**
 * Download and install platform tools for the current OS
 */
export async function downloadPlatformTools(onStatus?: (status: string, progress: number) => void): Promise<boolean> {
    const platform = os.platform();
    let url = '';
    let platformDir = '';

    if (platform === 'win32') {
        url = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';
        platformDir = 'win';
    } else if (platform === 'darwin') {
        url = 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip';
        platformDir = 'mac';
    } else if (platform === 'linux') {
        url = 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip';
        platformDir = 'linux';
    } else {
        throw new Error('Unsupported platform');
    }
  
    onStatus?.('Preparing...', 0);

    const userDataPath = app.getPath('userData');
    const destDir = path.join(userDataPath, 'platform-tools', platformDir);
    const zipPath = path.join(userDataPath, `platform-tools-${platformDir}.zip`);

    console.log(`[PlatformTools] Downloading tools to ${destDir}...`);

    try {
        // Ensure directory exists
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Download
        onStatus?.('Downloading...', 10);
        await new Promise<void>((resolve, reject) => {
            const file = fs.createWriteStream(zipPath);
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }
                
                const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
                let receivedBytes = 0;

                response.on('data', (chunk) => {
                    receivedBytes += chunk.length;
                    if (totalBytes > 0) {
                        const percent = 10 + Math.round((receivedBytes / totalBytes) * 70); // 10% to 80%
                        onStatus?.('Downloading...', percent);
                    }
                });

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(zipPath, () => {});
                reject(err);
            });
        });

        // Extract
        onStatus?.('Extracting...', 80);
        console.log('[PlatformTools] Extracting tools...');
        const { execSync } = require('child_process');
        
        if (platform === 'win32') {
             // Use PowerShell for Windows extraction
             execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
        } else {
             // Use unzip for Mac/Linux
             execSync(`unzip -o "${zipPath}" -d "${destDir}"`);
        }

        // Cleanup
        onStatus?.('Finalizing...', 95);
        fs.unlinkSync(zipPath);
        
        console.log(`[PlatformTools] Setup complete.`);
        onStatus?.('Done', 100);
        return true;

    } catch (error) {
        console.error('[PlatformTools] Failed to download tools', error);
        return false;
    }
}
