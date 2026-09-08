// Explicit publication allowlist. Installed credentials and generated files never enter a release.
export const runtimeFiles = [
  'extension/motion.js','extension/motion-settings.js',
  'extension/history-charts.js',
  'host/usage.mjs','host/history.mjs','extension/history.html','extension/history.css','extension/history.js',
  'docs/images/reading-translated.png','docs/images/reading-original.png','docs/images/popup.png',
  'extension/icons/icon-16.png','extension/icons/icon-32.png','extension/icons/icon-48.png','extension/icons/icon-128.png',
  'LICENSE','README.md','PRIVACY.md','CHANGELOG.md','설치안내.txt','package.json','package-lock.json',
  'CONTRIBUTING.md','SECURITY.md','docs/installation.md','docs/architecture.md','docs/publishing.md','docs/providers.md',
  'install.cmd','install.ps1','uninstall.cmd','uninstall.ps1',
  'install.command','uninstall.command','scripts/install-macos.mjs',
  'host/account-runtime.mjs','host/account-providers.mjs','host/account-login.mjs','extension/login.html','extension/login.js',

  'extension/manifest.json','extension/background.js','extension/content.js','extension/popup.html','extension/popup.css','extension/popup.js','extension/setup.html','extension/options.html','extension/options.css','extension/options.js',
  'host/core.mjs','host/runner.mjs','host/host.mjs','host/Launcher.cs','host/setup-runtime.mjs','host/translation.schema.json','host/provider-settings.mjs','host/providers.mjs'
];
export const sourceFiles = [...runtimeFiles,
  'tests/browser/original-hover.mjs','tests/browser/motion.mjs','tests/browser/single-reader.mjs',
  'tests/browser/completion.mjs',
  'tests/history-charts.test.mjs',
  'tests/history.test.mjs','tests/browser/history.mjs',
  'extension/icons/sulsul.svg','scripts/generate-icons.mjs',
  '.gitignore','.gitattributes',
  'docs/chrome-web-store.md',
  '.github/workflows/ci.yml','.github/workflows/release.yml','.github/PULL_REQUEST_TEMPLATE.md',
  'scripts/check.mjs','scripts/files.mjs','scripts/package.mjs','scripts/zip.ps1',
  'host/Installer.swift','scripts/package-macos.mjs','tests/account-providers.test.mjs',
  'tests/core.test.mjs','tests/native.test.mjs','tests/concurrency.test.mjs','tests/navigation.test.mjs','tests/reader.test.mjs','tests/providers.test.mjs','tests/provider-switch.test.mjs','tests/context-menu.test.mjs',
  'tests/browser/popup.mjs','tests/browser/general-web.mjs','tests/browser/auto-navigation.mjs','tests/browser/settings.mjs','tests/browser/reading-priority.mjs'
];
