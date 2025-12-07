// pressganey.js - نظام Press Ganey
const API_BASE = localStorage.getItem('apiBase') || 'http://localhost:3001';
const token = localStorage.getItem('token') || localStorage.getItem('authToken') || '';

console.log('🔧 [PressGaney] تهيئة:', { API_BASE, hasToken: !!token });

// تسجيل ChartDataLabels plugin إذا كان متاحاً
if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

// دالة للحصول على hospitalId
function effectiveHospitalId() {
  try {
    // التحقق من وضع "جميع المستشفيات"
    const mode = localStorage.getItem('pressganey-mode');
    if (mode === 'ALL') {
      return null; // null يعني جميع المستشفيات
    }
    
    const u = JSON.parse(localStorage.getItem('userData') || '{}');
    const q = new URLSearchParams(location.search);
    const fromUrl = Number(q.get('hospitalId') || q.get('hid') || 0);
    const fromLS = Number(localStorage.getItem('selectedHospitalId') || localStorage.getItem('hospitalId') || 0);
    const fromUser = Number(u.HospitalID || u.hospitalId || u.hid || 0);
    
    const result = fromUrl || fromLS || fromUser || null;
    console.log('🔍 [PressGaney] effectiveHospitalId:', {
      mode,
      fromUrl,
      fromLS,
      fromUser,
      result,
      selectedHospitalId: localStorage.getItem('selectedHospitalId')
    });
    
    return result;
  } catch (err) {
    console.error('❌ [PressGaney] خطأ في effectiveHospitalId:', err);
    return null;
  }
}

// دالة authHeaders
const authHeaders = () => {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (token) h['Authorization'] = 'Bearer ' + token;
  const hid = effectiveHospitalId();
  if (hid) h['x-hospital-id'] = String(hid);
  return h;
};

// Toast
const toast = (msg, type = 'info') => {
  const el = document.getElementById('toast');
  const box = document.getElementById('toastInner');
  const cls = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-gray-800 text-white',
    warn: 'bg-amber-500 text-white'
  }[type] || 'bg-gray-800 text-white';
  box.className = 'rounded-xl shadow-lg px-4 py-3 text-sm ' + cls;
  box.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
};

// متغيرات عامة
let pressganeyData = [];
let chartInstance = null;
let lastImportedQuarter = null;
let lastImportedYear = null;

// قائمة جميع الرحلات الرسمية
const ALL_TRIPS = [
  "التنويم",
  "الطوارئ",
  "العيادات",
  "الرعاية المنزلية",
  "خدمات الأشعة",
  "مراكز القلب التنويم",
  "مراكز القلب العيادات",
  "مراكز الأورام التنويم",
  "مراكز الأورام العيادات",
  "فحص ما قبل الزواج",
  "خدمات الأسنان",
  "مراكز الكلى القطاع الحكومي",
  "مراكز الرعاية الأولية",
  "التأهيل الطبي العيادات",
  "جراحة اليوم الواحد",
  "بنوك الدم",
  "مراكز علاج السكري",
  "مراكز مكافحة التدخين",
  "مراكز الأسنان (المراكز الصحية)",
  "التوحد",
  "الوفيات",
  "عناية حديثي الولادة",
  "الإحالات",
  "الطب الاتصالي",
  "وصفتي",
  "العيادات الافتراضية"
];

