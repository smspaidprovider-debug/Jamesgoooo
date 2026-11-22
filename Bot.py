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
 *    export TELEGRAM_BOT_TOKEN="9048455612:AAFYUUgBdi_XL6RatqMA4N-UFDAzpBcH9aY"
 *    export TELEGRAM_ADMIN_ID="7831629041"
 *    export TELEGRAM_ADMIN_USERNAME="@CODINGJAMES_X"
 *    node Bot.pt
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
const DEFAULT_CONFIG = {
  password: '',
  cc: '880',
  proxy: '',
  delay: 25,
  retries: 6,
  timeout: 35,
  skip_probe: true,
  fresh_id: true,
  strict_proxy: true,
  precheck_gql: true,
  auto_proxy_refresh: true,
  auto_proxy_country: true,
  engine_mode: 'hybrid',
  proxy_mode: 'rotate',
  lamix_token: '',
  batch: 5,
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
  '62': ['Indonesia', 'ID'],
  '60': ['Malaysia', 'MY'],
  '63': ['Philippines', 'PH'],
  '84': ['Vietnam', 'VN'],
  '66': ['Thailand', 'TH'],
  '234': ['Nigeria', 'NG'],
  '254': ['Kenya', 'KE'],
  '233': ['Ghana', 'GH'],
  '20': ['Egypt', 'EG'],
  '966': ['Saudi Arabia', 'SA'],
  '971': ['UAE', 'AE'],
  '90': ['Turkey', 'TR'],
  '55': ['Brazil', 'BR'],
  '52': ['Mexico', 'MX'],
  '54': ['Argentina', 'AR'],
  '57': ['Colombia', 'CO'],
  '7': ['Russia', 'RU'],
  '380': ['Ukraine', 'UA'],
  '86': ['China', 'CN'],
  '81': ['Japan', 'JP'],
  '82': ['South Korea', 'KR'],
  '95': ['Myanmar', 'MM'],
  '94': ['Sri Lanka', 'LK'],
  '977': ['Nepal', 'NP'],
  '975': ['Bhutan', 'BT'],
  '93': ['Afghanistan', 'AF'],
  '98': ['Iran', 'IR'],
  '964': ['Iraq', 'IQ'],
  '963': ['Syria', 'SY'],
  '962': ['Jordan', 'JO'],
  '961': ['Lebanon', 'LB'],
  '212': ['Morocco', 'MA'],
  '213': ['Algeria', 'DZ'],
  '216': ['Tunisia', 'TN'],
  '218': ['Libya', 'LY'],
  '249': ['Sudan', 'SD'],
  '251': ['Ethiopia', 'ET'],
  '255': ['Tanzania', 'TZ'],
  '256': ['Uganda', 'UG'],
  '27': ['South Africa', 'ZA'],
  '263': ['Zimbabwe', 'ZW'],
  '260': ['Zambia', 'ZM'],
  '237': ['Cameroon', 'CM'],
  '225': ['Ivory Coast', 'CI'],
  '221': ['Senegal', 'SN'],
  '223': ['Mali', 'ML'],
  '226': ['Burkina Faso', 'BF'],
  '227': ['Niger', 'NE'],
  '235': ['Chad', 'TD'],
  '252': ['Somalia', 'SO'],
  '250': ['Rwanda', 'RW'],
  '265': ['Malawi', 'MW'],
  '258': ['Mozambique', 'MZ'],
  '244': ['Angola', 'AO'],
  '229': ['Benin', 'BJ'],
  '228': ['Togo', 'TG'],
  '224': ['Guinea', 'GN'],
  '232': ['Sierra Leone', 'SL'],
  '231': ['Liberia', 'LR'],
  '220': ['Gambia', 'GM'],
  '222': ['Mauritania', 'MR'],
  '970': ['Palestine', 'PS'],
  '967': ['Yemen', 'YE'],
  '968': ['Oman', 'OM'],
  '965': ['Kuwait', 'KW'],
  '974': ['Qatar', 'QA'],
  '973': ['Bahrain', 'BH'],
};

function getCountryInfo(cleanNum) {
  const s = String(cleanNum || '').replace(/\D/g, '');
  for (const len of [3, 2, 1]) {
    const p = s.slice(0, len);
    if (COUNTRY_MAP[p]) return COUNTRY_MAP[p];
  }
  return ['Unknown', '??'];
}

