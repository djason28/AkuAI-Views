/**
 * Message formatting utility for AkuAI chat
 * Converts plain text with markdown-like syntax to formatted HTML
 */

export function normalizeWhitespace(text) {
  if (!text) return '';

  let normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\t+/g, ' ');

  // First, add spaces where they're missing (like "webinarUIB" -> "webinar UIB")
  normalized = normalized.replace(/(\w)([A-Z][a-z]+)/g, '$1 $2');

  // Apply multiple passes to fix specific spacing issues
  for (let i = 0; i < 2; i++) {
    // Fix common broken words with direct replacements
    const wordReplacements = {
      'Cr ypto': 'Crypto',
      'C rypto': 'Crypto', 
      'You Tube': 'YouTube',
      'YouTube Liv e': 'YouTube Live',
      'D evelopment': 'Development',
      'C areer': 'Career',
      'Tech nology': 'Technology',
      'Persyara tan': 'Persyaratan',
      'pese rta': 'peserta',
      'untukumum': 'untuk umum',
      'lebihlanjut': 'lebih lanjut',
      'menghub ungi': 'menghubungi',
      'de ngan': 'dengan',
      'se perti': 'seperti',
      'meng gunakan': 'menggunakan',
      'Pembic ara': 'Pembicara',
      'Engi neer': 'Engineer',
      'Shope e': 'Shopee',
      'No vember': 'November',
      'Peneli ti': 'Peneliti',
      'Developmen t': 'Development',
      'Priorita s': 'Prioritas',
      'unt uk': 'untuk',
      'h ttps': 'https',
      'h ttp': 'http',
      '2 025': '2025',
      '1 6:00': '16:00',
      '1 5:00': '15:00',
      '1 4:00': '14:00',
      '1 9:00': '19:00',
      '2 0:00': '20:00',
      '2 1:00': '21:00',
      'ui b.ac.id': 'uib.ac.id',
      'Platfor m': 'Platform',
      'D epartemen': 'Departemen',
      'leb ih': 'lebih',
      'k ontak': 'kontak',
      'i nfo': 'info',
      'info@uib.a c.id': 'info@uib.ac.id',
      'untu k': 'untuk',
      'U IB': 'UIB',
      'Sertifi kasi': 'Sertifikasi',
      'B usiness': 'Business',
      'Lokas i': 'Lokasi',
      '500.00 0': '500.000',
      '750.00 0': '750.000',
      'marketin g': 'marketing',
      '2025-10 -18': '2025-10-18',
      'K omputer': 'Komputer',
      'it-certification @': 'it-certification@',
      'Sertifikas i': 'Sertifikasi',
      'Profes ional': 'Profesional',
      'Tang gal': 'Tanggal',
      'Wa ktu': 'Waktu',
      'L okasi': 'Lokasi',
      'akuntansi@uib. ac.id': 'akuntansi@uib.ac.id',
      'Bah asa': 'Bahasa',
      'Language Ce nter': 'Language Center',
      'l anguagecenter': 'languagecenter',
      'Manag ement': 'Management',
      '09:00-17:3 0': '09:00-17:30',
      'Se minar': 'Seminar',
      'management@uib.ac. id': 'management@uib.ac.id',
      'ht tps': 'https',
    };
    
    for (const [broken, fixed] of Object.entries(wordReplacements)) {
      normalized = normalized.replace(new RegExp(broken, 'g'), fixed);
    }

    // Fix broken numbers and time patterns with regex
    normalized = normalized.replace(/(\d)\s+(\d):(\d+)/g, '$1$2:$3');         // "1 6:00" -> "16:00"
    normalized = normalized.replace(/(\d)\s+(\d{3})/g, '$1$2');               // "2 025" -> "2025"
    normalized = normalized.replace(/(\d{4})-(\d{2})\s+-(\d+)/g, '$1-$2-$3'); // "2025-10 -18" -> "2025-10-18"
    normalized = normalized.replace(/(\d+)\.(\d+)\s+(\d+)/g, '$1.$2$3');      // "500.00 0" -> "500.000"
    normalized = normalized.replace(/(https?)\s*:\s*\/\/\s*(\w)/g, '$1://$2'); // "h ttps : // u" -> "https://u"
    normalized = normalized.replace(/(\w+)\s+\.\s*(\w+)\s*\.\s*(\w+)/g, '$1.$2.$3'); // "ui b.ac.id" -> "uib.ac.id"
    normalized = normalized.replace(/(\w+)\s*@\s*(\w+)\s*\.\s*(\w+)\s*\.\s*(\w+)/g, '$1@$2.$3.$4'); // "info@uib. ac.id" -> "info@uib.ac.id"
    normalized = normalized.replace(/\b([A-Z][a-z]{1,3})\s+([a-z]{2,})\b/g, '$1$2'); // "Sertifi kasi" -> "Sertifikasi"
    
    // Fix excessive spacing (3+ spaces only, preserve normal single spaces)
    normalized = normalized.replace(/(\w)\s{3,}(\w)/g, '$1 $2');
    
    // Collapse only multiple spaces (2+ become single)
    normalized = normalized.replace(/ {2,}/g, ' ');
  }

  return normalized
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Format a bot message with proper text styling, lists, and colors
 * @param {string} text - Raw text from the bot
 * @returns {string} - Formatted HTML string
 */
