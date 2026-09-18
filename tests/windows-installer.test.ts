import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const executable = readFileSync('release/PixelJukebox-Setup.exe');
const source = readFileSync('installer/PixelJukeboxSetup.cs', 'utf8');
const buildScript = readFileSync('scripts/build-windows-installer.ps1', 'utf8');
const bridgeConfig = readFileSync('installer/bridge.config.json', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const html = readFileSync('player-bridge/index.html', 'utf8');
const checksum = readFileSync('release/SHA256SUMS.txt', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-player-bridge.yml', 'utf8');

describe('Windows Extension installer', () => {
  it('ships a Windows executable with the documented filename', () => {
    expect(executable.subarray(0, 2).toString('ascii')).toBe('MZ');
    expect(executable.length).toBeGreaterThan(30_000);
    expect(readme).toContain('[PixelJukebox-Setup.exe 다운로드](https://seoheejung.github.io/pixel-jukebox/PixelJukebox-Setup.exe)');
    const hash = createHash('sha256').update(executable).digest('hex').toUpperCase();
    expect(checksum).toBe(`${hash}  PixelJukebox-Setup.exe\n`);
    expect(readme).toContain(`SHA-256: \`${hash}\``);
    expect(html).toContain(`SHA-256 · ${hash}`);
  });

  it('installs and replaces only the app-specific Extension directory', () => {
    expect(source).toContain('Environment.SpecialFolder.LocalApplicationData');
    expect(source).toContain('Path.Combine(localAppData, "Pixel Jukebox")');
    expect(source).toContain('Path.Combine(appRoot, "extension")');
    expect(source).toContain('Directory.Move(installDirectory, backupDirectory)');
    expect(source).toContain('Directory.Move(stagingDirectory, installDirectory)');
    expect(source).toContain('Directory.Move(backupDirectory, installDirectory)');
  });

  it('opens the install folder and leaves Chrome internal-page navigation to the user', () => {
    expect(source).not.toContain('--new-window chrome://extensions/');
    expect(source).not.toContain('SetForegroundWindow');
    expect(source).not.toContain('GetForegroundWindow');
    expect(source).not.toContain('Clipboard');
    expect(source).not.toContain('SendInput');
    expect(source).not.toContain('SendKeys.SendWait');
    expect(source).toContain('FileName = "explorer.exe"');
    expect(source).toContain('화면이 보이지 않으면 Chrome 주소창에 chrome://extensions/를 입력하세요.');
    expect(source).toContain('개발자 모드를 켜세요.');
    expect(source).toContain('압축해제된 확장 프로그램을 로드합니다');
    expect(source).toContain('API Key를 CONNECT 하세요.');
  });

  it('does not ship script-based browser automation', () => {
    const releaseScripts = readdirSync('release').filter(file => /\.(vbs|cmd|bat|ps1)$/i.test(file));
    expect(releaseScripts).toEqual([]);
  });

  it('builds and verifies the bundled Extension against the public Bridge', () => {
    expect(JSON.parse(bridgeConfig)).toEqual({ url: 'https://seoheejung.github.io/pixel-jukebox/player.html' });
    expect(source).toContain('ExpectedBridgeOrigin = "https://seoheejung.github.io"');
    expect(source).toContain('VerifyPayload();');
    expect(buildScript).toContain("& npm.cmd run build");
    expect(buildScript).toContain("Start-Process -FilePath $OutputPath -ArgumentList '--verify' -WindowStyle Hidden -Wait -PassThru");
    expect(buildScript).toContain("'PixelJukebox-Setup.exe'");
    expect(buildScript).toContain('Update-ChecksumText');
    expect(workflow).toContain('cp release/PixelJukebox-Setup.exe pages-bundle/');
    expect(workflow).toContain('cp release/SHA256SUMS.txt pages-bundle/');
  });
});