// 🔥 Mapping شامل وكامل لجميع الرحلات الـ 26
// يغطي جميع المصطلحات المحتملة: إنجليزي، عربي، Domain، Name
const TRIP_NAME_MAPPING = {
  // 1. التنويم
  "inpatient": "التنويم",
  "in-patient": "التنويم",
  "in patient": "التنويم",
  "admission": "التنويم",
  "admissions": "التنويم",
  "التنويم": "التنويم",
  "Inpatient": "التنويم",
  "In-Patient": "التنويم",
  "In Patient": "التنويم",
  "Admission": "التنويم",
  "Admissions": "التنويم",
  
  // 2. الطوارئ
  "emergency": "الطوارئ",
  "er": "الطوارئ",
  "emergency department": "الطوارئ",
  "emergency room": "الطوارئ",
  "الطوارئ": "الطوارئ",
  "الخدمات الطارئة": "الطوارئ",
  "Emergency": "الطوارئ",
  "ER": "الطوارئ",
  "Emergency Department": "الطوارئ",
  "Emergency Room": "الطوارئ",
  
  // 3. العيادات
  "outpatient": "العيادات",
  "opd": "العيادات",
  "outpatient department": "العيادات",
  "clinic": "العيادات",
  "clinics": "العيادات",
  "العيادات": "العيادات",
  "Outpatient": "العيادات",
  "OPD": "العيادات",
  "Outpatient Department": "العيادات",
  "Clinic": "العيادات",
  "Clinics": "العيادات",
  
  // 4. الرعاية المنزلية
  "homecare": "الرعاية المنزلية",
  "home care": "الرعاية المنزلية",
  "homecare services": "الرعاية المنزلية",
  "home medicine": "الرعاية المنزلية",
  "home health": "الرعاية المنزلية",
  "الرعاية المنزلية": "الرعاية المنزلية",
  "HomeCare": "الرعاية المنزلية",
  "Home Care": "الرعاية المنزلية",
  "HomeCare Services": "الرعاية المنزلية",
  "Home Medicine": "الرعاية المنزلية",
  "Home Health": "الرعاية المنزلية",
  
  // 5. خدمات الأشعة
  "radiology": "خدمات الأشعة",
  "xray": "خدمات الأشعة",
  "x-ray": "خدمات الأشعة",
  "x ray": "خدمات الأشعة",
  "tests": "خدمات الأشعة",
  "imaging": "خدمات الأشعة",
  "radiology services": "خدمات الأشعة",
  "خدمات الأشعة": "خدمات الأشعة",
  "Radiology": "خدمات الأشعة",
  "XRay": "خدمات الأشعة",
  "X-Ray": "خدمات الأشعة",
  "X Ray": "خدمات الأشعة",
  "Tests": "خدمات الأشعة",
  "Imaging": "خدمات الأشعة",
  "Radiology Services": "خدمات الأشعة",
  
  // 6. مراكز القلب التنويم
  "cardiac inpatient": "مراكز القلب التنويم",
  "cardiac in-patient": "مراكز القلب التنويم",
  "cardiac in patient": "مراكز القلب التنويم",
  "heart inpatient": "مراكز القلب التنويم",
  "مراكز القلب التنويم": "مراكز القلب التنويم",
  "Cardiac Inpatient": "مراكز القلب التنويم",
  "Cardiac In-Patient": "مراكز القلب التنويم",
  "Cardiac In Patient": "مراكز القلب التنويم",
  "Heart Inpatient": "مراكز القلب التنويم",
  
  // 7. مراكز القلب العيادات
  "cardiac outpatient": "مراكز القلب العيادات",
  "cardiac opd": "مراكز القلب العيادات",
  "heart outpatient": "مراكز القلب العيادات",
  "heart clinic": "مراكز القلب العيادات",
  "مراكز القلب العيادات": "مراكز القلب العيادات",
  "Cardiac Outpatient": "مراكز القلب العيادات",
  "Cardiac OPD": "مراكز القلب العيادات",
  "Heart Outpatient": "مراكز القلب العيادات",
  "Heart Clinic": "مراكز القلب العيادات",
  
  // 8. مراكز الأورام التنويم
  "oncology inpatient": "مراكز الأورام التنويم",
  "oncology in-patient": "مراكز الأورام التنويم",
  "oncology in patient": "مراكز الأورام التنويم",
  "cancer inpatient": "مراكز الأورام التنويم",
  "مراكز الأورام التنويم": "مراكز الأورام التنويم",
  "Oncology Inpatient": "مراكز الأورام التنويم",
  "Oncology In-Patient": "مراكز الأورام التنويم",
  "Oncology In Patient": "مراكز الأورام التنويم",
  "Cancer Inpatient": "مراكز الأورام التنويم",
  
  // 9. مراكز الأورام العيادات
  "oncology outpatient": "مراكز الأورام العيادات",
  "oncology opd": "مراكز الأورام العيادات",
  "cancer outpatient": "مراكز الأورام العيادات",
  "cancer clinic": "مراكز الأورام العيادات",
  "مراكز الأورام العيادات": "مراكز الأورام العيادات",
  "Oncology Outpatient": "مراكز الأورام العيادات",
  "Oncology OPD": "مراكز الأورام العيادات",
  "Cancer Outpatient": "مراكز الأورام العيادات",
  "Cancer Clinic": "مراكز الأورام العيادات",
  
  // 10. فحص ما قبل الزواج
  "pre-marriage screening": "فحص ما قبل الزواج",
  "pre marriage screening": "فحص ما قبل الزواج",
  "pre marriage": "فحص ما قبل الزواج",
  "premarriage": "فحص ما قبل الزواج",
  "marriage screening": "فحص ما قبل الزواج",
  "فحص ما قبل الزواج": "فحص ما قبل الزواج",
  "Pre-Marriage Screening": "فحص ما قبل الزواج",
  "Pre Marriage Screening": "فحص ما قبل الزواج",
  "Pre Marriage": "فحص ما قبل الزواج",
  "Premarriage": "فحص ما قبل الزواج",
  "Marriage Screening": "فحص ما قبل الزواج",
  
  // 11. خدمات الأسنان
  "dental": "خدمات الأسنان",
  "dentistry": "خدمات الأسنان",
  "dental services": "خدمات الأسنان",
  "خدمات الأسنان": "خدمات الأسنان",
  "Dental": "خدمات الأسنان",
  "Dentistry": "خدمات الأسنان",
  "Dental Services": "خدمات الأسنان",
  
  // 12. مراكز الكلى القطاع الحكومي
  "kidney centers": "مراكز الكلى القطاع الحكومي",
  "kidney": "مراكز الكلى القطاع الحكومي",
  "kidney center": "مراكز الكلى القطاع الحكومي",
  "nephrology": "مراكز الكلى القطاع الحكومي",
  "dialysis": "مراكز الكلى القطاع الحكومي",
  "مراكز الكلى القطاع الحكومي": "مراكز الكلى القطاع الحكومي",
  "Kidney Centers": "مراكز الكلى القطاع الحكومي",
  "Kidney": "مراكز الكلى القطاع الحكومي",
  "Kidney Center": "مراكز الكلى القطاع الحكومي",
  "Nephrology": "مراكز الكلى القطاع الحكومي",
  "Dialysis": "مراكز الكلى القطاع الحكومي",
  
  // 13. مراكز الرعاية الأولية
  "primary care": "مراكز الرعاية الأولية",
  "phc": "مراكز الرعاية الأولية",
  "primary healthcare": "مراكز الرعاية الأولية",
  "primary health care": "مراكز الرعاية الأولية",
  "مراكز الرعاية الأولية": "مراكز الرعاية الأولية",
  "Primary Care": "مراكز الرعاية الأولية",
  "PHC": "مراكز الرعاية الأولية",
  "Primary Healthcare": "مراكز الرعاية الأولية",
  "Primary Health Care": "مراكز الرعاية الأولية",
  
  // 14. التأهيل الطبي العيادات
  "rehabilitation": "التأهيل الطبي العيادات",
  "physiotherapy": "التأهيل الطبي العيادات",
  "physical therapy": "التأهيل الطبي العيادات",
  "rehab": "التأهيل الطبي العيادات",
  "التأهيل الطبي العيادات": "التأهيل الطبي العيادات",
  "Rehabilitation": "التأهيل الطبي العيادات",
  "Physiotherapy": "التأهيل الطبي العيادات",
  "Physical Therapy": "التأهيل الطبي العيادات",
  "Rehab": "التأهيل الطبي العيادات",
  
  // 15. جراحة اليوم الواحد
  "day surgery": "جراحة اليوم الواحد",
  "day case": "جراحة اليوم الواحد",
  "same day surgery": "جراحة اليوم الواحد",
  "جراحة اليوم الواحد": "جراحة اليوم الواحد",
  "Day Surgery": "جراحة اليوم الواحد",
  "Day Case": "جراحة اليوم الواحد",
  "Same Day Surgery": "جراحة اليوم الواحد",
  
  // 16. بنوك الدم
  "blood bank": "بنوك الدم",
  "blood donation": "بنوك الدم",
  "donation": "بنوك الدم",
  "blood center": "بنوك الدم",
  "blood center": "بنوك الدم",
  "بنوك الدم": "بنوك الدم",
  "Blood Bank": "بنوك الدم",
  "Blood Donation": "بنوك الدم",
  "Donation": "بنوك الدم",
  "Blood Center": "بنوك الدم",
  
  // 17. مراكز علاج السكري
  "diabetes": "مراكز علاج السكري",
  "diabetes centers": "مراكز علاج السكري",
  "diabetes center": "مراكز علاج السكري",
  "diabetic": "مراكز علاج السكري",
  "مراكز علاج السكري": "مراكز علاج السكري",
  "Diabetes": "مراكز علاج السكري",
  "Diabetes Centers": "مراكز علاج السكري",
  "Diabetes Center": "مراكز علاج السكري",
  "Diabetic": "مراكز علاج السكري",
  
  // 18. مراكز مكافحة التدخين
  "anti smoking": "مراكز مكافحة التدخين",
  "smoking": "مراكز مكافحة التدخين",
  "smoking cessation": "مراكز مكافحة التدخين",
  "anti-smoking": "مراكز مكافحة التدخين",
  "مراكز مكافحة التدخين": "مراكز مكافحة التدخين",
  "Anti Smoking": "مراكز مكافحة التدخين",
  "Smoking": "مراكز مكافحة التدخين",
  "Smoking Cessation": "مراكز مكافحة التدخين",
  "Anti-Smoking": "مراكز مكافحة التدخين",
  
  // 19. مراكز الأسنان (المراكز الصحية)
  "dental centers": "مراكز الأسنان (المراكز الصحية)",
  "dental center": "مراكز الأسنان (المراكز الصحية)",
  "مراكز الأسنان (المراكز الصحية)": "مراكز الأسنان (المراكز الصحية)",
  "Dental Centers": "مراكز الأسنان (المراكز الصحية)",
  "Dental Center": "مراكز الأسنان (المراكز الصحية)",
  
  // 20. التوحد
  "autism": "التوحد",
  "autism center": "التوحد",
  "autism centers": "التوحد",
  "التوحد": "التوحد",
  "Autism": "التوحد",
  "Autism Center": "التوحد",
  "Autism Centers": "التوحد",
  
  // 21. الوفيات
  "mortality": "الوفيات",
  "الوفيات": "الوفيات",
  "Mortality": "الوفيات",
  
  // 22. عناية حديثي الولادة
  "nicu": "عناية حديثي الولادة",
  "neonatal care": "عناية حديثي الولادة",
  "neonatal": "عناية حديثي الولادة",
  "neonatal intensive care": "عناية حديثي الولادة",
  "عناية حديثي الولادة": "عناية حديثي الولادة",
  "NICU": "عناية حديثي الولادة",
  "Neonatal Care": "عناية حديثي الولادة",
  "Neonatal": "عناية حديثي الولادة",
  "Neonatal Intensive Care": "عناية حديثي الولادة",
  
  // 23. الإحالات
  "referral": "الإحالات",
  "referrals": "الإحالات",
  "referral services": "الإحالات",
  "الإحالات": "الإحالات",
  "Referral": "الإحالات",
  "Referrals": "الإحالات",
  "Referral Services": "الإحالات",
  
  // 24. الطب الاتصالي
  "telemedicine": "الطب الاتصالي",
  "virtual care": "الطب الاتصالي",
  "telehealth": "الطب الاتصالي",
  "الطب الاتصالي": "الطب الاتصالي",
  "Telemedicine": "الطب الاتصالي",
  "Virtual Care": "الطب الاتصالي",
  "Telehealth": "الطب الاتصالي",
  
  // 25. وصفتي
  "wasfaty": "وصفتي",
  "prescription": "وصفتي",
  "my prescription": "وصفتي",
  "wasfaty service": "وصفتي",
  "وصفتي": "وصفتي",
  "Wasfaty": "وصفتي",
  "Prescription": "وصفتي",
  "My Prescription": "وصفتي",
  "Wasfaty Service": "وصفتي",
  
  // 26. العيادات الافتراضية
  "virtual clinics": "العيادات الافتراضية",
  "virtual clinic": "العيادات الافتراضية",
  "العيادات الافتراضية": "العيادات الافتراضية",
  "Virtual Clinics": "العيادات الافتراضية",
  "Virtual Clinic": "العيادات الافتراضية",
  
  // مصطلحات إضافية من Domain
  "registration": "العيادات", // Registration عادة يكون في العيادات
  "appointments": "العيادات", // Appointments عادة يكون في العيادات
  "facility": "العيادات", // Facility عادة يكون في العيادات
  "your care": "العيادات", // Your Care عادة يكون في العيادات
  "personal issues": "العيادات", // Personal Issues عادة يكون في العيادات
  "overall assessmer": "العيادات", // Overall Assessment عادة يكون في العيادات
  "Registration": "العيادات",
  "Appointments": "العيادات",
  "Facility": "العيادات",
  "Your Care": "العيادات",
  "Personal Issues": "العيادات",
  "Overall Assessmer": "العيادات"
};

// دالة لتحويل اسم الرحلة من أي صيغة إلى الاسم العربي الرسمي
function normalizeTripName(name) {
  if (!name) return "غير محددة";
  
  const trimmed = name.trim();
  
  // إذا كان الاسم موجود في القائمة الرسمية (عربي)، نرجعه كما هو
  if (ALL_TRIPS.includes(trimmed)) {
    return trimmed;
  }
  
  // البحث في mapping (case-insensitive)
  const lowerTrimmed = trimmed.toLowerCase();
  
  // البحث المباشر
  if (TRIP_NAME_MAPPING[trimmed]) {
    return TRIP_NAME_MAPPING[trimmed];
  }
  
  // البحث بحالة صغيرة
  if (TRIP_NAME_MAPPING[lowerTrimmed]) {
    return TRIP_NAME_MAPPING[lowerTrimmed];
  }
  
  // البحث في جميع المفاتيح (case-insensitive)
  for (const [key, value] of Object.entries(TRIP_NAME_MAPPING)) {
    if (key.toLowerCase() === lowerTrimmed) {
      return value;
    }
  }
  
  // البحث الجزئي (partial match) - للعثور على تطابقات مثل "Radiology" في "Radiology Department"
  // نبحث عن تطابق كلمة كاملة أولاً (word boundary)
  for (const [key, value] of Object.entries(TRIP_NAME_MAPPING)) {
    const keyLower = key.toLowerCase();
    // تطابق كلمة كاملة
    if (lowerTrimmed === keyLower) {
      return value;
    }
    // تطابق جزئي (يحتوي على)
    if (lowerTrimmed.includes(keyLower) || keyLower.includes(lowerTrimmed)) {
      // نفضل التطابقات الأطول
      if (keyLower.length >= 3) {
        return value;
      }
    }
  }
  
  // البحث عن كلمات متعددة (مثل "Blood Bank" = "blood" + "bank")
  if (trimmed.includes(' ')) {
    const words = trimmed.split(/\s+/);
    for (const word of words) {
      const wordLower = word.toLowerCase();
      for (const [key, value] of Object.entries(TRIP_NAME_MAPPING)) {
        const keyLower = key.toLowerCase();
        if (wordLower === keyLower || wordLower.includes(keyLower) || keyLower.includes(wordLower)) {
          if (keyLower.length >= 3) {
            return value;
          }
        }
      }
    }
  }
  
  // إذا لم يُعثر عليه نهائياً
  console.warn(`⚠️ اسم رحلة غير معروف: "${trimmed}" - سيتم استخدام "غير محددة"`);
  return "غير محددة";
}

