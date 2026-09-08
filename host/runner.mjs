import {readFileSync} from 'node:fs';
import path from 'node:path';

export function makeEnvironment(config) {
  // Dedicated CLI profile. Never inherit API keys, endpoints or startup hooks.
  const env = {};
  for (const key of ['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','TEMP','TMP','TMPDIR','TERM','LANG','LC_CTYPE','USER','LOGNAME','USERNAME','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  if (process.platform !== 'win32') {
    // This child process gets its own home; the parent environment is untouched.
    env.HOME = config.profile;
    env.XDG_CONFIG_HOME = path.join(config.profile,'.config');
    env.XDG_CACHE_HOME = path.join(config.profile,'.cache');
  }
  return Object.assign(env, {
    USERPROFILE:config.profile,
    APPDATA:path.join(config.profile,'AppData','Roaming'),
    LOCALAPPDATA:path.join(config.profile,'AppData','Local'),
    NO_COLOR:'1'
  });
}

export function loadConfig(filename) {
  return JSON.parse(readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
}