const CC_INFO = {
  '880': [10, '0'], '91': [10, '0'], '92': [10, '0'], '93': [9, '0'],
  '94': [9, '0'], '977': [10, '0'], '975': [8, ''], '1': [10, '1'],
  '44': [10, '0'], '61': [9, '0'], '62': [10, '0'], '60': [9, '0'],
  '65': [8, ''], '66': [9, '0'], '84': [9, '0'], '63': [10, '0'],
  '81': [10, '0'], '82': [10, '0'], '86': [11, '0'], '95': [9, '0'],
  '855': [9, '0'], '856': [9, '0'], '971': [9, '0'], '966': [9, '0'],
  '974': [8, ''], '965': [8, ''], '968': [8, ''], '973': [8, ''],
  '967': [9, '0'], '970': [9, '0'], '964': [10, '0'], '963': [9, '0'],
  '962': [9, '0'], '961': [8, '0'], '20': [10, '0'], '234': [10, '0'],
  '254': [9, '0'], '255': [9, '0'], '256': [9, '0'], '251': [9, '0'],
  '250': [9, '0'], '252': [8, '0'], '258': [9, '0'], '27': [9, '0'],
  '233': [9, '0'], '237': [9, ''], '260': [9, '0'], '263': [9, '0'],
  '265': [9, '0'], '249': [9, '0'], '244': [9, '0'], '212': [9, '0'],
  '213': [9, '0'], '216': [8, ''], '218': [9, '0'], '221': [9, ''],
  '223': [8, ''], '224': [9, ''], '225': [10, ''], '226': [8, ''],
  '227': [8, ''], '228': [8, ''], '229': [8, ''], '231': [8, '0'],
  '232': [8, '0'], '235': [8, ''], '220': [7, ''], '222': [8, ''],
  '90': [10, '0'], '98': [10, '0'], '7': [10, '8'], '380': [9, '0'],
  '48': [9, ''], '49': [10, '0'], '33': [9, '0'], '39': [10, ''],
  '34': [9, ''], '55': [11, '0'], '52': [10, ''], '54': [10, '0'],
  '57': [10, '0'],
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
  '234': ['Chinedu', 'Emeka', 'Tunde', 'Sadiq', 'Ibrahim', 'Amina', 'Zainab', 'Blessing', 'Femi', 'Kola', 'Samuel'],
  '880': ['Arafat', 'Rakib', 'Sabbir', 'Nayeem', 'Rifat', 'Tanvir', 'Shakib', 'Sajid', 'Nahid', 'Rasel', 'Hasan', 'Fahim', 'Jahid', 'Nusrat', 'Sadia', 'Tasnim', 'Farhana', 'Jannat'],
  '91': ['Aarav', 'Rohan', 'Vikram', 'Rahul', 'Aditya', 'Arjun', 'Ananya', 'Priya', 'Neha', 'Karan', 'Amit'],
  '92': ['Hamza', 'Bilal', 'Usman', 'Zain', 'Saad', 'Ayesha', 'Fatima', 'Hira', 'Ali', 'Umar'],
  '62': ['Budi', 'Rizky', 'Fajar', 'Dimas', 'Putra', 'Siti', 'Dewi', 'Nisa', 'Andi', 'Bagus'],
  '63': ['John', 'Mark', 'Carlo', 'Paolo', 'Joshua', 'Maria', 'Angela', 'Bea', 'Camille'],
  '1': ['Liam', 'Noah', 'Ethan', 'Lucas', 'Mason', 'Emma', 'Olivia', 'Ava', 'Sophia', 'Daniel'],
  '44': ['Oliver', 'George', 'Harry', 'Jack', 'Charlie', 'Amelia', 'Isla', 'Ava', 'Mia', 'Emily'],
};
const REGION_LAST_NAMES = {
  '255': ['Juma', 'Bakari', 'Omari', 'Hamisi', 'Kassim', 'Salim', 'Mohamed', 'Hassan', 'Mushi', 'Massawe', 'Ally', 'Rajabu', 'Rashid'],
  '254': ['Mwangi', 'Kamau', 'Ochieng', 'Otieno', 'Njoroge', 'Wanjiku', 'Kiprop', 'Mutua'],
  '234': ['Okafor', 'Adeyemi', 'Babatunde', 'Ibrahim', 'Musa', 'Balogun', 'Chukwu', 'Sani'],
  '880': ['Hossain', 'Ahmed', 'Khan', 'Islam', 'Rahman', 'Sarker', 'Mia', 'Sheikh', 'Chowdhury', 'Talukder', 'Molla', 'Biswas', 'Mahmud'],
  '91': ['Sharma', 'Patel', 'Singh', 'Kumar', 'Verma', 'Gupta', 'Roy', 'Das', 'Nair', 'Reddy'],
  '92': ['Khan', 'Ahmed', 'Malik', 'Sheikh', 'Qureshi', 'Raza', 'Siddiqui', 'Ali'],
  '62': ['Saputra', 'Pratama', 'Wijaya', 'Santoso', 'Hidayat', 'Putri', 'Lestari'],
  '63': ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres'],
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
  '255': { tz: ['Africa/Dar_es_Salaam', 3], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '254': { tz: ['Africa/Nairobi', 3], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '256': { tz: ['Africa/Kampala', 3], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '234': { tz: ['Africa/Lagos', 1], langs: ['en-GB,en;q=0.9', 'en-US,en;q=0.9'] },
  '20': { tz: ['Africa/Cairo', 2], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '62': { tz: ['Asia/Jakarta', 7], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '60': { tz: ['Asia/Kuala_Lumpur', 8], langs: ['en-MY,en;q=0.9', 'en-US,en;q=0.9'] },
  '63': { tz: ['Asia/Manila', 8], langs: ['en-PH,en;q=0.9', 'en-US,en;q=0.9'] },
  '84': { tz: ['Asia/Ho_Chi_Minh', 7], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '66': { tz: ['Asia/Bangkok', 7], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '966': { tz: ['Asia/Riyadh', 3], langs: ['en-US,en;q=0.9', 'en-GB,en;q=0.9'] },
  '971': { tz: ['Asia/Dubai', 4], langs: ['en-AE,en;q=0.9', 'en-US,en;q=0.9'] },
  '44': { tz: ['Europe/London', 0], langs: ['en-GB,en;q=0.9'] },
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
        .replace(/([_-](?:country|cc)[_-])[a-zA-Z]{2}/gi, '$1*')
        .replace(/[_-]city[_-][A-Za-z0-9_]+(?=[_-]|$)/gi, '')
        .replace(/([_-]sst[_-])\d+/gi, '$1*');
      return `${u.protocol}//${dec}@${u.host}`;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return String(proxyUrl);
  }
}

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
  };
  if (!proxyUrl) return out;
  try {
    const u = new URL(proxyUrl);
    const hostLow = (u.hostname || '').toLowerCase();
    out.isNiceProxy = hostLow.includes('niceproxy') || hostLow.includes('9proxy');
    const user = decodeURIComponent(u.username || '');
    const mc = user.match(/[_-](?:country|cc)[_-]([a-zA-Z]{2})(?=[_-]|$)/i) || user.match(/(?:country|cc)[=:]([a-zA-Z]{2})(?=[;&,\-_]|$)/i);
    if (mc) {
      out.hasCountryTag = true;
      out.countryCode = mc[1].toUpperCase();
    }
    const mcity = user.match(/[_-]city[_-]([A-Za-z0-9_]+)(?=[_-]|$)/i) || user.match(/city[=:]([A-Za-z0-9_]+)(?=[;&,\-_]|$)/i);
    if (mcity) {
      out.hasCityTag = true;
      out.city = mcity[1];
    }
    const ms = user.match(/[_-](?:ssid|session|sessid|ses|sid|sticky)[_-]([A-Za-z0-9]{1,32})(?=[_-]|$)/i) || user.match(/(?:ssid|session|sessid|ses|sid|sticky)[=:]([A-Za-z0-9]{1,32})(?=[;&,\-_]|$)/i);
    if (ms) {
      out.hasSessionTag = true;
      out.sessionId = ms[1];
    }
    const msst = user.match(/[_-]sst[_-](\d+)(?=[_-]|$)/i);
    if (msst) {
      out.hasSst = true;
      out.sst = msst[1];
    }
  } catch {
    // ignore
  }
  return out;
}

function adaptProxyForSession(proxyUrl, opts = {}) {
  const raw = String(proxyUrl || '').trim();
  if (!raw) return { url: null, isoApplied: '', sessionId: '', countryChanged: false, sessionRefreshed: false, cityCleared: false };
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

    if (opts.autoCountry !== false && /^[a-z]{2}$/.test(targetIso) && user) {
      const prevIsoUpper = origCap.countryCode || '';
      const actuallyDifferent = !prevIsoUpper || prevIsoUpper !== targetIsoUpper;

      const next1 = user.replace(/([_-](?:country|cc)[_-])([a-zA-Z]{2})(?=[_-]|$)/gi, (_, p1) => `${p1}${targetIso}`);
      const next2 = next1.replace(/((?:country|cc)[=:])([a-zA-Z]{2})(?=[;&,\-_]|$)/gi, (_, p1) => `${p1}${targetIso}`);
      if (next2 !== user) {
        user = next2;
        isoApplied = targetIsoUpper;
        countryChanged = actuallyDifferent;
      } else if ((hostLow.includes('niceproxy') || hostLow.includes('9proxy')) && !/country/i.test(user)) {
        if (/([_-]ssid[_-])/i.test(user)) {
          user = user.replace(/([_-]ssid[_-])/i, `-country-${targetIso}$1`);
        } else {
          user = `${user}-country-${targetIso}`;
        }
        isoApplied = targetIsoUpper;
        countryChanged = true;
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
      const isoPrefix = (isoApplied || origCap.countryCode || '').toLowerCase().slice(0, 2);
      const nextTok = opts.forcedSessionId || `${isoPrefix}${randomSessionToken(isoPrefix ? 8 : 10)}`;
      const next1 = user.replace(/([_-](?:ssid|session|sessid|ses|sid|sticky)[_-])([A-Za-z0-9]{1,32})(?=[_-]|$)/gi, (_, p1) => `${p1}${nextTok}`);
      const next2 = next1.replace(/((?:ssid|session|sessid|ses|sid|sticky)[=:])([A-Za-z0-9]{1,32})(?=[;&,\-_]|$)/gi, (_, p1) => `${p1}${nextTok}`);
      if (next2 !== next1 || next1 !== user) {
        user = next2;
        sessionId = nextTok;
        sessionRefreshed = true;
      } else if (hostLow.includes('niceproxy') || hostLow.includes('9proxy') || /[_-]country[_-][a-z]{2}/i.test(user)) {
        if (/([_-]sst[_-]\d+)/i.test(user)) {
          user = user.replace(/([_-]sst[_-]\d+)/i, `-ssid-${nextTok}$1`);
        } else {
          user = `${user}-ssid-${nextTok}`;
        }
        sessionId = nextTok;
        sessionRefreshed = true;
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
    };
  } catch {
    return { url: raw, isoApplied: '', sessionId: '', countryChanged: false, sessionRefreshed: false, cityCleared: false };
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

async function fetchViaProxyCurl(url, jar, opts, proxyUrl) {
  const method = opts.method || 'GET';
  const timeoutSec = Math.max(5, Math.ceil((opts.timeoutMs || 25000) / 1000));
  const cookieStr = formatCookieHeader(jar);
  const marker = '__FBTOOLS_META__';

  const parsedPx = new URL(proxyUrl);
  // Use remote DNS resolution for SOCKS proxies so VPS DNS never leaks
  const curlProto =
    parsedPx.protocol === 'socks5:'
      ? 'socks5h:'
      : parsedPx.protocol === 'socks4:'
      ? 'socks4a:'
      : parsedPx.protocol;
  const proxyEndpoint = `${curlProto}//${parsedPx.hostname}${parsedPx.port ? ':' + parsedPx.port : ''}`;

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
    String(Math.min(12, timeoutSec)),
    '--max-time',
    String(timeoutSec),
    '-i',
    '-x',
    proxyEndpoint,
    ...(parsedPx.username || parsedPx.password
      ? ['--proxy-user', `${decodeURIComponent(parsedPx.username)}:${decodeURIComponent(parsedPx.password)}`]
      : []),
    '-X',
    method,
  ];

  for (const [k, v] of Object.entries(hdrs)) {
    args.push('-H', `${k}: ${v}`);
  }
  if (opts.body !== undefined) {
    args.push('--data-raw', opts.body);
  }
  args.push('-w', `\n${marker}%{http_code}|%{url_effective}`);
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
  const [statusStr, effUrl] = metaPart.split('|');
  const status = Number(statusStr) || 200;

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

async function testProxyTcp(target, checkExitIp = true) {
  const t0 = Date.now();
  const valid = validateProxyUrl(target);
  if (!valid) {
    return { proxy: target, ok: false, latencyMs: 0, error: 'Invalid proxy format' };
  }
  try {
    const parsed = new URL(valid);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    await new Promise((resolve, reject) => {
      const s = net.createConnection({ host: parsed.hostname, port, timeout: 4500 }, () => {
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
      { timeoutMs: 14000, ua: fp.ua, headers: fp.headers },
      valid
    );
    const ipPromise = checkExitIp
      ? fetchViaProxyCurl('https://ip-info.9proxy.com', {}, { timeoutMs: 8000, ua: fp.ua }, valid)
          .then(async (r) => {
            try {
              const j = JSON.parse(r.text || '{}');
              if (j.ip) return { ip: j.ip, iso: j.iso2 || '', country: j.country || '', city: j.city || '', isp: j.isp || '' };
            } catch {
              // fallback
            }
            const r2 = await fetchViaProxyCurl('https://api.ipify.org?format=json', {}, { timeoutMs: 6000, ua: fp.ua }, valid);
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
    const hasLsd = Boolean(
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
function detectCountryFromNumber(raw, fallbackCc = '880') {
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

  const fbCc = String(fallbackCc || '880').replace(/\D/g, '') || '880';
  const [fbNat, fbTrunk] = CC_INFO[fbCc] || [0, '0'];

  // Local number with leading trunk 0 (not explicit + or 00) -> use fallback CC
  if (!explicitIntl && !hadZeroZero && d.startsWith('0')) {
    const stripped = fbTrunk && d.startsWith(fbTrunk) ? d.slice(fbTrunk.length) : d.replace(/^0+/, '');
    const full = fbCc + stripped;
    if (fbNat && full.length < fbCc.length + fbNat - 2) return null;
    if (full.length > 15 || full.length < 8) return null;
    const [name, iso] = COUNTRY_MAP[fbCc] || ['Unknown', '??'];
    return { normalized: full, cc: fbCc, name, iso };
  }

  // If digits look like an exact local number for fallbackCc (without CC prefix), treat as local fallbackCc
  if (!explicitIntl && !hadZeroZero && fbNat > 0 && d.length === fbNat && !d.startsWith(fbCc)) {
    const full = fbCc + d;
    if (full.length <= 15) {
      const [name, iso] = COUNTRY_MAP[fbCc] || ['Unknown', '??'];
      return { normalized: full, cc: fbCc, name, iso };
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

  // Fallback to default CC
  let out = d;
  if (!out.startsWith(fbCc)) {
    if (fbTrunk && out.startsWith(fbTrunk)) out = out.slice(fbTrunk.length);
    out = fbCc + out;
  }
  if (fbNat && out.length < fbCc.length + fbNat - 2) return null;
  if (out.length > 15 || out.length < 8) return null;
  const [name, iso] = COUNTRY_MAP[fbCc] || ['Unknown', '??'];
  return { normalized: out, cc: fbCc, name, iso };
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

async function checkNumberGraphql(phoneNumber, opts = {}) {
  const numStr = String(phoneNumber || '').trim().startsWith('+')
    ? String(phoneNumber).trim()
    : `+${String(phoneNumber || '').replace(/\D/g, '')}`;
  const digits = numStr.replace(/\D/g, '');
  if (!digits) return { status: 'unknown', nameHint: '', reason: 'invalid phone' };

  const fp = buildFingerprint(opts.cc || '');
  const lsd = opts.lsd || DEFAULT_FB_LSD;
  const hdrs = {
    ...fp.xhrHeaders,
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
    'x-fb-friendly-name': 'CAAFBAccountSearchViewQuery',
    'x-asbd-id': '359341',
    'x-fb-lsd': lsd,
    origin: 'https://www.facebook.com',
    referer: 'https://www.facebook.com/login/identify/',
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
    dpr: String(fp.dpr),
    __ccg: 'EXCELLENT',
    __rev: '1050579926',
    __comet_req: '15',
    lsd,
    jazoest: opts.lsd ? jazoest(lsd) : DEFAULT_GQL_JAZOEST,
    __spin_r: '1050579926',
    __spin_b: 'trunk',
    __spin_t: String(Math.floor(Date.now() / 1000)),
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'CAAFBAccountSearchViewQuery',
    server_timestamps: 'true',
    variables: JSON.stringify(variables),
    doc_id: DEFAULT_GQL_DOC_ID,
  }).toString();

  const jar = {};
  try {
    const res = await fetchWithJar(FB_GRAPHQL_URL, jar, {
      method: 'POST',
      headers: hdrs,
      body: payload,
      ua: fp.ua,
      timeoutMs: opts.timeoutMs || 25000,
      proxy: opts.proxy || null,
      strictProxy: opts.strictProxy !== false,
      shouldAbort: opts.shouldAbort,
    });
    if (res.status !== 200) {
      return { status: 'unknown', nameHint: '', reason: `HTTP ${res.status}` };
    }
    const clean = (res.text || '').trim().replace(/^for\s*\(\s*;\s*;\s*\)\s*;?/, '');
    const js = JSON.parse(clean);
    if (js?.error) {
      return {
        status: 'unknown',
        nameHint: '',
        reason: js.errorSummary || js.errorDescription || `FB Err ${js.error}`,
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
    if (/too many|rate limit|try again|blocked|temporarily/i.test(descLow)) {
      return { status: 'unknown', nameHint: '', reason: desc.slice(0, 80) };
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
  const timeoutMs = (cfg.timeout || 35) * 1000;
  const px = proxy !== undefined ? proxy : cfg.proxy;
  const strictProxy = cfg.strict_proxy !== false;
  const fp = opts.fp || buildFingerprint(cfg.cc);
  try {
    await fetchWithJar('https://www.facebook.com/', jar, {
      timeoutMs: Math.min(timeoutMs, 18000),
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
        timeoutMs,
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
  const px = (item.proxy || cfg.proxy || '').trim() || null;
  const strictProxy = cfg.strict_proxy !== false;
  const ua = item.ua || LITE_UA;
  let confirmUrl = item.confirm_url || `${FB_REG_BASE}/confirmphone.php`;
  let act = item.action || '';
  let flds = { ...(item.fields || {}) };
  const timeoutMs = ((cfg.timeout || 35) + 5) * 1000;

  if (!act && /\/reg\/submit\//i.test(confirmUrl) && !jar.c_user) {
    return { status: 'FAIL', err: 'Incomplete/failed signup session (no real Facebook confirm form)' };
  }

  if (!act) {
    try {
      const r = await fetchWithJar(confirmUrl, jar, { timeoutMs, proxy: px, strictProxy, ua });
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

  const resolvedAct = new URL(act, confirmUrl).toString();
  const baseOrigin = new URL(resolvedAct).origin;
  const fld = OTP_FIELDS.find((k) => k in flds) || 'code';
  if (code) {
    flds[fld] = code;
  }

  let r;
  try {
    r = await fetchWithJar(resolvedAct, jar, {
      method: 'POST',
      body: new URLSearchParams(flds).toString(),
      timeoutMs,
      proxy: px,
      strictProxy,
      ua,
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
  const timeoutMs = (cfg.timeout || 35) * 1000;
  const strictProxy = cfg.strict_proxy !== false;

  // Step 1: Warmup TLS & genuine Facebook cookies on www.facebook.com (exact bot.py flow)
  try {
    await fetchWithJar('https://www.facebook.com/', jar, {
      timeoutMs: Math.min(timeoutMs, 18000),
      proxy: px,
      strictProxy,
      ua: fp.ua,
      headers: { ...fp.headers, 'sec-fetch-site': 'none' },
      shouldAbort: opts.shouldAbort,
    });
  } catch (err) {
    if (err && err.isProxyError) throw err;
  }

  if (!(await sleepAbort(1000 + Math.floor(Math.random() * 1000), opts.shouldAbort))) {
    return { aborted: true };
  }

  // Step 2: GET limited.facebook.com registration entrypoint
  const regUrl = `${FB_REG_BASE}/reg/?cid=103&refsrc=deprecated&soft=hjk`;
  const rGet = await fetchWithJar(regUrl, jar, {
    timeoutMs,
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

  // Step 3: Human-like delay matching bot.py (3.5-6.2s)
  if (!(await sleepAbort(3500 + Math.floor(Math.random() * 2700), opts.shouldAbort))) {
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
    timeoutMs: timeoutMs + 10000,
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
  const timeoutMs = (cfg.timeout || 35) * 1000;
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
      await sleepAbort(450 + Math.floor(Math.random() * 750), opts.shouldAbort);
      const r = await fetchWithJar(act, jar, {
        method: 'POST',
        body: new URLSearchParams(data).toString(),
        timeoutMs: timeoutMs + 10000,
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
  const numDet = detectCountryFromNumber(`+${phone}`, cfg.cc) || {
    normalized: phone,
    cc: cfg.cc,
    name: getCountryInfo(phone)[0],
    iso: getCountryInfo(phone)[1],
  };
  const autoCountry = cfg.auto_proxy_country !== false;
  const autoRefresh = cfg.auto_proxy_refresh !== false;
  const effectiveCc = autoCountry && numDet.cc ? numDet.cc : cfg.cc;
  const [, fbIso] = getCountryInfo(effectiveCc);
  const effectiveIso = autoCountry && numDet.iso && numDet.iso !== '??' ? numDet.iso : fbIso;

  const identity = generateIdentity(effectiveCc);
  const fmts = numberVariants(phone, effectiveCc);
  const pool = [...(opts.proxiesPool || [])];
  if (cfg.proxy_mode === 'random') {
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
  }
  const tries = Math.max(2, Math.min(12, Number(cfg.retries || 6)));
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

  // Optional GraphQL pre-check before wasting registration attempts
  if (cfg.precheck_gql !== false && !opts.skipPrecheck) {
    const rawPrePx =
      pool.length > 0
        ? selectSmartProxy(pool, 0, badProxies, cfg.proxy_mode || 'rotate', proxy || cfg.proxy || null)
        : proxy || cfg.proxy || null;
    const preAdapted = adaptProxyForSession(rawPrePx, {
      iso: effectiveIso,
      autoCountry,
      refreshSession: autoRefresh,
    });
    const prePx = preAdapted.url;
    try {
      const gql = await checkNumberGraphql(`+${phone}`, {
        cc: effectiveCc,
        proxy: prePx,
        strictProxy: cfg.strict_proxy !== false,
        timeoutMs: Math.min((cfg.timeout || 35) * 1000, 22000),
        shouldAbort: opts.shouldAbort,
      });
      const pxTag = prePx
        ? ` [${preAdapted.isoApplied || effectiveIso || 'PX'}${preAdapted.sessionId ? `:${preAdapted.sessionId.slice(0, 6)}` : ''}]`
        : '';
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
        };
      }
    } catch (err) {
      if (err && err.isProxyError && rawPrePx) badProxies.add(proxyHealthKey(rawPrePx));
      log(`+${phone} GQL pre-check err: ${err instanceof Error ? err.message : 'failed'}`);
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
    const px = adaptedPx.url;
    const trace = [];
    if (px && (adaptedPx.countryChanged || adaptedPx.sessionRefreshed)) {
      trace.push(`px=${adaptedPx.isoApplied || effectiveIso}:${adaptedPx.sessionId ? adaptedPx.sessionId.slice(0, 6) : 'direct'}`);
    }

    try {
      const stepRes = useLimited
        ? await runLimitedSignupStep({ phone, cleanPhone, fmt, pw, identity, fp, cfg, jar, px, trace, opts })
        : await runClassicSignupStep({ phone, cleanPhone, fmt, pw, identity, fp, cfg, jar, px, trace, opts });

      if (stepRes.aborted) break;
      if (stepRes.result) {
        log(`+${phone} ${stepRes.result.status}${stepRes.result.uid ? ` UID=${stepRes.result.uid}` : ''} [${stepRes.result.engine}] ${trace.join(' | ')}`);
        return stepRes.result;
      }
      if (stepRes.html) lastHtml = stepRes.html.slice(0, 6000);
      lastErr = stepRes.err || 'no result';
      log(`+${phone} try ${i + 1}/${tries} (${useLimited ? 'limited' : 'classic'}) [${adaptedPx.isoApplied || effectiveIso}${adaptedPx.sessionId ? `:${adaptedPx.sessionId.slice(0, 6)}` : ''}]: ${lastErr}`);
    } catch (err) {
      if (err && err.isProxyError && rawPx) badProxies.add(proxyHealthKey(rawPx));
      lastErr = err instanceof Error ? err.message : 'attempt error';
      log(`+${phone} try ${i + 1}/${tries} err: ${lastErr}`);
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
  };
}

async function runDiagnoseFor(cfg, cookieRaw, proxyOverride) {
  const jar = parseCookieHeader(cookieRaw || normalizeBaseCookiesRaw(''));
  const trace = [];
  const px = proxyOverride !== undefined ? proxyOverride : cfg.proxy || null;
  const fp = buildFingerprint(cfg.cc);
  const tk = await harvestTokens(cfg, jar, trace, px, { fp });

  let proxyAlive = null;
  let proxyError;
  let proxyExitIp = '';
  let proxyLatency = 0;
  if (px) {
    const pr = await testProxyTcp(px, true);
    proxyAlive = pr.ok;
    proxyError = pr.error;
    proxyExitIp = pr.exitIp || '';
    proxyLatency = pr.latencyMs || 0;
  }

  let gqlOk = false;
  let gqlInfo = '';
  try {
    const gql = await checkNumberGraphql('+8801700000001', {
      cc: cfg.cc,
      proxy: px,
      strictProxy: cfg.strict_proxy !== false,
      timeoutMs: 18000,
    });
    gqlOk = gql.status === 'free' || gql.status === 'taken';
    gqlInfo = `${gql.status}${gql.reason ? ` (${gql.reason})` : ''}`;
  } catch (err) {
    gqlInfo = err instanceof Error ? err.message : 'failed';
  }

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
// 6. Multi-User Telegram Bot Manager
// ----------------------------------------------------------------------------
function createStandaloneBot(botToken) {
  const DEFAULT_SETTINGS = {
    brandName: DEFAULT_BRAND_NAME,
    adminId: DEFAULT_ADMIN_ID,
    adminUsername: DEFAULT_ADMIN_USERNAME,
    ownerUrl: DEFAULT_OWNER_URL,
    channelUrl: DEFAULT_CHANNEL_URL,
    requireApproval: true,
    requireChannelJoin: false,
    maintenanceMode: false,
    defaultDailyLimit: 25,
    defaultEngineMode: 'hybrid',
    defaultPrecheckGql: true,
    shareGlobalProxies: true,
    welcomeNote: `Welcome to ${DEFAULT_BRAND_NAME} Multi-User Automation Hub. Channel: ${DEFAULT_CHANNEL_URL}`,
  };

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

  function pushBotLog(msg) {
    const line = appendDebugLog(`[TG-BOT] ${msg}`);
    logs.push(line);
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    console.log(line);
  }

  function readSettings() {
    try {
      if (fs.existsSync(FILES.botSettings)) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(FILES.botSettings, 'utf-8')) };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_SETTINGS };
  }

  function writeSettings(patch) {
    const merged = { ...readSettings(), ...patch };
    fs.writeFileSync(FILES.botSettings, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  }

  function readUsersMap() {
    try {
      if (fs.existsSync(FILES.botUsers)) {
        const parsed = JSON.parse(fs.readFileSync(FILES.botUsers, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  }

  function writeUsersMap(map) {
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

    if (tgUser.username !== undefined) existing.username = tgUser.username;
    if (tgUser.first_name) existing.firstName = tgUser.first_name;
    existing.lastActiveAt = Date.now();
    if (existing.lastResetDate !== today) {
      existing.usedToday = 0;
      existing.lastResetDate = today;
    }
    if (isAdmin) {
      existing.role = 'admin';
      existing.status = 'approved';
    }
    map[uid] = existing;
    writeUsersMap(map);
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
    fs.writeFileSync(files.pending, JSON.stringify(items, null, 2), 'utf-8');
  }

  function pushUserPending(uid, item) {
    const items = readUserPending(uid);
    if (items.some((p) => p.phone === item.phone)) return;
    items.push({ ...item, createdAt: item.createdAt || Date.now() });
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

  async function tgCall(method, payload = {}, signal) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
      return await res.json();
    } catch (err) {
      return { ok: false, description: err instanceof Error ? err.message : 'Network error' };
    }
  }

  const btnOk = (text, callback_data) => ({ text, callback_data, style: 'success' });
  const btnBad = (text, callback_data) => ({ text, callback_data, style: 'danger' });
  const btnNav = (text, callback_data) => ({ text, callback_data, style: 'primary' });
  const btnUrl = (text, url, style = 'primary') => ({ text, url, style });

  function stripMarkupStyles(replyMarkup) {
    if (!replyMarkup || !Array.isArray(replyMarkup.inline_keyboard)) return replyMarkup;
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

  async function sendMessage(chatId, text, replyMarkup) {
    const body = text.length > 4000 ? text.slice(0, 3990) + '...' : text;
    let res = await tgCall('sendMessage', {
      chat_id: chatId,
      text: body,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    if (!res.ok && String(res.description || '').toLowerCase().includes('style') && replyMarkup) {
      res = await tgCall('sendMessage', {
        chat_id: chatId,
        text: body,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: stripMarkupStyles(replyMarkup),
      });
    }
    if (!res.ok && String(res.description || '').toLowerCase().includes('parse entities')) {
      return tgCall('sendMessage', {
        chat_id: chatId,
        text: body.replace(/<[^>]+>/g, ''),
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
    return res;
  }

  async function editMessage(chatId, messageId, text, replyMarkup) {
    const body = text.length > 4000 ? text.slice(0, 3990) + '...' : text;
    let res = await tgCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: body,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    if (!res.ok && String(res.description || '').toLowerCase().includes('style') && replyMarkup) {
      res = await tgCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: body,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: stripMarkupStyles(replyMarkup),
      });
    }
    if (!res.ok && String(res.description || '').toLowerCase().includes('parse entities')) {
      return tgCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: body.replace(/<[^>]+>/g, ''),
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
    return res;
  }

  async function sendDocumentText(chatId, filename, content, caption = '') {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption);
    form.append('document', new Blob([content], { type: 'text/plain;charset=utf-8' }), filename);
    await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: form });
  }

  async function checkChannelMembership(uid, st) {
    if (!st.requireChannelJoin) return { ok: true };
    const handle = getChannelHandle(st.channelUrl);
    if (!handle || !handle.startsWith('@')) return { ok: true };
    const res = await tgCall('getChatMember', { chat_id: handle, user_id: Number(uid) || uid });
    if (!res.ok || !res.result) {
      // Fail-open if bot is not yet admin in the channel so users are not soft-locked
      return { ok: true, warning: res.description || 'Cannot query channel membership' };
    }
    const status = String(res.result.status || '').toLowerCase();
    const joined = ['member', 'administrator', 'creator', 'restricted'].includes(status);
    return { ok: joined, status };
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
        pendingCnt > 0 ? btnOk(`🔐 OTP Queue (${pendingCnt})`, 'menu:otp') : btnNav(`🔐 OTP Queue (${pendingCnt})`, 'menu:otp'),
      ],
      [
        btnNav(`📦 Accounts (${accCnt})`, 'menu:accounts'),
        btnNav(`🌐 Proxies (${proxyCnt})`, 'menu:proxies'),
      ],
      [
        btnNav('⚙️ All Settings', 'menu:settings'),
        btnNav('🍪 Cookies', 'menu:cookie'),
      ],
      [
        btnOk('🔍 FB Checker', 'menu:normalize'),
        btnNav('🩺 Diagnose', 'menu:diagnose'),
      ],
      [
        btnNav('📜 Debug Logs', 'menu:logs'),
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
    const pwBadge = cfg.password ? `🟢 Set (${cfg.password.length}c)` : `🔴 NOT SET`;
    const runnerBadge = run?.running
      ? `🟢 RUNNING (${run.completed}/${run.total})`
      : `⚪ IDLE`;
    const quotaBar = renderProgressBar(user.usedToday, user.dailyLimit, 8);
    const [countryName] = getCountryInfo(cfg.cc);
    const engineLabel = (cfg.engine_mode || 'hybrid').toUpperCase();
    const pxModeLabel = (cfg.proxy_mode || 'rotate').toUpperCase();
    const brand = st.brandName || DEFAULT_BRAND_NAME;

    return [
      `💎 <b>${escapeHtml(brand)} PRO • CONTROL HUB</b>`,
      DIVIDER,
      `👤 <b>Profile:</b> ${escapeHtml(user.firstName)} (<code>${escapeHtml(user.id)}</code>)`,
      `🛡 <b>Tier:</b> ${isUserAdmin(user, st) ? '👑 ADMIN' : '✅ APPROVED'}  •  🏷 <b>Brand:</b> <code>${escapeHtml(brand)}</code>`,
      `🎯 <b>Daily Quota:</b> <code>${user.usedToday}/${user.dailyLimit}</code> [<code>${quotaBar}</code>]`,
      ``,
      `⚙️ <b>Engine Configuration</b>`,
      `├ 🌍 Country: <code>+${escapeHtml(cfg.cc)}</code> (${escapeHtml(countryName)})  •  🔑 Pass: ${pwBadge}`,
      `├ 🚀 Engine: <code>${escapeHtml(engineLabel)}</code>  •  🔍 GQL Check: ${cfg.precheck_gql !== false ? '🟢 ON' : '🔴 OFF'}`,
      `├ ⏱ Delay: <code>${cfg.delay}s</code>  •  🔁 Retries: <code>${cfg.retries}</code>  •  🎲 Fresh ID: ${cfg.fresh_id ? '🟢' : '🔴'}`,
      `└ 🌐 Proxies: <code>${proxyCnt}</code> (<code>${escapeHtml(pxModeLabel)}</code>)  •  🛡 Strict: ${cfg.strict_proxy !== false ? '🟢 ON' : '🔴 OFF'}`,
      ``,
      `📊 <b>Vault & Live Status</b>`,
      `├ ✅ Ready: <code>${readyCnt}</code>  •  🔐 OTP: <code>${pendingCnt}</code>  •  ✔️ Done: <code>${doneCnt}</code>`,
      `└ ⚡ Runner: <b>${runnerBadge}</b>`,
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
      `⚙️ <b>Profile:</b> Retries <code>${cfg.retries}</code> • Delay <code>${cfg.delay}s</code> • Proxy <code>${escapeHtml((cfg.proxy_mode || 'rotate').toUpperCase())}</code>`,
      pwWarn,
      ``,
      `<blockquote>📥 Paste phone numbers below (one per line) <b>OR</b> upload a <code>.txt</code> / <code>.csv</code> file.\n💡 Quick commands: <code>/run 255771234567</code> • <code>/check 255771234567</code></blockquote>`,
    ].filter(Boolean).join('\n');
    const kb = {
      inline_keyboard: [
        ...(!cfg.password || cfg.password.length < 6 ? [[btnOk('🔑 Set Password First', 'set:pw')]] : []),
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
          [btnOk('➕ Add Manual Session', 'otp:manual')],
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
      const badge = item.status === 'CHECKPOINT' ? '🛡' : '📩';
      lines.push(`${idx + 1}. ${badge} <code>+${escapeHtml(item.phone)}</code> — <b>${escapeHtml(item.status)}</b> (${escapeHtml(item.name)})`);
      rows.push([
        btnOk(`🔑 Enter OTP (+${item.phone.slice(-5)})`, `otp:enter:${item.phone}`),
        btnNav(`🔎 Check Login`, `otp:check:${item.phone}`),
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
      btnOk('➕ Manual Add', 'otp:manual'),
      btnBad('🧹 Clear Queue', 'otp:clearall'),
    ]);
    rows.push([
      btnOk('🔄 Refresh OTPs', 'menu:otp'),
      btnNav('⬅️ Main Menu', 'menu:home'),
    ]);

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
    const txt = [
      `⚙️ <b>ENGINE SETTINGS (15/15)</b>`,
      DIVIDER,
      `<b>Identity & Routing</b>`,
      `├ 🌍 Fallback CC: <code>+${escapeHtml(cfg.cc)}</code> (${escapeHtml(countryName)})`,
      `├ 🔑 Password: ${cfg.password ? `<code>${escapeHtml(cfg.password)}</code>` : '🔴 <b>NOT SET</b>'}`,
      `├ 🌐 Default Proxy: <code>${cfg.proxy ? escapeHtml(cfg.proxy) : 'none (direct/pool)'}</code>`,
      `└ 🔀 Proxy Routing: <code>${escapeHtml(pxModeDesc)}</code>`,
      ``,
      `<b>Signup Engine & Timing</b>`,
      `├ 🚀 Engine Mode: <code>${escapeHtml(engineDesc)}</code>`,
      `├ ⏱ Delay: <code>${cfg.delay}s</code>  •  📦 Batch Break: <code>${cfg.batch}</code>`,
      `└ 🔁 Retries: <code>${cfg.retries}</code>  •  ⌛ Timeout: <code>${cfg.timeout}s</code>`,
      ``,
      `<b>Pre-Check & Auto-Proxy Guard</b>`,
      `├ 🔍 GQL Pre-Check: ${cfg.precheck_gql !== false ? '🟢 ON' : '🔴 OFF'}  •  🛡 Strict Proxy: ${cfg.strict_proxy !== false ? '🟢 ON' : '🔴 OFF'}`,
      `├ ♻️ Auto IP Refresh: ${cfg.auto_proxy_refresh !== false ? '🟢 ON' : '🔴 OFF'}  •  🌍 Auto Country PX: ${cfg.auto_proxy_country !== false ? '🟢 ON' : '🔴 OFF'}`,
      `├ ⏭ Skip Probe: ${cfg.skip_probe ? '🟢 ON' : '🔴 OFF'}  •  🎲 Fresh ID: ${cfg.fresh_id ? '🟢 ON' : '🔴 OFF'}`,
      `└ 🔄 Resume Mode: ${cfg.resume_mode !== false ? '🟢 ON' : '🔴 OFF'} (<code>${doneCnt}</code> done)`,
      ``,
      `<i>Tap any colored control below to configure:</i>`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
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
          btnNav(`⏱ Delay (${cfg.delay}s)`, 'set:delay'),
          btnNav(`📦 Batch (${cfg.batch})`, 'set:batch'),
        ],
        [
          btnNav(`🔁 Retries (${cfg.retries})`, 'set:retries'),
          btnNav(`⌛ Timeout (${cfg.timeout}s)`, 'set:timeout'),
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
        [btnNav('⬅️ Back to Menu', 'menu:home')],
      ],
    };
    if (editMsgId) await editMessage(chatId, editMsgId, txt, kb);
    else await sendMessage(chatId, txt, kb);
  }

  async function renderCookiesMenu(chatId, uid, editMsgId) {
    const raw = readUserCookies(uid);
    const preview = raw.length > 900 ? raw.slice(0, 900) + '...' : raw;
    const txt = [
      `🍪 <b>BASE COOKIES MANAGER</b>`,
      DIVIDER,
      `Current <code>base_cookies.txt</code>:`,
      `<blockquote><code>${escapeHtml(preview)}</code></blockquote>`,
      ``,
      `💡 Regenerate fresh random <code>sb + datr</code> tokens or paste custom Facebook cookies.`,
    ].join('\n');
    const kb = {
      inline_keyboard: [
        [
          btnOk('🎲 Regen Fresh (sb+datr)', 'cookies:regen'),
          btnNav('✏️ Paste Custom Cookies', 'cookies:edit'),
        ],
        [btnNav('⬅️ Back to Menu', 'menu:home')],
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
          btnNav('📊 Export CSV', 'accounts:csv'),
        ],
        [
          btnNav('📋 Login Sheet CSV', 'accounts:loginsheet'),
          btnNav('📝 Full Log (.txt)', 'accounts:fulltxt'),
        ],
        [
          btnNav('🔍 Latest Cookie View', 'accounts:lastcookie'),
          btnBad('🧹 Clear History', 'accounts:clearconfirm'),
        ],
        [btnNav('⬅️ Back to Menu', 'menu:home')],
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
      `♻️ <b>Auto IP Refresh (Per ID):</b> ${autoRefresh ? '🟢 ON' : '🔴 OFF'}  •  🌍 <b>Auto Country Switch:</b> ${autoCountry ? '🟢 ON' : '🔴 OFF'}`,
      ``,
      preview || '<i>No custom proxies added yet.</i>',
      list.length > 10 ? `<i>... +${list.length - 10} more proxies</i>` : '',
      globalCnt > 0 ? `\n<blockquote>🌍 Global fallback pool active: <b>${globalCnt}</b> proxies</blockquote>` : '',
      `\n<blockquote>💡 When ON, each ID automatically switches proxy <code>-country-XX</code> (e.g. TZ/BD/KE) &amp; refreshes <code>-ssid-</code> for a brand-new IP.</blockquote>`,
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
          btnNav('🧪 Test All (Live FB)', 'proxies:test'),
          btnOk('⚡ Sort by Speed', 'proxies:sort'),
        ],
        [
          btnBad('🧹 Prune Dead', 'proxies:prunedead'),
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

      for (let i = 0; i < finalQueue.length; i++) {
        if (runState.abortRequested) break;
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

        if (progressMsgId) {
          await editMessage(
            chatId,
            progressMsgId,
            [
              `⚡ <b>BATCH PROGRESS</b>`,
              DIVIDER,
              `⏳ <b>Working on:</b> <code>+${escapeHtml(phone)}</code> [${escapeHtml(numCName)} • <b>${escapeHtml(numIso)}</b>] (<code>${i + 1}/${finalQueue.length}</code>)`,
              `🚀 <b>Engine:</b> <code>${escapeHtml((cfg.engine_mode || 'hybrid').toUpperCase())}</code>  •  🔍 <b>GQL:</b> ${cfg.precheck_gql !== false ? 'ON' : 'OFF'}  •  ♻️ <b>Auto-IP:</b> ${cfg.auto_proxy_refresh !== false ? 'ON' : 'OFF'}`,
              `🌐 <b>Route:</b> ${routeDesc} • 🛡 Strict: ${cfg.strict_proxy !== false ? 'ON' : 'OFF'}`,
              `📊 <b>Progress:</b> <code>${renderProgressBar(runState.completed, finalQueue.length)}</code> (<code>${runState.completed}/${finalQueue.length}</code>)`,
              `✅ Ready: <code>${runState.okCount}</code>  •  🔐 OTP: <code>${runState.pendingCount}</code>  •  ❌ Fail: <code>${runState.failCount}</code>`,
            ].join('\n'),
            { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] }
          );
        }

        const res = await runNodeAttempt(phone, cfg.password, cfg, px, {
          baseCookiesRaw: userBaseCookie,
          shouldAbort: () => runState.abortRequested,
          proxiesPool: activePool,
          badProxies,
          onDebug: (msg) => appendUserLog(user.id, msg),
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
              `✅ <b>ACCOUNT READY</b>`,
              DIVIDER,
              `👤 <b>Profile:</b> ${escapeHtml(res.name)}`,
              `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
              `🔑 <b>UID|Pass:</b> <code>${escapeHtml(res.uid)}|${escapeHtml(cfg.password)}</code>`,
              `🧬 <b>Pringer:</b> <code>${escapeHtml(res.printer || '-')}</code>  •  ⚙️ <code>${escapeHtml(res.engine || 'limited')}</code>`,
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
          runState.pendingCount += 1;
          if (res.pendingPayload) pushUserPending(user.id, res.pendingPayload);
          storeUserAccount(user.id, {
            name: res.name,
            phone,
            pass: cfg.password,
            status: res.status,
            confirmed: false,
            printer: res.printer,
            engine: res.engine,
            cookies: res.cookies,
          });
          await sendMessage(
            chatId,
            [
              `🔔 <b>OTP / CHECKPOINT REQUIRED</b>`,
              DIVIDER,
              `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
              `📌 <b>State:</b> <b>${escapeHtml(res.status)}</b>  •  ⚙️ <code>${escapeHtml(res.engine || 'limited')}</code>`,
              `👤 <b>Profile:</b> ${escapeHtml(res.name)}`,
              `🔑 <b>Pass:</b> <code>${escapeHtml(cfg.password)}</code>`,
            ].join('\n'),
            {
              inline_keyboard: [
                [
                  btnOk(`🔑 Enter OTP (+${phone.slice(-6)})`, `otp:enter:${phone}`),
                  btnNav(`🔎 Check Login`, `otp:check:${phone}`),
                ],
                [
                  btnNav('🔐 OTP Queue', 'menu:otp'),
                  btnBad('🗑 Delete', `otp:del:${phone}`),
                ],
              ],
            }
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
          const reason = `${res.status}: ${res.err || 'unknown'}`;
          failureDetails.push(`+${phone} → ${reason}`);
          if (finalQueue.length <= 5) {
            await sendMessage(
              chatId,
              [
                `❌ <b>ATTEMPT FAILED [${escapeHtml(res.status)}]</b>`,
                DIVIDER,
                `📱 <b>Number:</b> <code>+${escapeHtml(phone)}</code>`,
                `<blockquote>💬 ${escapeHtml(res.err || 'unknown')}</blockquote>`,
              ].join('\n')
            );
          }
        }

        if (progressMsgId) {
          await editMessage(
            chatId,
            progressMsgId,
            [
              `⚡ <b>BATCH PROGRESS</b>`,
              DIVIDER,
              `📱 <b>Current:</b> <code>+${escapeHtml(phone)}</code>`,
              `📊 <b>Progress:</b> <code>${renderProgressBar(runState.completed, runState.total)}</code> (<code>${runState.completed}/${runState.total}</code>)`,
              `✅ Ready: <code>${runState.okCount}</code>  •  🔐 OTP: <code>${runState.pendingCount}</code>  •  ❌ Fail: <code>${runState.failCount}</code>`,
            ].join('\n'),
            { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] }
          );
        }

        if (i + 1 < finalQueue.length && !runState.abortRequested) {
          let delaySec = Number(cfg.delay || 45);
          const isBatchBreak = cfg.batch > 0 && (i + 1) % cfg.batch === 0;
          if (isBatchBreak) delaySec *= 4;
          if (progressMsgId && delaySec > 0) {
            await editMessage(
              chatId,
              progressMsgId,
              [
                `⚡ <b>BATCH PROGRESS</b>`,
                DIVIDER,
                `📊 <b>Processed:</b> <code>${renderProgressBar(runState.completed, finalQueue.length)}</code> (<code>${runState.completed}/${finalQueue.length}</code>)`,
                `✅ Ready: <code>${runState.okCount}</code>  •  🔐 OTP: <code>${runState.pendingCount}</code>  •  ❌ Fail: <code>${runState.failCount}</code>`,
                isBatchBreak
                  ? `⏸ <b>Batch Break Cooldown:</b> waiting <code>${delaySec}s</code> (batch=${cfg.batch})...`
                  : `⏳ <b>Cooling down:</b> waiting <code>${delaySec}s</code> before next number...`,
              ].join('\n'),
              { inline_keyboard: [[btnBad('🛑 Stop Run', 'menu:stop')]] }
            );
          }
          const endAt = Date.now() + delaySec * 1000;
          while (Date.now() < endAt && !runState.abortRequested) {
            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }

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

    const result = await performOtpConfirm(item, code.trim(), cfg, userCookie);
    if (result.status === 'OK') {
      promptSessions.delete(uid);
      storeUserAccount(uid, {
        name: item.name,
        phone: item.phone,
        pass: item.pass || cfg.password || '',
        uid: result.uid,
        status: 'OK',
        confirmed: true,
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
      const cstr = Object.entries(result.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      await sendMessage(
        chatId,
        [
          `✅ <b>OTP VERIFIED SUCCESSFULLY!</b>`,
          DIVIDER,
          `📱 <b>Number:</b> <code>+${escapeHtml(item.phone)}</code>`,
          `🆔 <b>UID:</b> <code>${escapeHtml(result.uid)}</code>`,
          `🔑 <b>Pass:</b> <code>${escapeHtml(item.pass || cfg.password || '')}</code>`,
          `📋 <b>UID|Pass:</b> <code>${escapeHtml(result.uid)}|${escapeHtml(item.pass || cfg.password || '')}</code>`,
          ``,
          `<blockquote>🍪 <code>${escapeHtml(cstr.slice(0, 320))}${cstr.length > 320 ? '...' : ''}</code></blockquote>`,
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
                  btnNav(`🔍 GQL Check (${Math.min(valid.length, 40)})`, 'norm:gqlcheck'),
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

  async function runGraphqlBatchCheck(chatId, uid, numbersInput) {
    const st = readSettings();
    const cfg = readUserConfig(uid);
    const userProxies = readUserProxies(uid);
    const proxyPool = userProxies.length > 0 ? userProxies : st.shareGlobalProxies ? readGlobalProxies() : [];
    const targetList = numbersInput.slice(0, 200);

    if (targetList.length === 0) {
      await sendMessage(chatId, '⚠️ No valid phone numbers to check.', {
        inline_keyboard: [[btnNav('⬅️ Main Menu', 'menu:home')]],
      });
      return;
    }

    const progRes = await sendMessage(
      chatId,
      `🔍 <b>GRAPHQL BATCH CHECKER &amp; SPLITTER</b>\n${DIVIDER}\n⏳ Probing <code>0/${targetList.length}</code> numbers using proxy rotation...`
    );
    const progMsgId = progRes.ok ? progRes.result?.message_id : null;

    const freeList = [];
    const takenList = [];
    const unknownList = [];
    const badProxies = new Set();

    for (let i = 0; i < targetList.length; i++) {
      const num = targetList[i];
      const numDet = detectCountryFromNumber(`+${num}`, cfg.cc);
      const effCc = (cfg.auto_proxy_country !== false && numDet?.cc) ? numDet.cc : cfg.cc;
      const effIso = (cfg.auto_proxy_country !== false && numDet?.iso && numDet.iso !== '??') ? numDet.iso : getCountryInfo(effCc)[1];
      const rawPx =
        proxyPool.length > 0
          ? selectSmartProxy(proxyPool, i, badProxies, cfg.proxy_mode || 'rotate', cfg.proxy || null)
          : cfg.proxy || null;
      const adaptedPx = adaptProxyForSession(rawPx, {
        iso: effIso,
        autoCountry: cfg.auto_proxy_country !== false,
        refreshSession: cfg.auto_proxy_refresh !== false,
      });
      const px = adaptedPx.url;
      let res = { status: 'unknown', nameHint: '', reason: '' };
      try {
        res = await checkNumberGraphql(`+${num}`, {
          cc: effCc,
          proxy: px,
          strictProxy: cfg.strict_proxy !== false,
          timeoutMs: 18000,
        });
      } catch (err) {
        if (err && err.isProxyError && rawPx) badProxies.add(proxyHealthKey(rawPx));
        res = { status: 'unknown', nameHint: '', reason: err instanceof Error ? err.message : 'err' };
      }

      if (res.status === 'free') freeList.push(num);
      else if (res.status === 'taken') takenList.push({ num, hint: res.nameHint || '' });
      else unknownList.push({ num, reason: res.reason || 'unknown' });

      if (progMsgId && ((i + 1) % 5 === 0 || i + 1 === targetList.length)) {
        await editMessage(
          chatId,
          progMsgId,
          [
            `🔍 <b>GRAPHQL BATCH CHECKER &amp; SPLITTER</b>`,
            DIVIDER,
            `📊 <code>${renderProgressBar(i + 1, targetList.length)}</code> (<code>${i + 1}/${targetList.length}</code>)`,
            `🟢 Fresh (No Acc): <code>${freeList.length}</code>  •  🔴 Taken (Registered): <code>${takenList.length}</code>  •  🟡 Unknown: <code>${unknownList.length}</code>`,
          ].join('\n')
        );
      }
    }

    normalizedFreeCache.set(uid, freeList);
    normalizedTakenCache.set(uid, takenList.map((t) => t.num));

    const lines = [
      `📊 <b>GRAPHQL CHECK &amp; SPLIT COMPLETE (${targetList.length} checked)</b>`,
      DIVIDER,
      `🟢 <b>Fresh / Available:</b> <code>${freeList.length}</code> numbers (No FB Account)`,
      `🔴 <b>Taken / Registered:</b> <code>${takenList.length}</code> numbers (Existing FB Account)`,
      `🟡 <b>Unknown / Rate Limited:</b> <code>${unknownList.length}</code> numbers`,
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

    const kb = {
      inline_keyboard: [
        ...(freeList.length > 0 ? [[btnOk(`▶️ Run Fresh Only (${freeList.length})`, 'norm:run_free')]] : []),
        [
          ...(freeList.length > 0 ? [btnOk('📥 Fresh .txt', 'gql:dl_free')] : []),
          ...(takenList.length > 0 ? [btnBad('📥 Taken .txt', 'gql:dl_taken')] : []),
        ],
        [
          btnNav('🔢 Normalize More', 'menu:normalize'),
          btnNav('⬅️ Main Menu', 'menu:home'),
        ],
      ],
    };
    if (progMsgId) await editMessage(chatId, progMsgId, lines.join('\n'), kb);
    else await sendMessage(chatId, lines.join('\n'), kb);
  }

  async function runAndSendDiagnose(chatId, uid) {
    const cfg = readUserConfig(uid);
    const userCookies = readUserCookies(uid);
    const userProxies = readUserProxies(uid);
    const px = cfg.proxy || userProxies[0] || null;

    await sendMessage(chatId, `🩺 <i>Running live Limited FB, GraphQL & proxy diagnostics...</i>`);
    const d = await runDiagnoseFor(cfg, userCookies, px);
    const rawTrace = d.trace.slice(-8).join('\n') || '-';
    const traceStr = rawTrace.length > 1800 ? rawTrace.slice(-1800) : rawTrace;
    const curlCheck = await checkCurlAvailable();
    await sendMessage(
      chatId,
      [
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
      ].join('\n'),
      {
        inline_keyboard: [
          [
            btnOk('🔄 Re-run Diagnose', 'menu:diagnose'),
            btnNav('⬅️ Main Menu', 'menu:home'),
          ],
        ],
      }
    );
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
      `├ /run &lt;numbers&gt; — Quick start batch run`,
      `├ /check &lt;numbers&gt; — Check FREE / TAKEN via GraphQL`,
      `├ /otp — Open OTP & Checkpoint queue`,
      `├ /accounts — Open accounts vault`,
      `├ /proxies — Manage, test & sort proxy pool`,
      `├ /settings — View & edit all 13 engine settings`,
      `└ /cookies — Manage base cookies`,
      ``,
      `<b>Diagnostics & Utilities</b>`,
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
          `🔍 <b>GRAPHQL FREE/TAKEN CHECKER</b>\n${DIVIDER}\nPaste phone numbers (up to 40) or upload a <code>.txt</code> file to check registration status via Facebook GraphQL (CC: <code>+${escapeHtml(cfg.cc)}</code>):`,
          { inline_keyboard: [[btnBad('❌ Cancel', 'prompt:cancel')]] }
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
      if ((msg.document.file_size || 0) > 1024 * 1024) {
        await sendMessage(chatId, '❌ File too large (max 1 MB).', {
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
        const resp = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
        const rawDoc = await resp.text();
        const session = promptSessions.get(uid);
        promptSessions.delete(uid);
        if (session?.kind === 'awaiting_normalize') {
          await handleNormalizeText(chatId, uid, rawDoc);
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
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
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

    if (data === 'menu:normalize') {
      promptSessions.set(uid, { kind: 'awaiting_normalize' });
      await sendMessage(
        chatId,
        [
          `🔍 <b>FB CHECKER &amp; NUMBER SPLITTER</b>`,
          DIVIDER,
          `Paste phone numbers (or upload a <code>.txt</code> file) to instantly check and split into <b>Fresh</b> vs <b>Taken</b> numbers (Fallback CC: <code>+${escapeHtml(readUserConfig(uid).cc)}</code>):`,
        ].join('\n'),
        { inline_keyboard: [[btnBad('❌ Cancel', 'prompt:cancel')]] }
      );
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
      const flds = Object.keys(item.fields || {}).join(', ') || 'none';
      const ccnt = Object.keys(item.cookies || {}).length;
      await sendMessage(
        chatId,
        [
          `🔍 <b>OTP SESSION DETAILS</b>`,
          DIVIDER,
          `📱 <b>Phone:</b> <code>+${escapeHtml(item.phone)}</code> (${escapeHtml(item.status)})`,
          `👤 <b>Profile:</b> ${escapeHtml(item.name)}  •  🔑 <b>Pass:</b> <code>${escapeHtml(item.pass || '-')}</code>`,
          `🌐 <b>Proxy:</b> <code>${escapeHtml(item.proxy || 'direct')}</code>`,
          `🔗 <b>Confirm URL:</b> <code>${escapeHtml(item.confirm_url || '-')}</code>`,
          `⚡ <b>Action:</b> <code>${escapeHtml(item.action || '-')}</code>`,
          `📝 <b>Fields:</b> <code>${escapeHtml(flds)}</code>  •  🍪 <b>Cookies:</b> <code>${ccnt}</code>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              btnOk(`🔑 Enter OTP`, `otp:enter:${item.phone}`),
              btnNav(`🔎 Check Login`, `otp:check:${item.phone}`),
            ],
            [
              btnBad('🗑 Delete', `otp:del:${item.phone}`),
              btnNav('⬅️ OTP Queue', 'menu:otp'),
            ],
          ],
        }
      );
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
      await sendMessage(chatId, `🧪 Testing <code>${batchSlice.length}</code> proxies against Limited Facebook & Exit IP...`);
      const results = [];
      for (let i = 0; i < batchSlice.length; i += 5) {
        const chunk = batchSlice.slice(i, i + 5);
        const chunkRes = await Promise.all(chunk.map((p) => testProxyTcp(p, true)));
        results.push(...chunkRes);
      }
      const liveCnt = results.filter((r) => r.ok).length;
      const lines = results.map((r, i) => {
        const geoParts = [r.geoInfo?.iso, r.geoInfo?.city].filter(Boolean).join('/');
        const meta = r.ok
          ? `${r.latencyMs}ms${r.exitIp ? ` • IP ${escapeHtml(r.exitIp)}` : ''}${geoParts ? ` (${escapeHtml(geoParts)})` : ''}${r.hasLsd ? ' • LSD OK' : ''}`
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
      await sendMessage(chatId, `⚡ Benchmarking <code>${list.length}</code> proxies by Limited Facebook latency...`);
      const results = [];
      for (let i = 0; i < list.length; i += 5) {
        const chunk = list.slice(i, i + 5);
        const chunkRes = await Promise.all(chunk.map((p) => testProxyTcp(p, true)));
        results.push(...chunkRes);
      }
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
      await sendMessage(chatId, `🧹 Probing <code>${list.length}</code> proxies to remove dead ones...`);
      const results = [];
      for (let i = 0; i < list.length; i += 5) {
        const chunk = list.slice(i, i + 5);
        const chunkRes = await Promise.all(chunk.map((p) => testProxyTcp(p, false)));
        results.push(...chunkRes);
      }
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
      await sendMessage(chatId, `♻️ <i>Rotating proxy session IP &amp; probing live Facebook...</i>`);
      const probe = probeTarget ? await testProxyTcp(probeTarget, true) : { ok: false, error: 'no proxy' };
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
          `📊 <b>Live FB Probe:</b> ${probe.ok ? '✅ LIVE (LSD Ready)' : `❌ ${escapeHtml(probe.error || 'failed')}`}`,
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
      await sendMessage(chatId, `⏱ <b>SET DELAY</b>\nEnter delay in seconds between attempts (e.g. <code>45</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
      });
      return;
    }

    if (data === 'set:batch') {
      promptSessions.set(uid, { kind: 'awaiting_batch' });
      await sendMessage(chatId, `📦 <b>SET BATCH BREAK SIZE</b>\nEnter batch break size (<code>0</code> = off, default <code>5</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
      });
      return;
    }

    if (data === 'set:retries') {
      promptSessions.set(uid, { kind: 'awaiting_retries' });
      await sendMessage(chatId, `🔁 <b>SET RETRIES</b>\nEnter number retries per account (<code>2–12</code>, default <code>6</code>):`, {
        inline_keyboard: [[btnBad('❌ Cancel', 'menu:settings')]],
      });
      return;
    }

    if (data === 'set:timeout') {
      promptSessions.set(uid, { kind: 'awaiting_timeout' });
      await sendMessage(chatId, `⌛ <b>SET TIMEOUT</b>\nEnter HTTP request timeout in seconds (<code>5–120</code>, default <code>35</code>):`, {
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

    if (data === 'cookies:edit') {
      promptSessions.set(uid, { kind: 'awaiting_cookies' });
      await sendMessage(
        chatId,
        `🍪 <b>PASTE CUSTOM COOKIES</b>\nPaste your custom Facebook cookie header string below (e.g. <code>datr=...; sb=...; wd=360x800</code>):`,
        { inline_keyboard: [[btnBad('❌ Cancel', 'menu:cookie')]] }
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
        await sendMessage(chatId, `🧪 Testing <code>${batchSlice.length}</code> global proxies against Limited Facebook & Exit IP...`);
        const results = [];
        for (let i = 0; i < batchSlice.length; i += 5) {
          const chunk = batchSlice.slice(i, i + 5);
          const chunkRes = await Promise.all(chunk.map((p) => testProxyTcp(p, true)));
          results.push(...chunkRes);
        }
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
        await sendMessage(chatId, `⚡ Benchmarking <code>${list.length}</code> global proxies...`);
        const results = [];
        for (let i = 0; i < list.length; i += 5) {
          const chunk = list.slice(i, i + 5);
          const chunkRes = await Promise.all(chunk.map((p) => testProxyTcp(p, true)));
          results.push(...chunkRes);
        }
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
        const results = [];
        for (let i = 0; i < list.length; i += 5) {
          const chunk = list.slice(i, i + 5);
          const chunkRes = await Promise.all(chunk.map((p) => testProxyTcp(p, false)));
          results.push(...chunkRes);
        }
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
        const waitMs = lastError.toLowerCase().includes('conflict') ? 5000 : 3000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      connected = true;
      lastError = '';
      const updates = Array.isArray(res.result) ? res.result : [];
      for (const upd of updates) {
        offset = upd.update_id + 1;
        try {
          if (upd.message) await processMessage(upd.message);
          else if (upd.callback_query) await processCallback(upd.callback_query);
        } catch (err) {
          pushBotLog(`Update error: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
    }
  }

  async function start() {
    const me = await tgCall('getMe');
    if (!me.ok || !me.result) {
      throw new Error(me.description || 'Failed to verify bot token via getMe');
    }
    botInfo = { id: me.result.id, username: me.result.username || '', firstName: me.result.first_name || 'Bot' };
    await tgCall('setMyCommands', {
      commands: [
        { command: 'start', description: 'Open main control dashboard' },
        { command: 'run', description: 'Start a batch account run' },
        { command: 'check', description: 'Check numbers FREE/TAKEN via GraphQL' },
        { command: 'otp', description: 'Open OTP & checkpoint queue' },
        { command: 'accounts', description: 'View & export ready accounts' },
        { command: 'proxies', description: 'Manage, test & sort proxy pool' },
        { command: 'settings', description: 'Configure engine & proxy settings' },
        { command: 'cookies', description: 'Manage base cookies' },
        { command: 'logs', description: 'View recent debug logs' },
        { command: 'diag', description: 'Run live Limited FB & proxy diagnostics' },
        { command: 'help', description: 'Command & workflow guide' },
        { command: 'cancel', description: 'Cancel active prompt input' },
      ],
    });
    running = true;
    connected = true;
    lastError = '';
    startedAt = Date.now();
    pushBotLog(`Standalone bot online as @${botInfo.username} (Admin ID: ${readSettings().adminId}, Data: ${DATA_ROOT})`);
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