// دالة لرسم Gauge (نصف دائرة) - تصميم MoH الوزاري للرحلات
function drawMoHGauge(canvasId, score) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  
  const value = Number(score) || 0;
  
  // ألوان وزارة الصحة
  let color = "#E74C3C"; // أحمر
  if (value >= 85) color = "#2ECC71"; // أخضر
  else if (value >= 70) color = "#F1C40F"; // أصفر
  
  // تدمير الرسم القديم
  if (ctx._chart) {
    ctx._chart.destroy();
  }
  
  ctx._chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [value, 100 - value],
        backgroundColor: [color, "#E5E5E5"],
        borderWidth: 8,
        borderColor: "#ffffff",
        hoverOffset: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      
      // نصف دائرة
      rotation: -90,
      circumference: 180,
      
      cutout: "75%",
      
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: { display: false }
      }
    }
  });
}

// دالة رسم Gauge الرئيسي (نصف دائرة) نفس شكل الوزارة تماماً
function drawMainGauge(score) {
  const canvas = document.getElementById("meanGauge");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const value = Number(score) || 0;

  // ألوان الوزارة الأصلية
  let color = "#E74C3C"; // أحمر
  if (value >= 85) color = "#2ECC71"; // أخضر
  else if (value >= 70) color = "#F1C40F"; // أصفر

  // حذف الرسم القديم
  if (canvas._chart) canvas._chart.destroy();

  // إنشاء التدرج
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "#d9aa00");

  canvas._chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [value, 100 - value],
          backgroundColor: [
            gradient,
            "#E5E5E5" // اللون الرمادي
          ],
          borderWidth: 0,
          cutout: "75%"
        }
      ]
    },
    options: {
      rotation: -90,
      circumference: 180,
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: { display: false }
      }
    }
  });

  // طباعة القيمة أسفل القوس
  const display = document.getElementById("mainGaugeValue");
  if (display) display.textContent = value.toFixed(2);
}

// دالة لتحديث مؤشر متوسط السكور العام
function updateMeanGauge() {
  console.log("🔄 updateMeanGauge() تم استدعاؤها");
  
  if (!Array.isArray(pressganeyData) || pressganeyData.length === 0) {
    console.log("⚠️ لا توجد بيانات، رسم Gauge بقيمة 0");
    drawMainGauge(0);
    const meanNsize = document.getElementById("meanNsize");
    if (meanNsize) meanNsize.textContent = "n-size: 0";
    return;
  }

  // جمع كل السكورات الحسابية من جميع البيانات
  const scores = pressganeyData
    .map(r => Number(r.mean_score))
    .filter(v => !isNaN(v) && v > 0);

  if (scores.length === 0) {
    console.log("⚠️ لا توجد سكورات صحيحة، رسم Gauge بقيمة 0");
    drawMainGauge(0);
    const meanNsize = document.getElementById("meanNsize");
    if (meanNsize) meanNsize.textContent = "n-size: 0";
    return;
  }

  // احسب المتوسط العام
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log("📈 المتوسط المحسوب:", avg, "من", scores.length, "سجل");

  // تحديث الواجهة
  drawMainGauge(avg);
  const meanNsize = document.getElementById("meanNsize");
  if (meanNsize) meanNsize.textContent = "n-size: " + scores.length;
}

