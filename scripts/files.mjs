// Explicit publication allowlist. Installed credentials and generated files never enter a release.
export const runtimeFiles = [
  'LICENSE','README.md','PRIVACY.md','CHANGELOG.md','설치안내.txt','package.json','package-lock.json',
  'install.cmd','install.ps1','uninstall.cmd','uninstall.ps1','login.cmd',
  'extension/manifest.json','extension/background.js','extension/content.js','extension/popup.html','extension/popup.css','extension/popup.js','extension/setup.html','extension/options.html','extension/options.css','extension/options.js',
  'host/core.mjs','host/runner.mjs','host/host.mjs','host/Launcher.cs','host/setup-runtime.mjs','host/translation.schema.json','host/login.ps1','host/open-login.ps1','host/provider-settings.mjs','host/providers.mjs','host/secret-store.ps1'
];
export const sourceFiles = [...runtimeFiles,
  '.gitignore','.gitattributes','CONTRIBUTING.md','SECURITY.md',
  'docs/architecture.md','docs/publishing.md','docs/providers.md',
  '.github/workflows/ci.yml','.github/workflows/release.yml','.github/PULL_REQUEST_TEMPLATE.md',
  'scripts/check.mjs','scripts/files.mjs','scripts/package.mjs','scripts/zip.ps1',
  'tests/core.test.mjs','tests/native.test.mjs','tests/navigation.test.mjs','tests/reader.test.mjs','tests/retry.test.mjs','tests/providers.test.mjs','tests/provider-switch.test.mjs',
  'tests/browser/general-web.mjs','tests/browser/auto-navigation.mjs','tests/browser/settings.mjs'
];
