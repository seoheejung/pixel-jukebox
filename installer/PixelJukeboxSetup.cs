using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("Pixel Jukebox Setup")]
[assembly: AssemblyDescription("Builds and installs the latest Pixel Jukebox Chrome Extension from GitHub.")]
[assembly: AssemblyCompany("Pixel Jukebox")]
[assembly: AssemblyProduct("Pixel Jukebox Setup")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace PixelJukebox.Setup
{
    internal static class Program
    {
        private const string RepositoryUrl = "https://github.com/seoheejung/pixel-jukebox.git";
        private const string RepositoryBranch = "main";
        private const string ExpectedBridgeUrl = "https://seoheejung.github.io/pixel-jukebox/player.html";

        [STAThread]
        private static int Main(string[] args)
        {
            bool verifyOnly = args.Length == 1 && string.Equals(args[0], "--verify", StringComparison.OrdinalIgnoreCase);
            try
            {
                if (verifyOnly)
                {
                    VerifyInstallerConfiguration();
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                string installDirectory = GetInstallDirectory();
                string cloneRoot = Path.Combine(Path.GetTempPath(), "pixel-jukebox-clone-" + Guid.NewGuid().ToString("N"));
                try
                {
                    string repositoryDirectory = CloneLatestRepository(cloneRoot);
                    BuildExtension(repositoryDirectory);
                    InstallBuild(Path.Combine(repositoryDirectory, "dist"), installDirectory);
                }
                finally
                {
                    DeleteDirectoryIfPresent(cloneRoot);
                }

                OpenInstallDirectory(installDirectory);
                ShowInstructions(installDirectory);
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
            EnsureChildPath(appRoot, installDirectory, "설치 경로");
            return installDirectory;
        }

        private static string CloneLatestRepository(string cloneRoot)
        {
            Directory.CreateDirectory(cloneRoot);
            string repositoryDirectory = Path.Combine(cloneRoot, "pixel-jukebox");
            EnsureChildPath(cloneRoot, repositoryDirectory, "clone 경로");

            RunCommand("git.exe", "--version", cloneRoot, "Git");
            RunCommand(
                "git.exe",
                "clone --depth 1 --branch " + Quote(RepositoryBranch) + " -- " + Quote(RepositoryUrl) + " " + Quote(repositoryDirectory),
                cloneRoot,
                "Git clone");

            if (!File.Exists(Path.Combine(repositoryDirectory, "package-lock.json")))
            {
                throw new InvalidDataException("Clone한 저장소에 package-lock.json이 없습니다.");
            }

            return repositoryDirectory;
        }

        private static void BuildExtension(string repositoryDirectory)
        {
            RunCommand("npm.cmd", "--version", repositoryDirectory, "npm");
            WriteBridgeConfiguration(repositoryDirectory);
            RunCommand("npm.cmd", "ci --no-audit --no-fund", repositoryDirectory, "npm ci");
            RunCommand("npm.cmd", "run build", repositoryDirectory, "Extension build");
        }

        private static void WriteBridgeConfiguration(string repositoryDirectory)
        {
            string configurationPath = Path.Combine(repositoryDirectory, "bridge.config.local.json");
            string configuration = "{\n  \"url\": \"" + ExpectedBridgeUrl + "\"\n}\n";
            File.WriteAllText(configurationPath, configuration, new UTF8Encoding(false));
        }

        private static void InstallBuild(string buildDirectory, string installDirectory)
        {
            VerifyBuild(buildDirectory);

            DirectoryInfo parent = Directory.GetParent(installDirectory);
            if (parent == null)
            {
                throw new InvalidOperationException("설치 폴더의 상위 경로를 확인할 수 없습니다.");
            }

            string appRoot = parent.FullName;
            Directory.CreateDirectory(appRoot);
            string stagingDirectory = Path.Combine(appRoot, ".install-" + Guid.NewGuid().ToString("N"));
            string backupDirectory = Path.Combine(appRoot, ".backup-" + Guid.NewGuid().ToString("N"));
            EnsureChildPath(appRoot, stagingDirectory, "임시 설치 경로");
            EnsureChildPath(appRoot, backupDirectory, "백업 경로");

            try
            {
                CopyDirectory(buildDirectory, stagingDirectory);
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

                DeleteDirectoryIfPresent(backupDirectory);
            }
            finally
            {
                DeleteDirectoryIfPresent(stagingDirectory);
            }
        }

        private static void VerifyBuild(string buildDirectory)
        {
            string manifestPath = Path.Combine(buildDirectory, "manifest.json");
            if (!File.Exists(manifestPath))
            {
                throw new InvalidDataException("빌드 결과에 manifest.json이 없습니다.");
            }

            string manifest = File.ReadAllText(manifestPath, Encoding.UTF8);
            if (manifest.IndexOf("\"name\": \"Pixel Jukebox\"", StringComparison.Ordinal) < 0)
            {
                throw new InvalidDataException("빌드 결과가 Pixel Jukebox 확장 프로그램이 아닙니다.");
            }

            if (manifest.IndexOf(ExpectedBridgeUrl, StringComparison.Ordinal) < 0)
            {
                throw new InvalidDataException("빌드 결과에 공식 Player Bridge가 적용되지 않았습니다.");
            }
        }

        private static void CopyDirectory(string sourceDirectory, string destinationDirectory)
        {
            if (!Directory.Exists(sourceDirectory))
            {
                throw new DirectoryNotFoundException("빌드 폴더를 찾을 수 없습니다: " + sourceDirectory);
            }

            string sourceRoot = Path.GetFullPath(sourceDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            Directory.CreateDirectory(destinationDirectory);
            foreach (string sourcePath in Directory.GetFiles(sourceDirectory, "*", SearchOption.AllDirectories))
            {
                string relativePath = sourcePath.Substring(sourceRoot.Length);
                string destinationPath = Path.GetFullPath(Path.Combine(destinationDirectory, relativePath));
                EnsureChildPath(destinationDirectory, destinationPath, "빌드 파일");
                string destinationParent = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(destinationParent))
                {
                    Directory.CreateDirectory(destinationParent);
                }

                File.Copy(sourcePath, destinationPath, false);
            }
        }

        private static void RunCommand(string fileName, string arguments, string workingDirectory, string label)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = workingDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using (Process process = Process.Start(startInfo))
            {
                if (process == null)
                {
                    throw new InvalidOperationException(label + " 프로세스를 시작하지 못했습니다.");
                }

                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                if (process.ExitCode != 0)
                {
                    throw new InvalidOperationException(label + " 실패 (exit " + process.ExitCode + "): " + SummarizeProcessOutput(error, output));
                }
            }
        }

        private static string SummarizeProcessOutput(string error, string output)
        {
            string message = string.IsNullOrWhiteSpace(error) ? output : error;
            message = message.Trim();
            return message.Length <= 600 ? message : message.Substring(0, 600) + "…";
        }

        private static void VerifyInstallerConfiguration()
        {
            if (!Uri.IsWellFormedUriString(RepositoryUrl, UriKind.Absolute) || !RepositoryUrl.EndsWith(".git", StringComparison.Ordinal))
            {
                throw new InvalidDataException("GitHub 저장소 URL이 올바르지 않습니다.");
            }

            if (!Uri.IsWellFormedUriString(ExpectedBridgeUrl, UriKind.Absolute))
            {
                throw new InvalidDataException("Player Bridge URL이 올바르지 않습니다.");
            }
        }

        private static void EnsureChildPath(string parentDirectory, string childPath, string description)
        {
            string parentPrefix = Path.GetFullPath(parentDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string absoluteChild = Path.GetFullPath(childPath);
            if (!absoluteChild.StartsWith(parentPrefix, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(description + "가 예상 경로를 벗어났습니다.");
            }
        }

        private static void DeleteDirectoryIfPresent(string directory)
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, true);
            }
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static void OpenInstallDirectory(string installDirectory)
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = Quote(installDirectory),
                UseShellExecute = false
            });
        }

        private static void ShowInstructions(string installDirectory)
        {
            string message =
                "GitHub의 최신 Pixel Jukebox를 빌드해 설치했습니다.\n\n" +
                "설치 폴더를 열었습니다. 임시 clone 폴더는 삭제되었습니다.\n\n" +
                "1. Chrome에서 chrome://extensions/를 엽니다.\n" +
                "2. 개발자 모드를 켭니다.\n" +
                "3. '압축해제된 확장 프로그램을 로드합니다'를 누릅니다.\n" +
                "4. 다음 폴더를 선택합니다.\n" + installDirectory + "\n\n" +
                "이미 설치했다면 확장 프로그램의 새로고침 버튼을 누르세요.\n" +
                "KEEP THIS VIBE는 Settings에서 API Key를 CONNECT한 뒤 사용할 수 있습니다.";

            MessageBox.Show(
                message,
                "Pixel Jukebox Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
    }
}