// تحميل البيانات من API
async function loadData() {
  try {
    // التحقق من وضع "جميع المستشفيات"
    const mode = localStorage.getItem('pressganey-mode');
    const isAllHospitals = mode === 'ALL';
    
    // الحصول على قيم التصفية
    const yearSelect = document.getElementById('pressganey-year-select');
    const quarterSelect = document.getElementById('pressganey-quarter-select');
    const selectedYear = yearSelect ? yearSelect.value : '';
    const selectedQuarter = quarterSelect ? quarterSelect.value : '';
    
    let allData = [];
    
    if (isAllHospitals) {
      // جلب البيانات من جميع المستشفيات
      console.log('🏥 [PressGaney] جلب البيانات من جميع المستشفيات...');
      
      try {
        // جلب قائمة المستشفيات النشطة
        const hospitalsRes = await fetch(`${API_BASE}/api/central/hospitals?active=1`, {
          headers: authHeaders()
        });
        
        if (!hospitalsRes.ok) {
          throw new Error('فشل جلب قائمة المستشفيات');
        }
        
        const hospitals = await hospitalsRes.json();
        if (!Array.isArray(hospitals) || hospitals.length === 0) {
          toast('لا توجد مستشفيات متاحة', 'warn');
          return;
        }
        
        // جلب البيانات من كل مستشفى
        const promises = hospitals.map(async (hospital) => {
          try {
            let url = `${API_BASE}/api/pressganey/data?hospitalId=${encodeURIComponent(hospital.HospitalID)}`;
            if (selectedYear) {
              url += `&year=${encodeURIComponent(selectedYear)}`;
            }
            if (selectedQuarter) {
              url += `&quarter=${encodeURIComponent(selectedQuarter)}`;
            }
            
            const res = await fetch(url, {
              headers: authHeaders()
            });
            
            if (res.ok) {
              const data = await res.json();
              const hospitalData = data.data || data || [];
              // إضافة معلومات المستشفى لكل سجل
              return hospitalData.map(d => ({
                ...d,
                HospitalID: hospital.HospitalID,
                HospitalName: hospital.NameAr || hospital.NameEn
              }));
            }
            return [];
          } catch (err) {
            console.warn(`⚠️ فشل جلب بيانات من مستشفى ${hospital.HospitalID}:`, err);
            return [];
          }
        });
        
        const results = await Promise.all(promises);
        allData = results.flat();
        
        console.log(`📥 تم تحميل ${allData.length} سجل من ${hospitals.length} مستشفى`);
      } catch (err) {
        console.error('❌ خطأ في جلب بيانات جميع المستشفيات:', err);
        toast('تعذّر تحميل بيانات جميع المستشفيات', 'error');
        return;
      }
    } else {
      // جلب البيانات من مستشفى واحد
      const hid = effectiveHospitalId();
      console.log('🔍 [PressGaney] loadData() - hospitalId:', hid);
      
      if (!hid) {
        console.warn('⚠️ [PressGaney] لا يوجد hospitalId — أوقف التحميل.');
        toast('يجب اختيار المستشفى أولاً', 'warn');
        // إعادة تعيين البيانات إلى فارغة
        pressganeyData = [];
        updateSummary();
        updateChart();
        updateMeanGauge();
        renderTripsCharts();
        updateTable();
        return;
      }
      
      console.log('🔍 [PressGaney] التصفية:', { selectedYear, selectedQuarter });
      
      // بناء URL مع معاملات التصفية
      let url = `${API_BASE}/api/pressganey/data?hospitalId=${encodeURIComponent(hid)}`;
      if (selectedYear) {
        url += `&year=${encodeURIComponent(selectedYear)}`;
      }
      if (selectedQuarter) {
        url += `&quarter=${encodeURIComponent(selectedQuarter)}`;
      }
      
      console.log('🌐 [PressGaney] جلب البيانات من:', url);
      
      const res = await fetch(url, {
        headers: authHeaders()
      });
      
      console.log('📡 [PressGaney] استجابة API:', res.status, res.statusText);
      
      if (!res.ok) {
        if (res.status === 401) {
          toast('يجب تسجيل الدخول', 'error');
          return;
        }
        const errorText = await res.text();
        console.error('❌ [PressGaney] خطأ API:', res.status, errorText);
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      
      const data = await res.json();
      console.log('📦 [PressGaney] البيانات المستلمة:', data);
      
      allData = data.data || data || [];
      console.log('📊 [PressGaney] عدد السجلات قبل التصفية:', allData.length);
    }
    
    // تطبيق التصفية على البيانات المحملة (في حالة عدم دعم السيرفر للتصفية)
    if (selectedYear || selectedQuarter) {
      allData = allData.filter(d => {
        const yearMatch = !selectedYear || String(d.year || '') === String(selectedYear);
        const quarterMatch = !selectedQuarter || String(d.quarter || '').toUpperCase() === String(selectedQuarter).toUpperCase();
        return yearMatch && quarterMatch;
      });
      console.log('📊 [PressGaney] عدد السجلات بعد التصفية:', allData.length);
    }
    
    pressganeyData = allData;
    
    // توحيد أسماء الرحلات للبيانات القديمة
    pressganeyData = pressganeyData.map(d => {
      if (d.TripName) {
        d.TripName = normalizeTripName(d.TripName);
      }
      return d;
    });
    
    console.log(`✅ [PressGaney] تم تحميل ${pressganeyData.length} سجل${isAllHospitals ? ' من جميع المستشفيات' : ' من السيرفر'}${selectedYear ? ` (السنة: ${selectedYear})` : ''}${selectedQuarter ? ` (الربع: ${selectedQuarter})` : ''}`);
    
    if (pressganeyData.length === 0) {
      console.warn('⚠️ [PressGaney] لا توجد بيانات للعرض');
      toast('لا توجد بيانات متاحة للعرض', 'info');
    }
    
    updateSummary();
    updateChart();
    
    // عرض مختلف حسب الوضع
    if (isAllHospitals) {
      // إخفاء المؤشر الفردي وبطاقات الرحلات وبطاقات الملخص وجدول مقارنة الأرباع وإظهار بطاقات المستشفيات
      const singleGaugeSection = document.getElementById('single-hospital-gauge');
      const allHospitalsSection = document.getElementById('all-hospitals-gauges');
      const tripsContainer = document.getElementById('departments-cards-container');
      const summaryCards = document.getElementById('summary-cards');
      const quartersComparisonSection = document.getElementById('quarters-comparison-section');
      
      if (singleGaugeSection) singleGaugeSection.classList.add('hidden');
      if (tripsContainer) tripsContainer.classList.add('hidden');
      if (summaryCards) summaryCards.classList.add('hidden');
      if (quartersComparisonSection) quartersComparisonSection.classList.add('hidden');
      
      if (allHospitalsSection) {
        allHospitalsSection.classList.remove('hidden');
        renderHospitalsGauges();
      }
    } else {
      // إظهار المؤشر الفردي وبطاقات الرحلات وبطاقات الملخص وجدول مقارنة الأرباع وإخفاء بطاقات المستشفيات
      const singleGaugeSection = document.getElementById('single-hospital-gauge');
      const allHospitalsSection = document.getElementById('all-hospitals-gauges');
      const tripsContainer = document.getElementById('departments-cards-container');
      const summaryCards = document.getElementById('summary-cards');
      const quartersComparisonSection = document.getElementById('quarters-comparison-section');
      
      if (singleGaugeSection) singleGaugeSection.classList.remove('hidden');
      if (tripsContainer) tripsContainer.classList.remove('hidden');
      if (summaryCards) summaryCards.classList.remove('hidden');
      if (quartersComparisonSection) quartersComparisonSection.classList.remove('hidden');
      if (allHospitalsSection) allHospitalsSection.classList.add('hidden');
      
      updateMeanGauge();
      renderTripsCharts();
    }
    
    updateTable();
  } catch (err) {
    console.error('❌ [PressGaney] خطأ في تحميل البيانات:', err);
    toast('تعذّر تحميل البيانات: ' + (err.message || 'خطأ غير معروف'), 'error');
    // إعادة تعيين البيانات إلى فارغة في حالة الخطأ
    pressganeyData = [];
    updateSummary();
    updateChart();
    updateMeanGauge();
    renderTripsCharts();
    updateTable();
  }
}

// تحديث الملخص
function updateSummary() {
  if (!pressganeyData.length) {
    const avgScoreEl = document.getElementById('avgScore');
    const totalDepartmentsEl = document.getElementById('totalDepartments');
    if (avgScoreEl) avgScoreEl.textContent = '0%';
    if (totalDepartmentsEl) totalDepartmentsEl.textContent = '0';
    return;
  }
  
  // حساب المتوسط
  const scores = pressganeyData.map(d => parseFloat(d.mean_score || 0)).filter(s => !isNaN(s));
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
  const avgScoreEl = document.getElementById('avgScore');
  if (avgScoreEl) avgScoreEl.textContent = avg + '%';
  
  // عدد الرحلات
  const trips = new Set(pressganeyData.map(d => d.TripName || 'غير محددة').filter(t => t)).size;
  const totalDepartmentsEl = document.getElementById('totalDepartments');
  if (totalDepartmentsEl) totalDepartmentsEl.textContent = trips;
}

// تحديث الرسم البياني الدائري (Donut Chart)
function updateChart() {
  const ctx = document.getElementById('pressganeyChart');
  if (!ctx) return;
  
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  if (!pressganeyData.length) {
    // إعدادات افتراضية عند عدم وجود بيانات
    const satisfiedEl = document.getElementById('satisfiedPercent');
    const notSatisfiedEl = document.getElementById('notSatisfiedPercent');
    if (satisfiedEl) satisfiedEl.textContent = '0%';
    if (notSatisfiedEl) notSatisfiedEl.textContent = '0%';
    
    chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['راضي', 'غير راضي'],
        datasets: [{
          data: [0, 0],
          backgroundColor: ['#22c55e', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
    return;
  }
  
  // حساب نسبة الرضا العام من جميع البيانات الفعلية
  const scores = pressganeyData
    .map(d => parseFloat(d.mean_score || 0))
    .filter(s => !isNaN(s) && s > 0); // تجاهل القيم الصفرية أو الفارغة
  
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const satisfiedPercent = avgScore.toFixed(1);
  const notSatisfiedPercent = (100 - avgScore).toFixed(1);
  
  console.log(`📊 الرسم البياني الرئيسي: ${scores.length} سجل، متوسط الرضا: ${satisfiedPercent}%`);
  
  // تحديث النسب في الواجهة
  const satisfiedEl = document.getElementById('satisfiedPercent');
  const notSatisfiedEl = document.getElementById('notSatisfiedPercent');
  if (satisfiedEl) satisfiedEl.textContent = satisfiedPercent + '%';
  if (notSatisfiedEl) notSatisfiedEl.textContent = notSatisfiedPercent + '%';
  
  // إنشاء الرسم البياني الدائري
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['راضي', 'غير راضي'],
      datasets: [{
        data: [parseFloat(satisfiedPercent), parseFloat(notSatisfiedPercent)],
        backgroundColor: ['#22c55e', '#ef4444'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
  
}

// رسم بطاقات المستشفيات مع مؤشراتها (لجميع المستشفيات)
function renderHospitalsGauges() {
  const container = document.getElementById("hospitals-gauges-container");
  if (!container) {
    console.warn("⚠️ لم يتم العثور على container بطاقات المستشفيات");
    return;
  }
  
  container.innerHTML = ""; // حذف البطاقات القديمة
  
  if (!Array.isArray(pressganeyData) || pressganeyData.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-8">لا توجد بيانات لعرضها</div>';
    return;
  }
  
  // تجميع البيانات حسب المستشفى
  const hospitalsData = {};
  pressganeyData.forEach(d => {
    const hospitalId = d.HospitalID || 'unknown';
    const hospitalName = d.HospitalName || `مستشفى ${hospitalId}`;
    
    if (!hospitalsData[hospitalId]) {
      hospitalsData[hospitalId] = {
        id: hospitalId,
        name: hospitalName,
        records: []
      };
    }
    hospitalsData[hospitalId].records.push(d);
  });
  
  // إنشاء بطاقة لكل مستشفى
  Object.values(hospitalsData).forEach((hospital, index) => {
    // حساب متوسط السكور لهذا المستشفى
    const scores = hospital.records
      .map(r => Number(r.mean_score))
      .filter(v => !isNaN(v) && v > 0);
    
    const avg = scores.length 
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) 
      : 0;
    
    // حساب n-size
    const nsize = hospital.records
      .map(r => Number(r.satisfied_count || 0))
      .filter(v => !isNaN(v))
      .reduce((a, b) => a + b, 0);
    
    // إنشاء البطاقة
    const card = document.createElement("div");
    card.className = "bg-white shadow rounded-lg p-6 text-center";
    
    const gaugeId = `hospitalGauge_${hospital.id}_${index}`;
    const valueId = `hospitalValue_${hospital.id}_${index}`;
    const nsizeId = `hospitalNsize_${hospital.id}_${index}`;
    
    card.innerHTML = `
      <h3 class="text-lg font-bold mb-4 text-gray-700">${hospital.name}</h3>
      <div class="flex flex-col items-center justify-center gap-3">
        <div class="mx-auto" style="width: 280px; height: 180px;">
          <canvas id="${gaugeId}"></canvas>
        </div>
        <div id="${valueId}" class="text-3xl font-bold text-gray-800 mt-[-30px]">${avg}</div>
        <p id="${nsizeId}" class="text-sm text-gray-600">n-size: ${nsize}</p>
      </div>
    `;
    
    container.appendChild(card);
    
    // رسم gauge نصف دائرة
    setTimeout(() => {
      const canvas = document.getElementById(gaugeId);
      if (!canvas) return;
      
      const ctx = canvas.getContext("2d");
      const value = Number(avg) || 0;
      
      // ألوان الوزارة
      let color = "#E74C3C"; // أحمر
      if (value >= 85) color = "#2ECC71"; // أخضر
      else if (value >= 70) color = "#F1C40F"; // أصفر
      
      // حذف الرسم القديم
      if (canvas._chart) canvas._chart.destroy();
      
      // إنشاء التدرج
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "#d9aa00");
      
      canvas._chart = new Chart(ctx, {
        type: "doughnut",
        data: {
          datasets: [
            {
              data: [value, 100 - value],
              backgroundColor: [
                gradient,
                "#E5E5E5"
              ],
              borderWidth: 0,
              cutout: "75%"
            }
          ]
        },
        options: {
          rotation: -90,
          circumference: 180,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            datalabels: { display: false }
          }
        }
      });
    }, 50);
  });
}

// تجميع البيانات حسب الرحلة
function groupByTrip() {
  const trips = {};

  // إنشاء رحلات فارغة مسبقاً
  ALL_TRIPS.forEach(t => {
    trips[t] = [];
  });

  // ملء الرحلات التي لها بيانات (مع توحيد الأسماء)
  pressganeyData.forEach(d => {
    const rawTrip = d.TripName || "غير محددة";
    const trip = normalizeTripName(rawTrip); // توحيد الاسم
    if (!trips[trip]) trips[trip] = [];
    trips[trip].push(d);
  });

  return trips;
}

// رسم بطاقات الرحلات - تصميم MoH الوزاري
function renderTripsCharts() {
  const container = document.getElementById("departments-cards-container");
  if (!container) {
    console.warn("⚠️ لم يتم العثور على container الرحلات");
    return;
  }
  
  container.innerHTML = ""; // حذف البطاقات القديمة
  
  const trips = groupByTrip();
  
  // عرض جميع الرحلات (حتى بدون بيانات) - تصميم MoH
  Object.keys(trips).forEach((trip, index) => {
    const tripData = trips[trip];
    
    // حساب متوسط الرحلة
    const scores = tripData
      .map(r => Number(r.mean_score))
      .filter(v => !isNaN(v) && v > 0);
    
    const avg = scores.length 
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) 
      : 0;
    
    // حساب n-size (مجموع satisfied_count من جميع السجلات)
    const nsize = tripData
      .map(r => Number(r.satisfied_count || 0))
      .filter(v => !isNaN(v))
      .reduce((a, b) => a + b, 0);
    
    // إضافة البطاقة
    const tripId = "tripGauge_" + index;
    const card = document.createElement("div");
    card.className = "bg-white shadow rounded-lg p-6 text-center";
    
    card.innerHTML = `
      <h3 class="text-lg font-bold mb-4 text-gray-700">${trip}</h3>
      <div class="flex flex-col items-center justify-center">
        <div class="mx-auto" style="width: 150px; height: 120px;">
          <canvas id="${tripId}"></canvas>
        </div>
        <p class="text-xl font-bold mt-1 text-gray-800">${avg}</p>
        <p class="text-sm text-gray-500 mt-2">n-size: ${nsize}</p>
      </div>
    `;
    
    container.appendChild(card);
    
    // رسم gauge نصف دائرة - تصميم MoH
    setTimeout(() => {
      drawMoHGauge(tripId, parseFloat(avg));
    }, 50);
  });
}

// تحديث الجدول
function updateTable() {
  const tbody = document.querySelector('#pressganeyTable tbody');
  const tripFilterSelect = document.getElementById('trip-filter-select');
  if (!tbody) return;
  
  if (!pressganeyData.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-3">لا توجد بيانات بعد</td></tr>';
    // إعادة تعيين قائمة التصفية
    if (tripFilterSelect) {
      tripFilterSelect.innerHTML = '<option value="">الكل</option>';
    }
    return;
  }
  
  // تصفية البيانات حسب المستشفى المختار (إذا لم يكن "جميع المستشفيات")
  const mode = localStorage.getItem('pressganey-mode');
  const isAllHospitals = mode === 'ALL';
  let filteredData = pressganeyData;
  
  if (!isAllHospitals) {
    const selectedHospitalId = effectiveHospitalId();
    if (selectedHospitalId) {
      // تصفية البيانات للمستشفى المختار فقط
      filteredData = pressganeyData.filter(d => {
        // إذا كانت البيانات تحتوي على HospitalID، نستخدمه للتصفية
        if (d.HospitalID) {
          return Number(d.HospitalID) === Number(selectedHospitalId);
        }
        // إذا لم يكن هناك HospitalID في البيانات، نعرضها (للتوافق مع البيانات القديمة)
        return true;
      });
    }
  }
  
  if (!filteredData.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-3">لا توجد بيانات للمستشفى المختار</td></tr>';
    if (tripFilterSelect) {
      tripFilterSelect.innerHTML = '<option value="">الكل</option>';
    }
    return;
  }
  
  // جمع جميع الرحلات المتاحة من البيانات المصفاة
  const allTrips = [...new Set(filteredData.map(d => d.TripName || 'غير محددة').filter(t => t))];
  allTrips.sort();
  
  // تحديث قائمة التصفية
  if (tripFilterSelect) {
    const currentValue = tripFilterSelect.value;
    tripFilterSelect.innerHTML = '<option value="">الكل</option>';
    allTrips.forEach(trip => {
      const option = document.createElement('option');
      option.value = trip;
      option.textContent = trip;
      tripFilterSelect.appendChild(option);
    });
    // استعادة القيمة المختارة
    if (currentValue && allTrips.includes(currentValue)) {
      tripFilterSelect.value = currentValue;
    }
  }
  
  // الحصول على الرحلة المختارة للتصفية
  const selectedTrip = tripFilterSelect ? tripFilterSelect.value : '';
  
  // تجميع البيانات حسب الرحلة والسؤال والربع
  const byDeptQuestion = {};
  filteredData.forEach(d => {
    const dept = d.TripName || 'غير محددة';
    
    // تطبيق التصفية حسب الرحلة
    if (selectedTrip && dept !== selectedTrip) {
      return;
    }
    
    const question = d.question_text_ar || d.question_text_en || 'غير محدد';
    const key = `${dept}|${question}`;
    
    if (!byDeptQuestion[key]) {
      byDeptQuestion[key] = {
        department: dept,
        question: question,
        Q1: null,
        Q2: null,
        Q3: null,
        Q4: null
      };
    }
    
    const q = d.quarter || 'Q1';
    if (['Q1', 'Q2', 'Q3', 'Q4'].includes(q)) {
      const score = parseFloat(d.mean_score || 0);
      if (!isNaN(score) && score > 0) {
        byDeptQuestion[key][q] = score;
      }
    }
  });
  
  tbody.innerHTML = '';
  
  // تجميع حسب الرحلة أولاً لعرض صف "إجمالي" لكل رحلة
  const byDept = {};
  Object.keys(byDeptQuestion).forEach(key => {
    const item = byDeptQuestion[key];
    const dept = item.department;
    if (!byDept[dept]) {
      byDept[dept] = [];
    }
    byDept[dept].push(item);
  });
  
  // إنشاء الصفوف
  Object.keys(byDept).forEach(dept => {
    const items = byDept[dept];
    
    // حساب الإجمالي لكل ربع
    const totals = { Q1: [], Q2: [], Q3: [], Q4: [] };
    items.forEach(item => {
      if (item.Q1 !== null) totals.Q1.push(item.Q1);
      if (item.Q2 !== null) totals.Q2.push(item.Q2);
      if (item.Q3 !== null) totals.Q3.push(item.Q3);
      if (item.Q4 !== null) totals.Q4.push(item.Q4);
    });
    
    const avgQ1 = totals.Q1.length > 0 ? (totals.Q1.reduce((a, b) => a + b, 0) / totals.Q1.length) : null;
    const avgQ2 = totals.Q2.length > 0 ? (totals.Q2.reduce((a, b) => a + b, 0) / totals.Q2.length) : null;
    const avgQ3 = totals.Q3.length > 0 ? (totals.Q3.reduce((a, b) => a + b, 0) / totals.Q3.length) : null;
    const avgQ4 = totals.Q4.length > 0 ? (totals.Q4.reduce((a, b) => a + b, 0) / totals.Q4.length) : null;
    
    // صف الإجمالي - حساب نسبة التغير بين آخر ربع وربع قبله
    let lastQuarter = null;
    let prevQuarter = null;
    
    if (avgQ4 !== null) {
      lastQuarter = avgQ4;
      prevQuarter = avgQ3 !== null ? avgQ3 : (avgQ2 !== null ? avgQ2 : avgQ1);
    } else if (avgQ3 !== null) {
      lastQuarter = avgQ3;
      prevQuarter = avgQ2 !== null ? avgQ2 : avgQ1;
    } else if (avgQ2 !== null) {
      lastQuarter = avgQ2;
      prevQuarter = avgQ1;
    }
    
    let changePercent = '-';
    let changeClass = '';
    let needsAction = false;
    
    if (lastQuarter !== null && prevQuarter !== null && prevQuarter > 0) {
      const change = ((lastQuarter - prevQuarter) / prevQuarter) * 100;
      if (change < 0) {
        changePercent = Math.abs(change).toFixed(2) + '-';
        changeClass = 'bg-red-100 text-red-700';
        needsAction = true;
      } else {
        changePercent = change.toFixed(2) + '%';
        changeClass = 'text-green-600';
      }
    }
    
    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
      <td class="border p-2 font-semibold">${dept}</td>
      <td class="border p-2 font-semibold">إجمالي</td>
      <td class="border p-2">${avgQ1 !== null ? avgQ1.toFixed(2) : '-'}</td>
      <td class="border p-2">${avgQ2 !== null ? avgQ2.toFixed(2) : '-'}</td>
      <td class="border p-2">${avgQ3 !== null ? avgQ3.toFixed(2) : '-'}</td>
      <td class="border p-2">${avgQ4 !== null ? avgQ4.toFixed(2) : '-'}</td>
      <td class="border p-2 ${changeClass}">${changePercent}</td>
      <td class="border p-2">
        ${needsAction 
          ? '<button class="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">إضافة مشروع تحسيني</button>'
          : '<span class="text-gray-500">لا يتطلب إجراء</span>'
        }
      </td>
    `;
    tbody.appendChild(totalRow);
    
    // صفوف الأسئلة - حساب نسبة التغير بين آخر ربع وربع قبله
    items.forEach(item => {
      let lastQ = null;
      let prevQ = null;
      
      if (item.Q4 !== null) {
        lastQ = item.Q4;
        prevQ = item.Q3 !== null ? item.Q3 : (item.Q2 !== null ? item.Q2 : item.Q1);
      } else if (item.Q3 !== null) {
        lastQ = item.Q3;
        prevQ = item.Q2 !== null ? item.Q2 : item.Q1;
      } else if (item.Q2 !== null) {
        lastQ = item.Q2;
        prevQ = item.Q1;
      }
      
      let qChange = '-';
      let qChangeClass = '';
      let qNeedsAction = false;
      
      if (lastQ !== null && prevQ !== null && prevQ > 0) {
        const change = ((lastQ - prevQ) / prevQ) * 100;
        if (change < 0) {
          qChange = Math.abs(change).toFixed(2) + '-';
          qChangeClass = 'bg-red-100 text-red-700';
          qNeedsAction = true;
        } else {
          qChange = change.toFixed(2) + '%';
          qChangeClass = 'text-green-600';
        }
      }
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="border p-2">${item.department}</td>
        <td class="border p-2 text-right">${item.question}</td>
        <td class="border p-2">${item.Q1 !== null ? item.Q1.toFixed(2) : '-'}</td>
        <td class="border p-2">${item.Q2 !== null ? item.Q2.toFixed(2) : '-'}</td>
        <td class="border p-2">${item.Q3 !== null ? item.Q3.toFixed(2) : '-'}</td>
        <td class="border p-2">${item.Q4 !== null ? item.Q4.toFixed(2) : '-'}</td>
        <td class="border p-2 ${qChangeClass}">${qChange}</td>
        <td class="border p-2">
          ${qNeedsAction 
            ? '<button class="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">إضافة مشروع تحسيني</button>'
            : '<span class="text-gray-500">لا يتطلب إجراء</span>'
          }
        </td>
      `;
      tbody.appendChild(row);
    });
  });
}

// ✅ دالة معالجة الإكسل - تتجاوز الصفوف الأولى وتتعرف على الأعمدة تلقائيًا
async function handleExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!rawRows || rawRows.length === 0) {
          toast('الملف فارغ أو غير صالح', 'error');
          return reject(new Error('Empty file'));
        }

        // 🔍 التحقق من التنسيق الجديد (Facility, n-Size, Facility Mean)
        const firstRow = rawRows[0] || [];
        const secondRow = rawRows[1] || [];
        const thirdRow = rawRows[2] || [];
        
        // البحث في الصف الثاني والثالث عن أعمدة Facility
        // ⚠️ تحسين: يجب أن يكون هناك "Facility" أو "Hospital" أو "مستشفى" لتأكيد التنسيق
        // أو وجود "Facility Mean" بشكل صريح. وجود "n-size" وحده غير كافٍ.
        const hasFacilityFormat = 
          (Array.isArray(secondRow) && secondRow.some(cell => 
            typeof cell === 'string' && (
              (cell.toLowerCase().includes('facility') && !cell.toLowerCase().includes('mean')) || 
              cell.toLowerCase().includes('hospital') ||
              cell.toLowerCase().includes('مستشفى') ||
              cell.toLowerCase().includes('facility mean')
            )
          )) ||
          (Array.isArray(thirdRow) && thirdRow.some(cell => 
            typeof cell === 'string' && (
              (cell.toLowerCase().includes('facility') && !cell.toLowerCase().includes('mean')) || 
              cell.toLowerCase().includes('hospital') ||
              cell.toLowerCase().includes('مستشفى') ||
              cell.toLowerCase().includes('facility mean')
            )
          ));

        console.log('🔍 [Excel] فحص التنسيق:', {
          hasFacilityFormat,
          firstRow: firstRow.slice(0, 5),
          secondRow: secondRow.slice(0, 5),
          thirdRow: thirdRow.slice(0, 5)
        });

        if (hasFacilityFormat) {
          // معالجة التنسيق الجديد (Facility-based)
          console.log('📋 [Excel] استخدام تنسيق Facility-based');
          return handleFacilityFormatExcel(rawRows, resolve, reject);
        }

        // 🔍 البحث عن الصف اللي يحتوي على "Question" كبداية الأعمدة الحقيقية (التنسيق القديم)
        let headerRowIndex = rawRows.findIndex(r =>
          Array.isArray(r) && r.some(cell => 
            typeof cell === 'string' && (
              cell.toLowerCase().includes('question') ||
              cell.toLowerCase().includes('domain') ||
              cell.toLowerCase().includes('meanscore')
            )
          )
        );

        console.log('🔍 [Excel] فحص تنسيق Question-based:', {
          headerRowIndex,
          headerRow: headerRowIndex !== -1 ? rawRows[headerRowIndex] : null
        });

        if (headerRowIndex === -1) {
          console.error('❌ [Excel] لم يتم العثور على صف Headers. أول 5 صفوف:', rawRows.slice(0, 5));
          toast('تعذر العثور على صف الأعمدة (Question, Domain, ...). تحقق من تنسيق الملف.', 'error');
          return reject(new Error('Header not found'));
        }

        // استخراج الأعمدة والصفوف بعده
        const headers = rawRows[headerRowIndex].map(h => String(h || '').trim());
        const dataRows = rawRows.slice(headerRowIndex + 1);

        // تحويل البيانات إلى كائنات JSON
        const jsonData = dataRows.map(row => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = row[i];
          });
          return obj;
        });

        // استخراج اسم الرحلة والربع والسنة من السطر الأول
        let tripName = null; // null بدلاً من "غير محددة" للتمييز
        let quarter = 'Q1';
        let year = new Date().getFullYear();
        let firstRowText = ''; // تعريف المتغير خارج try block
        
        try {
          // البحث في الصفوف الأولى عن "Report for:"
          for (let i = 0; i < Math.min(3, rawRows.length); i++) {
            const row = rawRows[i] || [];
            const rowText = Array.isArray(row) ? row.join(' ') : String(row);
            if (rowText.toLowerCase().includes('report for:')) {
              firstRowText = rowText;
              break;
            }
          }
          
          if (!firstRowText && rawRows[0]) {
            firstRowText = Array.isArray(rawRows[0]) ? rawRows[0].join(' ') : String(rawRows[0]);
          }
          
          console.log('🔍 [Excel] نص الصف الأول:', firstRowText);
          
          // استخراج اسم الرحلة من "Report for: X /" أو "Report for: X -"
          // يدعم: "Report for: Radiology / Makkah Health Cluster / King Abdulaziz Hospital, Makkah"
          // يجب استخراج "Radiology" فقط (أول كلمة بعد "Report for:")
          
          // 🔥 استخراج اسم الرحلة من "Report for: X /" - يدعم أي صيغة
          // يدعم: "Report for: Blood Bank /" أو "Report for: Radiology /" أو "Report for: Emergency /"
          const match = firstRowText.match(/Report\s+for:\s*(.*?)\s*\//i);
          
          if (match && match[1]) {
            let extracted = match[1].trim();
            
            // تنظيف الاسم: إزالة أي معلومات إضافية بعد "/" أو "-" أو ","
            // نأخذ أول كلمة أو كلمتين (مثل "Blood Bank" أو "Radiology")
            extracted = extracted.split(/[\/\-\s,]+/)[0].trim();
            
            // إذا كانت الكلمة الأولى فارغة أو قصيرة جداً، نأخذ الكلمة التالية
            if (!extracted || extracted.length < 2) {
              const parts = match[1].trim().split(/[\/\-\s,]+/);
              extracted = parts.find(p => p.trim().length >= 2) || extracted;
            }
            
            console.log('🔍 [Excel] اسم الرحلة المستخرج (قبل normalize):', extracted, 'من:', match[1]);
            
            if (extracted) {
              // استخدام normalizeTripName للتحويل إلى الاسم العربي الرسمي
              const normalized = normalizeTripName(extracted);
              
              // إذا كانت النتيجة "غير محددة"، نحاول البحث عن كلمات متعددة (مثل "Blood Bank")
              if (normalized === "غير محددة" && extracted.includes(' ')) {
                const words = extracted.split(/\s+/);
                for (const word of words) {
                  const wordNormalized = normalizeTripName(word);
                  if (wordNormalized !== "غير محددة") {
                    tripName = wordNormalized;
                    console.log('✅ [Excel] تم العثور على اسم الرحلة من كلمة:', word, '→', tripName);
                    break;
                  }
                }
              } else {
                tripName = normalized;
              }
              
              console.log('🏥 [Excel] تم استخراج اسم الرحلة:', tripName, 'من:', extracted, '(normalized:', normalized, ')');
            } else {
              console.warn('⚠️ [Excel] لم يتم استخراج اسم رحلة من "Report for:"');
            }
          } else {
            console.warn('⚠️ [Excel] لم يتم العثور على "Report for: X /" في الصف الأول');
            console.warn('⚠️ [Excel] نص الصف الأول:', firstRowText);
          }
          
          // البحث عن Period في السطر الأول أو الثاني أو الثالث
          let periodText = '';
          for (let i = 0; i < Math.min(5, rawRows.length); i++) {
            const row = rawRows[i] || [];
            const rowText = Array.isArray(row) ? row.join(' ').toLowerCase() : String(row).toLowerCase();
            if (rowText.includes('period') || rowText.includes('quarter') || rowText.includes('q1') || rowText.includes('q2') || rowText.includes('q3') || rowText.includes('q4')) {
              periodText = Array.isArray(row) ? row.join(' ') : String(row);
              break;
            }
          }
          
          // استخراج الربع والسنة من Period
          if (periodText) {
            // البحث عن الربع (Q1, Q2, Q3, Q4 أو Quarter 1, Quarter 2, etc.)
            const quarterMatch1 = periodText.match(/q(\d+)/i);
            const quarterMatch2 = periodText.match(/quarter\s*(\d+)/i);
            if (quarterMatch1) {
              quarter = 'Q' + quarterMatch1[1];
            } else if (quarterMatch2) {
              quarter = 'Q' + quarterMatch2[1];
            }
            
            // البحث عن السنة (4 أرقام)
            const yearMatch = periodText.match(/(\d{4})/);
            if (yearMatch) {
              year = parseInt(yearMatch[1]);
            }
          }
          
          console.log('📅 [Excel] تم استخراج:', { tripName, quarter, year });
          
          // 🔄 Fallback: إذا لم نجد اسم رحلة من "Report for:"، نستخدم Domain
          if (!tripName || tripName === "غير محددة") {
            console.warn('⚠️ [Excel] لم يتم العثور على اسم الرحلة من "Report for:"، البحث في Domain...');
            
            // البحث في Domain من أول سجل بيانات
            const firstDomain = jsonData[0]?.["Domain"] || jsonData[0]?.["domain"] || "";
            const firstDomainAr = jsonData[0]?.["Domain Ar"] || jsonData[0]?.["domain ar"] || "";
            
            if (firstDomain) {
              tripName = normalizeTripName(firstDomain);
              console.log('✅ [Excel] تم استخدام Domain كاسم رحلة:', firstDomain, '→', tripName);
            } else if (firstDomainAr) {
              tripName = normalizeTripName(firstDomainAr);
              console.log('✅ [Excel] تم استخدام Domain Ar كاسم رحلة:', firstDomainAr, '→', tripName);
            } else {
              // البحث في الصفوف الأولى عن أي كلمة قد تكون اسم رحلة
              const commonTrips = ['Radiology', 'Blood Bank', 'Inpatient', 'Outpatient', 'Cardiac', 'Oncology', 'Dental', 'Emergency'];
              
              for (let i = 0; i < Math.min(5, rawRows.length); i++) {
                const row = rawRows[i] || [];
                const rowText = Array.isArray(row) ? row.join(' ') : String(row);
                
                // البحث عن كل رحلة في القائمة
                for (const trip of commonTrips) {
                  const tripRegex = new RegExp(`\\b${trip.replace(/\s+/g, '\\s+')}\\b`, 'i');
                  if (tripRegex.test(rowText)) {
                    const normalized = normalizeTripName(trip);
                    if (normalized && normalized !== "غير محددة") {
                      tripName = normalized;
                      console.log('✅ [Excel] تم العثور على اسم الرحلة من النص:', tripName, 'من:', trip);
                      break;
                    }
                  }
                }
                if (tripName && tripName !== "غير محددة") break;
              }
            }
          }
          
          // إذا لم نجد اسم رحلة بعد كل المحاولات
          if (!tripName || tripName === "غير محددة") {
            console.error('❌ [Excel] لم يتم العثور على اسم الرحلة بعد كل المحاولات. سيتم استخدام "غير محددة"');
            console.error('❌ [Excel] نص الصف الأول:', firstRowText);
            console.error('❌ [Excel] أول Domain:', jsonData[0]?.["Domain"] || jsonData[0]?.["Domain Ar"] || "غير موجود");
            tripName = "غير محددة";
          }
          
          // حفظ الربع والسنة للاستخدام لاحقاً
          lastImportedQuarter = quarter;
          lastImportedYear = year;
          
        } catch (e) {
          console.error("❌ [Excel] خطأ في استخراج اسم الرحلة:", e);
          tripName = tripName || "غير محددة";
        }

        const processed = [];

        for (const row of jsonData) {
          // قراءة الأعمدة مع دعم اختلافات بسيطة في الأسماء
          const question_text_en = (row['Question'] || row['question'] || '').toString().trim();
          const question_text_ar = (row['Question Ar'] || row['Question Ar'] || row['question ar'] || '').toString().trim();
          
          // قراءة Domain و Domain Ar بشكل صحيح
          const department_name_en = (row['Domain'] || row['domain'] || '').toString().trim();
          const department_name_ar = (row['Domain Ar'] || row['Domain Ar'] || row['domain ar'] || '').toString().trim();
          
          const nsize = parseInt(row['N-Size'] || row['N Size'] || row['n-size'] || row['n size'] || row['NSize'] || 0);
          const mean_score = parseFloat(row['Meanscore'] || row['Mean Score'] || row['meanscore'] || row['mean score'] || row['MeanScore'] || 0);
          const diff = parseFloat(row['Diff'] || row['diff'] || 0);

          // تخطي الصفوف الفارغة
          if (!question_text_en && !department_name_en && !question_text_ar && !department_name_ar && mean_score === 0) continue;
          
          // معالجة صف "Overall" - نحفظه إذا كان يحتوي على بيانات
          if (question_text_en.toLowerCase() === 'overall' && mean_score > 0) {
            // نحفظ صف Overall مع Domain إذا كان موجوداً
          }

          const question_code = question_text_en
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '') || 'overall';

          // التأكد من أن tripName ليس null
          const finalTripName = tripName || "غير محددة";
          
          // تسجيل تحذيري إذا كان اسم الرحلة "الطوارئ" بدون وجود "Emergency" في النص
          if (finalTripName === "الطوارئ" && !firstRowText.toLowerCase().includes('emergency') && !firstRowText.toLowerCase().includes('er ')) {
            console.error('❌ [Excel] تحذير: اسم الرحلة هو "الطوارئ" لكن لا يوجد "Emergency" في النص!');
            console.error('❌ [Excel] نص الصف الأول:', firstRowText);
          }
          
          processed.push({
            TripName: finalTripName, // استخدام اسم الرحلة المستخرج من "Report for:"
            department_key: department_name_en || department_name_ar || 'غير محدد',
            department_name_ar: department_name_ar || department_name_en || 'غير محدد',
            department_name_en: department_name_en || department_name_ar || 'غير محدد',
            domain: department_name_en || null, // إضافة Domain
            domain_ar: department_name_ar || null, // إضافة Domain Ar
            question_code,
            question_text_en: question_text_en || 'Overall',
            question_text_ar: question_text_ar || question_text_en || 'إجمالي',
            satisfied_count: nsize,
            not_satisfied_count: 0,
            mean_score,
            diff,
            quarter: quarter, // استخدام الربع المستخرج من Excel
            year: year // استخدام السنة المستخرجة من Excel
          });
        }
        
        console.log('✅ [Excel] تم معالجة', processed.length, 'سجل');
        console.log('📊 [Excel] اسم الرحلة المستخدم:', tripName);
        console.log('📊 [Excel] أمثلة على Domain:', [...new Set(processed.slice(0, 5).map(p => p.department_name_en))]);
        console.log('📊 [Excel] أمثلة على Domain Ar:', [...new Set(processed.slice(0, 5).map(p => p.department_name_ar))]);
        
        // التحقق من أن البيانات تحتوي على Domain
        const hasDomain = processed.some(p => p.department_name_en || p.department_name_ar);
        if (!hasDomain) {
          console.warn('⚠️ [Excel] تحذير: لا توجد بيانات Domain في السجلات المعالجة');
        }
        
        // التحقق من أن اسم الرحلة ليس "غير محددة"
        if (tripName === "غير محددة") {
          console.error('❌ [Excel] خطأ: اسم الرحلة هو "غير محددة". تحقق من تنسيق الملف.');
          console.error('❌ [Excel] نص الصف الأول:', firstRowText);
        } else {
          console.log('✅ [Excel] تم تحديد اسم الرحلة بنجاح:', tripName);
        }
        
        // التحقق من أن جميع السجلات تستخدم نفس اسم الرحلة
        const uniqueTripNames = [...new Set(processed.map(p => p.TripName))];
        if (uniqueTripNames.length > 1) {
          console.warn('⚠️ [Excel] تحذير: يوجد أكثر من اسم رحلة في البيانات:', uniqueTripNames);
        } else if (uniqueTripNames.length === 1) {
          console.log('✅ [Excel] جميع السجلات تستخدم نفس اسم الرحلة:', uniqueTripNames[0]);
        }
        
        // التحقق من أن اسم الرحلة ليس "الطوارئ" بدون مبرر
        if (uniqueTripNames.length === 1 && uniqueTripNames[0] === "الطوارئ") {
          const hasEmergencyInText = firstRowText.toLowerCase().includes('emergency') || 
                                      firstRowText.toLowerCase().includes('er ') ||
                                      jsonData.some(row => (row['Domain'] || '').toLowerCase().includes('emergency'));
          if (!hasEmergencyInText) {
            console.error('❌ [Excel] خطأ: جميع السجلات تستخدم "الطوارئ" كاسم رحلة بدون وجود "Emergency" في النص!');
            console.error('❌ [Excel] نص الصف الأول:', firstRowText);
            console.error('❌ [Excel] اسم الرحلة المستخرج:', tripName);
          } else {
            console.log('✅ [Excel] اسم الرحلة "الطوارئ" صحيح (موجود في النص)');
          }
        }

        pressganeyData = [...pressganeyData, ...processed];
        
        // طباعة أسماء الرحلات الفعلية للمساعدة في التصحيح
        const uniqueTrips = [...new Set(processed.map(d => d.TripName || 'غير محددة'))];
        console.log('📊 الرحلات الموجودة في Excel:', uniqueTrips);
        
        updateSummary();
        updateChart();
        updateMeanGauge();
        renderTripsCharts();
        updateTable();

        toast(`تم استيراد ${processed.length} سجل بنجاح`, 'success');
        resolve(processed);
      } catch (err) {
        console.error('Error processing Excel file:', err);
        toast('فشل استيراد الملف: ' + err.message, 'error');
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsArrayBuffer(file);
  });
}

