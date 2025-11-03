import { stripDiacritics } from './textNormalize.js';

const PRIORITY_WEIGHT = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const weight = c => PRIORITY_WEIGHT[c] || 2;

// نهرب أي محارف خاصة في الـ RegExp
const escapeRegExp = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** يبني نمط آمن: حدود تقريبية = بداية السطر أو مسافة/ترقيم، ونفس الشي في النهاية */
const kwToRegex = (kwRaw) => {
  const core = escapeRegExp(kwRaw.trim()).replace(/\s+/g, '\\s+');
  // ملاحظة: نستخدم \s و \p{P} (كل علامات الترقيم)، مع علم u
  // (?:^|[\s\p{P}])  +  (?=$|[\s\p{P}])
  return `(?:^|[\\s\\p{P}])${core}(?=$|[\\s\\p{P}])`;
};

export async function detectPriorityByKeywords(pool, descriptionRaw) {
  const normalized = stripDiacritics((descriptionRaw || '').toLowerCase());
  if (!normalized) return { priority: 'MEDIUM', matched: [] };

  const [rows] = await pool.query(
    `SELECT Keyword, PriorityCode, Category FROM priority_keywords`
  );
  if (!rows?.length) return { priority: 'MEDIUM', matched: [] };

  // حضري الريجيكسات مرة وحدة
  const compiled = rows
    .filter(r => r.Keyword && r.PriorityCode)
    .map(r => {
      const kw = stripDiacritics(r.Keyword.toLowerCase());
      return { ...r, re: new RegExp(kwToRegex(kw), 'u') };
    });

  const matched = [];
  for (const r of compiled) {
    if (r.re.test(normalized)) matched.push({ Keyword: r.Keyword, PriorityCode: r.PriorityCode, Category: r.Category });
  }

  if (!matched.length) return { priority: 'MEDIUM', matched: [] };

  matched.sort((a, b) => weight(b.PriorityCode) - weight(a.PriorityCode));
  return { priority: matched[0].PriorityCode, matched };
}

/**
 * يحصل على معلومات الأولوية (للعرض)
 * @param {string} priorityCode - كود الأولوية
 * @returns {Object} معلومات الأولوية
 */
export function getPriorityInfo(priorityCode) {
  const priorityMap = {
    'URGENT': { 
      name: 'عاجل', 
      color: '#DC2626', 
      bgColor: '#FEE2E2',
      description: 'يتطلب تدخل فوري'
    },
    'HIGH': { 
      name: 'عالي', 
      color: '#EA580C', 
      bgColor: '#FED7AA',
      description: 'أولوية عالية'
    },
    'MEDIUM': { 
      name: 'متوسط', 
      color: '#D97706', 
      bgColor: '#FEF3C7',
      description: 'أولوية متوسطة'
    },
    'LOW': { 
      name: 'منخفض', 
      color: '#059669', 
      bgColor: '#D1FAE5',
      description: 'أولوية منخفضة'
    }
  };

  return priorityMap[priorityCode] || priorityMap['MEDIUM'];
}
