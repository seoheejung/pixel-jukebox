using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Pixel Jukebox Setup")]
[assembly: AssemblyDescription("Installs the Pixel Jukebox Chrome Extension files.")]
[assembly: AssemblyCompany("Pixel Jukebox")]
[assembly: AssemblyProduct("Pixel Jukebox Setup")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace PixelJukebox.Setup
{
    internal static class Program
    {
        private const string PayloadResource = "PixelJukebox.Extension.zip";
        private const string ExpectedBridgeOrigin = "https://seoheejung.github.io";
        [STAThread]
        private static int Main(string[] args)
        {
            bool verifyOnly = args.Length == 1 && string.Equals(args[0], "--verify", StringComparison.OrdinalIgnoreCase);
            try
            {
                if (verifyOnly)
                {
                    VerifyPayload();
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                string installDirectory = GetInstallDirectory();
                InstallPayload(installDirectory);
                bool chromeOpened = OpenChromeExtensions();
                OpenInstallDirectory(installDirectory);
                ShowInstructions(installDirectory, chromeOpened);
                return 0;
            }
            catch (Exception error)
            {
                if (verifyOnly)
                {
                    return 1;
                }

                MessageBox.Show(
                    "Pixel Jukebox 설치를 완료하지 못했습니다.\n\n" + error.Message,
                    "Pixel Jukebox Setup",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
        }

        private static string GetInstallDirectory()
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (string.IsNullOrWhiteSpace(localAppData))
            {
                throw new InvalidOperationException("Windows Local AppData 경로를 확인할 수 없습니다.");
            }

            string appRoot = Path.GetFullPath(Path.Combine(localAppData, "Pixel Jukebox"));
            string installDirectory = Path.GetFullPath(Path.Combine(appRoot, "extension"));
            string expectedPrefix = appRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!installDirectory.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("안전한 설치 경로를 확인하지 못했습니다.");
            }

            return installDirectory;
        }

        private static void VerifyPayload()
        {
            using (Stream payload = OpenPayload())
            using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read, false))
            {
                ZipArchiveEntry manifest = archive.GetEntry("manifest.json");
                if (manifest == null)
                {
                    throw new InvalidDataException("Extension payload에 manifest.json이 없습니다.");
                }

                using (Stream manifestStream = manifest.Open())
                using (StreamReader reader = new StreamReader(manifestStream, Encoding.UTF8, true))
                {
                    string manifestText = reader.ReadToEnd();
                    if (manifestText.IndexOf("\"name\": \"Pixel Jukebox\"", StringComparison.Ordinal) < 0)
                    {
                        throw new InvalidDataException("Extension payload의 이름이 올바르지 않습니다.");
                    }

                    if (manifestText.IndexOf(ExpectedBridgeOrigin, StringComparison.Ordinal) < 0)
                    {
                        throw new InvalidDataException("Extension payload에 제공된 Player Bridge가 적용되지 않았습니다.");
                    }
                }
            }
        }

        private static Stream OpenPayload()
        {
            Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadResource);
            if (payload == null)
            {
                throw new InvalidDataException("내장된 Extension payload를 찾지 못했습니다.");
            }

            return payload;
        }

        private static void InstallPayload(string installDirectory)
        {
            VerifyPayload();

            string appRoot = Directory.GetParent(installDirectory).FullName;
            Directory.CreateDirectory(appRoot);

            string stagingDirectory = Path.Combine(appRoot, ".install-" + Guid.NewGuid().ToString("N"));
            string backupDirectory = Path.Combine(appRoot, ".backup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(stagingDirectory);

            try
            {
                ExtractPayload(stagingDirectory);
                if (!File.Exists(Path.Combine(stagingDirectory, "manifest.json")))
                {
                    throw new InvalidDataException("압축 해제된 Extension에 manifest.json이 없습니다.");
                }

                bool hadPreviousInstall = Directory.Exists(installDirectory);
                if (hadPreviousInstall)
                {
                    Directory.Move(installDirectory, backupDirectory);
                }

                try
                {
                    Directory.Move(stagingDirectory, installDirectory);
                }
                catch
                {
                    if (!Directory.Exists(installDirectory) && Directory.Exists(backupDirectory))
                    {
                        Directory.Move(backupDirectory, installDirectory);
                    }

                    throw;
                }

                if (Directory.Exists(backupDirectory))
                {
                    Directory.Delete(backupDirectory, true);
                }
            }
            finally
            {
                if (Directory.Exists(stagingDirectory))
                {
                    Directory.Delete(stagingDirectory, true);
                }
            }
        }

        private static void ExtractPayload(string destinationRoot)
        {
            string rootPrefix = Path.GetFullPath(destinationRoot).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            using (Stream payload = OpenPayload())
            using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read, false))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string relativePath = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                    string destinationPath = Path.GetFullPath(Path.Combine(destinationRoot, relativePath));
                    if (!destinationPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidDataException("Extension payload에 안전하지 않은 경로가 포함되어 있습니다.");
                    }

                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(destinationPath);
                        continue;
                    }

                    string parent = Path.GetDirectoryName(destinationPath);
                    if (!string.IsNullOrEmpty(parent))
                    {
                        Directory.CreateDirectory(parent);
                    }

                    using (Stream source = entry.Open())
                    using (FileStream destination = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        source.CopyTo(destination);
                    }
                }
            }
        }

        private static bool OpenChromeExtensions()
        {
            string chromePath = FindChromePath();
            if (chromePath == null)
            {
                return false;
            }

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = chromePath,
                    Arguments = "--new-window chrome://extensions/",
                    UseShellExecute = false
                });
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static string FindChromePath()
        {
            string[] registryPaths =
            {
                @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
                @"HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
                @"HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
            };

            foreach (string registryPath in registryPaths)
            {
                object value = Registry.GetValue(registryPath, null, null);
                string candidate = value as string;
                if (!string.IsNullOrWhiteSpace(candidate) && File.Exists(candidate))
                {
                    return candidate;
                }
            }

            string[] candidates =
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
            };

            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return null;
        }

        private static void OpenInstallDirectory(string installDirectory)
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = "\"" + installDirectory + "\"",
                UseShellExecute = false
            });
        }

        private static void ShowInstructions(string installDirectory, bool chromeOpened)
        {
            string chromeStep = chromeOpened
                ? "Chrome 확장 프로그램 화면을 열었습니다."
                : "Chrome을 찾지 못했거나 화면을 열 수 없습니다. Chrome에서 chrome://extensions/를 직접 여세요.";

            string message =
                "Extension 파일 설치가 완료되었습니다.\n\n" +
                chromeStep + "\n" +
                "화면이 보이지 않으면 Chrome 주소창에 chrome://extensions/를 입력하세요.\n" +
                "설치 폴더도 함께 열었습니다.\n\n" +
                "1. 개발자 모드를 켜세요.\n" +
                "2. '압축해제된 확장 프로그램을 로드합니다'를 누르세요.\n" +
                "3. 다음 폴더를 선택하세요.\n" + installDirectory + "\n" +
                "4. AI 기능 사용 시 Settings에서 API Key를 CONNECT 하세요.";

            MessageBox.Show(
                message,
                "Pixel Jukebox Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
    }
}