// دالة معالجة التنسيق الجديد (Facility-based Excel)
function handleFacilityFormatExcel(rawRows, resolve, reject) {
  try {
    // الصف الأول: Service, Mean, N Size, Period
    const firstRow = rawRows[0] || [];
    const service = firstRow[0] || '';
    const overallMean = parseFloat(firstRow[1] || 0);
    const overallNSize = parseInt(firstRow[2] || 0);
    const periodText = (firstRow[3] || '').toString();
    
    // استخراج الربع والسنة من Period
    let quarter = 'Q1';
    let year = new Date().getFullYear();
    const quarterMatch = periodText.match(/quarter\s*(\d+)/i);
    const yearMatch = periodText.match(/(\d{4})/);
    if (quarterMatch) {
      quarter = 'Q' + quarterMatch[1];
    }
    if (yearMatch) {
      year = parseInt(yearMatch[1]);
    }
    
    // البحث عن صف Headers (قد يكون في الصف الثاني أو الثالث)
    let headerRowIndex = -1;
    let headers = [];
    
    for (let i = 1; i < Math.min(5, rawRows.length); i++) {
      const row = rawRows[i] || [];
      const rowHeaders = Array.isArray(row) ? row.map(h => String(h || '').trim()) : [];
      const hasFacility = rowHeaders.some(h => h.toLowerCase().includes('facility') && !h.toLowerCase().includes('mean'));
      const hasMean = rowHeaders.some(h => h.toLowerCase().includes('mean') || h.toLowerCase().includes('facility mean'));
      
      if (hasFacility || hasMean) {
        headerRowIndex = i;
        headers = rowHeaders;
        break;
      }
    }
    
    if (headerRowIndex === -1 || headers.length === 0) {
      console.error('❌ [Excel] لم يتم العثور على صف Headers. الصفوف المتاحة:', rawRows.slice(0, 5));
      toast('تعذر العثور على صف الأعمدة. تأكد من أن الملف يحتوي على أعمدة Facility و Mean', 'error');
      return reject(new Error('Header row not found'));
    }
    
    // البحث عن فهارس الأعمدة (بمرونة أكبر)
    const facilityIndex = headers.findIndex(h => {
      const hLower = h.toLowerCase();
      return (hLower.includes('facility') && !hLower.includes('mean')) || 
             hLower.includes('مستشفى') || 
             hLower.includes('hospital');
    });
    
    const nsizeIndex = headers.findIndex(h => {
      const hLower = h.toLowerCase();
      return hLower.includes('n-size') || 
             hLower.includes('nsize') || 
             hLower.includes('n size') ||
             hLower.includes('size');
    });
    
    const meanIndex = headers.findIndex(h => {
      const hLower = h.toLowerCase();
      return hLower.includes('facility mean') || 
             (hLower.includes('mean') && !hLower.includes('region')) ||
             hLower.includes('متوسط') ||
             hLower.includes('score');
    });
    
    const regionIndex = headers.findIndex(h => {
      const hLower = h.toLowerCase();
      return hLower.includes('region') && !hLower.includes('mean');
    });
    
    console.log('🔍 [Excel] فهارس الأعمدة:', { facilityIndex, nsizeIndex, meanIndex, regionIndex, headers });
    
    // التحقق من وجود عمود Mean على الأقل (Facility اختياري)
    if (meanIndex === -1) {
      console.error('❌ [Excel] الأعمدة المتاحة:', headers);
      console.error('❌ [Excel] الصفوف الأولى:', rawRows.slice(0, headerRowIndex + 3));
      toast('تعذر العثور على عمود Mean أو Facility Mean. الأعمدة الموجودة: ' + headers.join(', '), 'error');
      return reject(new Error('Required columns not found: Mean column is required'));
    }
    
    // إذا لم يكن هناك Facility، نستخدم Mean كمعرف
    if (facilityIndex === -1) {
      console.warn('⚠️ [Excel] لم يتم العثور على عمود Facility، سيتم استخدام Mean كمعرف');
    }
    
    // استخراج اسم الرحلة من Service
    let tripName = "غير محددة";
    if (service) {
      tripName = normalizeTripName(service);
    }
    
    // البيانات تبدأ من الصف بعد Headers
    const dataRows = rawRows.slice(headerRowIndex + 1);
    const processed = [];
    
    for (const row of dataRows) {
      const facilityName = facilityIndex !== -1 ? (row[facilityIndex] || '').toString().trim() : '';
      const nsize = nsizeIndex !== -1 ? parseInt(row[nsizeIndex] || 0) : 0;
      const facilityMean = meanIndex !== -1 ? parseFloat(row[meanIndex] || 0) : 0;
      const region = regionIndex !== -1 ? (row[regionIndex] || '').toString().trim() : '';
      
      // تخطي الصفوف الفارغة
      if (!facilityName && facilityMean === 0) continue;
      
      // إذا لم يكن هناك اسم مستشفى، استخدم قيمة Mean كمعرف مؤقت
      const finalFacilityName = facilityName || (facilityMean > 0 ? `مستشفى ${facilityMean}` : 'غير محدد');
      
      // تخطي الصفوف التي لا تحتوي على Mean صالح
      if (facilityMean === 0 || isNaN(facilityMean)) {
        continue;
      }
      
      processed.push({
        TripName: tripName,
        department_key: 'Overall',
        department_name_ar: 'إجمالي',
        department_name_en: 'Overall',
        domain: 'Overall', // إضافة Domain
        domain_ar: 'إجمالي', // إضافة Domain Ar
        question_code: 'overall_mean',
        question_text_en: 'Overall Mean Score',
        question_text_ar: 'متوسط السكور العام',
        satisfied_count: nsize,
        not_satisfied_count: 0,
        mean_score: facilityMean,
        diff: 0,
        quarter: quarter,
        year: year,
        FacilityName: finalFacilityName,
        Region: region
      });
    }
    
    if (processed.length === 0) {
      toast('لا توجد بيانات صالحة في الملف', 'warn');
      return reject(new Error('No valid data'));
    }
    
    pressganeyData = [...pressganeyData, ...processed];
    
    console.log(`📊 تم استيراد ${processed.length} سجل من ${tripName} (${quarter} ${year})`);
    
    updateSummary();
    updateChart();
    updateMeanGauge();
    renderTripsCharts();
    updateTable();
    
    toast(`تم استيراد ${processed.length} سجل بنجاح من ${tripName}`, 'success');
    resolve(processed);
  } catch (err) {
    console.error('Error processing Facility format Excel:', err);
    toast('فشل استيراد الملف: ' + err.message, 'error');
    reject(err);
  }
}

