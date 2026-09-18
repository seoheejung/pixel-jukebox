import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const installerFilename = 'PixelJukebox-Setup-1.0.0.exe';
const executable = readFileSync(`release/${installerFilename}`);
const installerIcon = readFileSync('installer/PixelJukebox.ico');
const extensionIcon = readFileSync('public/icons/icon-128.png');
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
    expect(readme).toContain(`[${installerFilename} 다운로드](https://seoheejung.github.io/pixel-jukebox/${installerFilename})`);
    const hash = createHash('sha256').update(executable).digest('hex').toUpperCase();
    expect(checksum).toBe(`${hash}  ${installerFilename}\n`);
    expect(readme).toContain(`SHA-256: \`${hash}\``);
    expect(html).toContain(`SHA-256 · ${hash}`);
  });

  it('uses the Extension icon for the Windows installer', () => {
    expect(installerIcon.subarray(0, 6)).toEqual(Buffer.from([0, 0, 1, 0, 1, 0]));
    expect(installerIcon.subarray(22)).toEqual(extensionIcon);
  });

  it('installs and replaces only the app-specific Extension directory', () => {
    expect(source).toContain('Environment.SpecialFolder.LocalApplicationData');
    expect(source).toContain('Path.Combine(localAppData, "Pixel Jukebox")');
    expect(source).toContain('Path.Combine(appRoot, "extension")');
    expect(source).toContain('Directory.Move(installDirectory, backupDirectory)');
    expect(source).toContain('Directory.Move(stagingDirectory, installDirectory)');
    expect(source).toContain('Directory.Move(backupDirectory, installDirectory)');
  });

  it('opens the install folder and gives separate first-install and update instructions', () => {
    expect(source).not.toContain('--new-window chrome://extensions/');
    expect(source).not.toContain('SetForegroundWindow');
    expect(source).not.toContain('GetForegroundWindow');
    expect(source).not.toContain('Clipboard');
    expect(source).not.toContain('SendInput');
    expect(source).not.toContain('SendKeys.SendWait');
    expect(source).toContain('FileName = "explorer.exe"');
    expect(source).toContain('bool isUpdate = InstallPayload(installDirectory);');
    expect(source).toContain('ShowInstructions(installDirectory, isUpdate);');
    expect(source).toContain('처음 설치할 때만 Chrome 주소창에 chrome://extensions/를 입력하세요.');
    expect(source).toContain('기존 Extension 폴더를 새 버전으로 교체했습니다.');
    expect(source).toContain('Pixel Jukebox 카드의 새로고침 버튼을 누르세요.');
    expect(source).toContain('업데이트에서는 \'압축해제된 확장 프로그램을 로드합니다\'나 폴더 선택이 필요하지 않습니다.');
    expect(source).toContain('압축해제된 확장 프로그램을 로드합니다');
    expect(source).toContain('KEEP THIS VIBE는 Settings에서 API Key를 CONNECT한 뒤 사용할 수 있습니다.');
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
    expect(buildScript).toContain('PixelJukebox-Setup-$extensionVersion.exe');
    expect(buildScript).toContain('"/win32icon:$installerRoot\\PixelJukebox.ico"');
    expect(buildScript).toContain('Update-ChecksumText');
    expect(workflow).toContain("cp release/PixelJukebox-Setup-*.exe pages-bundle/");
    expect(workflow).toContain('cp release/SHA256SUMS.txt pages-bundle/');
  });
});