export function formatBotMessage(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const cleaned = normalizeWhitespace(text);

  // Normalize newlines and escape HTML
  let textEsc = cleaned.replace(/\r\n/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = textEsc.split('\n');
  const out = [];
  let inList = false;
  let listType = null; // 'ul' | 'ol'
  let listSubtype = null; // 'decimal' | 'lower-alpha' | 'upper-alpha'
  let items = [];

  function flushList() {
    if (!inList) return;
    if (listType === 'ul') {
      out.push(`<ul class="bullet-list">${items.map((it) => `<li>${it}</li>`).join('')}</ul>`);
    } else {
      const dtype = listSubtype || 'decimal';
      out.push(`<ol class="numbered-list" data-type="${dtype}">${items.map((it) => `<li>${it}</li>`).join('')}</ol>`);
    }
    inList = false; listType = null; listSubtype = null; items = [];
  }
  function pushP(s) {
    if (!s || !s.trim()) return;
    out.push(`<p class="paragraph">${s}</p>`);
  }

  for (let raw of lines) {
    const line = raw;
    const t = line.trim();
    if (t === '') { flushList(); continue; }

    // Headers
    let m;
    if ((m = t.match(/^###\s+(.+)$/))) { flushList(); out.push(`<h4 class="msg-header-3">${m[1]}</h4>`); continue; }
    if ((m = t.match(/^##\s+(.+)$/)))  { flushList(); out.push(`<h3 class="msg-header-2">${m[1]}</h3>`); continue; }
    if ((m = t.match(/^#\s+(.+)$/)))   { flushList(); out.push(`<h2 class="msg-header-1">${m[1]}</h2>`); continue; }

    // Lettered list: a. text or A) text
    if ((m = t.match(/^([a-zA-Z])[\.)]\s+(.+)$/))) {
      const letter = m[1];
      const content = m[2];
      const subtype = letter === letter.toUpperCase() ? 'upper-alpha' : 'lower-alpha';
      if (!inList || listType !== 'ol' || listSubtype !== subtype) { flushList(); inList = true; listType = 'ol'; listSubtype = subtype; items = []; }
      items.push(content);
      continue;
    }

    // Numbered list: 1. text or 1) text
    if ((m = t.match(/^(\d+)[\.)]\s+(.+)$/))) {
      const content = m[2];
      if (!inList || listType !== 'ol' || listSubtype !== 'decimal') { flushList(); inList = true; listType = 'ol'; listSubtype = 'decimal'; items = []; }
      items.push(content);
      continue;
    }

    // Bullet list: -, *, •
    if ((m = t.match(/^([•\-*])\s+(.+)$/))) {
      const content = m[2];
      if (!inList || listType !== 'ul') { flushList(); inList = true; listType = 'ul'; listSubtype = null; items = []; }
      items.push(content);
      continue;
    }

    // Normal paragraph line
    flushList();
    pushP(t);
  }
  flushList();

  let formatted = out.join('\n');

  // Inline formatting after structure is built
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="bold-text">$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, (match, t) => {
    if (match.includes('**')) return match;
    return `<em class="italic-text">${t}</em>`;
  });
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Highlights
  formatted = formatted.replace(/\[!IMPORTANT\](.*?)\[\/!IMPORTANT\]/gs, '<span class="highlight-red">$1</span>');
  formatted = formatted.replace(/\[!ERROR\](.*?)\[\/!ERROR\]/gs, '<span class="highlight-red">$1</span>');
  formatted = formatted.replace(/\[!WARNING\](.*?)\[\/!WARNING\]/gs, '<span class="highlight-yellow">$1</span>');
  formatted = formatted.replace(/\[!SUCCESS\](.*?)\[\/!SUCCESS\]/gs, '<span class="highlight-green">$1</span>');
  formatted = formatted.replace(/\[!TIP\](.*?)\[\/!TIP\]/gs, '<span class="highlight-green">$1</span>');
  formatted = formatted.replace(/\[!INFO\](.*?)\[\/!INFO\]/gs, '<span class="highlight-blue">$1</span>');
  formatted = formatted.replace(/\[!NOTE\](.*?)\[\/!NOTE\]/gs, '<span class="highlight-blue">$1</span>');

  return formatted;
}

/**
 * Format user messages (simpler formatting)
 * @param {string} text - Raw text from user
 * @returns {string} - Formatted HTML string
 */
export function formatUserMessage(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Simple escaping and line break handling for user messages
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return formatted;
}

/**
 * Format streaming bot message with simpler, real-time formatting
 * @param {string} text - Raw text from the bot (streaming)
 * @returns {string} - Formatted HTML string optimized for streaming
 */
export function formatStreamingBotMessage(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let formatted = normalizeWhitespace(text);

  // Escape HTML
  formatted = formatted
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Apply basic formatting that works well with streaming
  
  // Bold text - apply immediately as it appears
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="bold-text">$1</strong>');
  
  // Inline code - apply immediately
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Simple headers - only complete ones
  formatted = formatted.replace(/^###\s+(.+)$/gm, '<h4 class="msg-header-3">$1</h4>');
  formatted = formatted.replace(/^##\s+(.+)$/gm, '<h3 class="msg-header-2">$1</h3>');
  formatted = formatted.replace(/^#\s+(.+)$/gm, '<h2 class="msg-header-1">$1</h2>');

  // Simple lists for streaming - apply immediately for complete lines
  formatted = formatted.replace(/^(\d+[\.)]\s.+)$/gm, (match) => {
    const num = (match.match(/^(\d+)/) || [])[1] || '';
    const item = match.replace(/^\d+[\.)]\s*/, '').trim();
    return `<div class="list-item numbered"><span class="list-number">${num}.</span> ${item}</div>`;
  });

  // Lettered list (a., b.)
  formatted = formatted.replace(/^([a-zA-Z][\.)]\s.+)$/gm, (match) => {
    const letter = (match.match(/^([a-zA-Z])/) || [])[1] || '';
    const item = match.replace(/^[a-zA-Z][\.)]\s*/, '').trim();
    return `<div class="list-item numbered"><span class="list-number">${letter}.</span> ${item}</div>`;
  });

  formatted = formatted.replace(/^([•\-*]\s.+)$/gm, (match) => {
    const item = match.replace(/^[•\-*]\s*/, '').trim();
    return `<div class="list-item bullet"><span class="list-bullet">•</span> ${item}</div>`;
  });

  // Simple highlights - apply as they complete
  formatted = formatted.replace(/\[!INFO\](.*?)\[\/!INFO\]/gs, '<span class="highlight-blue">$1</span>');
  formatted = formatted.replace(/\[!SUCCESS\](.*?)\[\/!SUCCESS\]/gs, '<span class="highlight-green">$1</span>');
  formatted = formatted.replace(/\[!WARNING\](.*?)\[\/!WARNING\]/gs, '<span class="highlight-yellow">$1</span>');
  formatted = formatted.replace(/\[!TIP\](.*?)\[\/!TIP\]/gs, '<span class="highlight-green">$1</span>');
  formatted = formatted.replace(/\[!ERROR\](.*?)\[\/!ERROR\]/gs, '<span class="highlight-red">$1</span>');
  formatted = formatted.replace(/\[!IMPORTANT\](.*?)\[\/!IMPORTANT\]/gs, '<span class="highlight-red">$1</span>');
  formatted = formatted.replace(/\[!NOTE\](.*?)\[\/!NOTE\]/gs, '<span class="highlight-blue">$1</span>');

  // Basic line breaks
  formatted = formatted.replace(/\n\n+/g, '<br><br>');
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

/**
 * Check if the message indicates a completed session
 * @param {string} text - Message text to check
 * @returns {boolean} - True if this appears to be a completion message
 */
export function isSessionComplete(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const completionIndicators = [
    'selesai',
    'done',
    'complete',
    'finished',
    'berhasil',
    'sukses',
    'telah selesai',
    'sudah selesai',
    'task completed',
    'proses selesai'
  ];

  const lowerText = text.toLowerCase();
  return completionIndicators.some(indicator => lowerText.includes(indicator));
}