// 📁 زر استيراد إكسل - معالجة ملف الإكسل في الواجهة (تمامًا مثل النسخة الشغالة)
const excelInput = document.createElement('input');
excelInput.type = 'file';
excelInput.accept = '.xlsx,.xls';
excelInput.style.display = 'none';

excelInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  
  try {
    for (const file of files) {
      await handleExcelFile(file);
    }
    
    // تحديث الربع والسنة إذا تم اكتشافها
    if (lastImportedQuarter) {
      localStorage.setItem('pressganey:selectedQuarter', lastImportedQuarter);
    }
    
    if (lastImportedYear) {
      localStorage.setItem('pressganey:selectedYear', String(lastImportedYear));
    }
    
    e.target.value = '';
  } catch (err) {
    console.error('Import error:', err);
    toast('فشل استيراد الملف: ' + err.message, 'error');
  }
});

// تحميل البيانات عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  // إضافة excelInput إلى body
  document.body.appendChild(excelInput);
  
  // إعداد حقول التصفية (السنة والربع)
  const yearSelect = document.getElementById('pressganey-year-select');
  const quarterSelect = document.getElementById('pressganey-quarter-select');
  
  // ملء قائمة السنوات (من 2020 إلى السنة الحالية + 1)
  if (yearSelect) {
    const currentYear = new Date().getFullYear();
    // إضافة خيار "الكل" إذا لم يكن موجوداً
    if (!yearSelect.querySelector('option[value=""]')) {
      const allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = 'الكل';
      yearSelect.insertBefore(allOption, yearSelect.firstChild);
    }
    
    // إضافة السنوات
    for (let year = currentYear + 1; year >= 2020; year--) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    }
    
    // تعيين السنة المحفوظة أو الحالية كافتراضي
    const savedYear = localStorage.getItem('pressganey-selectedYear') || currentYear;
    if (savedYear) {
      yearSelect.value = savedYear;
    }
    
    // إضافة event listener لتحديث البيانات عند تغيير السنة
    yearSelect.addEventListener('change', () => {
      localStorage.setItem('pressganey-selectedYear', yearSelect.value);
      if (typeof loadData === 'function') {
        loadData();
      }
    });
  }
  
  // إعداد الربع
  if (quarterSelect) {
    // تعيين الربع المحفوظ كافتراضي
    const savedQuarter = localStorage.getItem('pressganey-selectedQuarter') || '';
    quarterSelect.value = savedQuarter;
    
    // إضافة event listener لتحديث البيانات عند تغيير الربع
    quarterSelect.addEventListener('change', () => {
      localStorage.setItem('pressganey-selectedQuarter', quarterSelect.value);
      if (typeof loadData === 'function') {
        loadData();
      }
    });
  }
  
  // إعداد تصفية الرحلة في الجدول
  const tripFilterSelect = document.getElementById('trip-filter-select');
  if (tripFilterSelect) {
    // إضافة event listener لتحديث الجدول عند تغيير الرحلة
    tripFilterSelect.addEventListener('change', () => {
      if (typeof updateTable === 'function') {
        updateTable();
      }
    });
  }
  
  // ربط زر استيراد إكسل
  document.getElementById('importExcelBtn')?.addEventListener('click', () => {
    excelInput.click();
  });
  
  // ربط زر حفظ في قاعدة البيانات
  document.getElementById('saveToDBBtn')?.addEventListener('click', async () => {
    if (!pressganeyData.length) {
      toast('لا توجد بيانات للحفظ', 'warn');
      return;
    }
    
    // التحقق من نوع البيانات
    const hasFacilityNames = pressganeyData.some(item => item.FacilityName);
    const hid = effectiveHospitalId();
    
    // إذا كانت البيانات تحتوي على FacilityName، لا نحتاج hospitalId
    // وإلا نحتاج hospitalId
    if (!hasFacilityNames && !hid) {
      toast('يجب اختيار المستشفى أولاً قبل الحفظ', 'error');
      return;
    }
    
    try {
      const quarter = lastImportedQuarter || 'Q1';
      const year = lastImportedYear || new Date().getFullYear();
      
      console.log('💾 [PressGaney] حفظ البيانات:', { 
        hasFacilityNames,
        hospitalId: hid, 
        quarter, 
        year, 
        rowsCount: pressganeyData.length 
      });
      
      const res = await fetch(`${API_BASE}/api/pressganey/save`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          quarter,
          year,
          rows: pressganeyData
        })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'خطأ في الحفظ' }));
        throw new Error(err.message || 'HTTP ' + res.status);
      }
      
      const result = await res.json();
      toast(result.message || 'تم الحفظ بنجاح', 'success');
      
      // إعادة تحميل البيانات من السيرفر
      await loadData();
    } catch (err) {
      console.error('Save error:', err);
      toast('فشل الحفظ: ' + err.message, 'error');
    }
  });
  
  // عرض جميع الرحلات حتى بدون بيانات
  renderTripsCharts();
  
  // تحديث مؤشر متوسط السكور العام
  updateMeanGauge();
  
  // تحميل البيانات
  loadData();
});

