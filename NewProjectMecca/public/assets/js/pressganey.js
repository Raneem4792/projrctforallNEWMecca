// pressganey.js - نظام Press Ganey
const API_BASE = localStorage.getItem('apiBase') || 'http://localhost:3001';
const token = localStorage.getItem('token') || localStorage.getItem('authToken') || '';

// دالة للحصول على hospitalId
function effectiveHospitalId() {
  try {
    const u = JSON.parse(localStorage.getItem('userData') || '{}');
    const q = new URLSearchParams(location.search);
    const fromUrl = Number(q.get('hospitalId') || q.get('hid') || 0);
    const fromLS = Number(localStorage.getItem('selectedHospitalId') || localStorage.getItem('hospitalId') || 0);
    const fromUser = Number(u.HospitalID || u.hospitalId || u.hid || 0);
    return fromUrl || fromLS || fromUser || null;
  } catch {
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
let emergencyChartInstance = null;
let lastImportedQuarter = null;
let lastImportedYear = null;

// تحميل البيانات من API
async function loadData() {
  try {
    const res = await fetch(`${API_BASE}/api/pressganey/data`, {
      headers: authHeaders()
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        toast('يجب تسجيل الدخول', 'error');
        return;
      }
      throw new Error('HTTP ' + res.status);
    }
    
    const data = await res.json();
    pressganeyData = data.data || data || [];
    
    console.log(`📥 تم تحميل ${pressganeyData.length} سجل من السيرفر`);
    
    updateSummary();
    updateChart();
    updateTable();
  } catch (err) {
    console.error('Error loading data:', err);
    toast('تعذّر تحميل البيانات', 'error');
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
  
  // عدد الأقسام
  const departments = new Set(pressganeyData.map(d => d.department_key || d.department_name_ar || d.department_name_en)).size;
  const totalDepartmentsEl = document.getElementById('totalDepartments');
  if (totalDepartmentsEl) totalDepartmentsEl.textContent = departments;
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
  
  // تحديث بطاقات الأقسام
  updateDepartmentCards();
}

// تحديث بطاقات الأقسام
function updateDepartmentCards() {
  if (!pressganeyData.length) {
    // إعدادات افتراضية
    const departments = {
      'outpatient': { satisfied: 0, notSatisfied: 0 },
      'radiology': { satisfied: 0, notSatisfied: 0 },
      'homeMedicine': { satisfied: 0, notSatisfied: 0 },
      'inpatient': { satisfied: 0, notSatisfied: 0 },
      'emergency': { satisfied: 0, notSatisfied: 0 },
      'dentistry': { satisfied: 0, notSatisfied: 0 },
      'bloodBank': { satisfied: 0, notSatisfied: 0 },
      'mortality': { satisfied: 0, notSatisfied: 0 }
    };
    Object.keys(departments).forEach(key => {
      updateDepartmentCard(key, departments[key]);
    });
    updateEmergencyChart(0, 0);
    return;
  }
  
  // تجميع البيانات حسب القسم - مع مطابقة محسّنة
  const departmentMap = {
    'outpatient': ['العيادات الخارجية', 'Outpatient', 'Outpatient Clinics', 'عيادات خارجية', 'outpatient', 'عيادة', 'clinic'],
    'radiology': ['الأشعة', 'Radiology', 'الأشعة والتصوير', 'radiology', 'imaging', 'x-ray', 'xray'],
    'homeMedicine': ['الطب المنزلي', 'Home Medicine', 'Home Care', 'طب منزلي', 'home', 'homecare'],
    'inpatient': ['أقسام التنويم', 'Inpatient', 'Inpatient Departments', 'تنويم', 'inpatient', 'ward', 'wards', 'أقسام'],
    'emergency': ['الطوارئ', 'Emergency', 'ER', 'Emergency Department', 'طوارئ', 'emergency', 'er', 'ed'],
    'dentistry': ['الأسنان', 'Dentistry', 'Dental', 'أسنان', 'dental', 'dentist'],
    'bloodBank': ['بنك الدم', 'Blood Bank', 'Blood', 'دم', 'blood', 'bloodbank', 'blood bank'],
    'mortality': ['الوفيات', 'Mortality', 'Death', 'وفاة', 'mortality', 'death']
  };
  
  // طباعة جميع الأقسام الفريدة في البيانات للمساعدة في التصحيح
  const allDepartments = [...new Set(pressganeyData.map(d => 
    (d.department_name_ar || d.department_name_en || d.department_key || '').trim()
  ).filter(d => d))];
  console.log('🔍 جميع الأقسام في البيانات:', allDepartments);
  
  Object.keys(departmentMap).forEach(key => {
    const keywords = departmentMap[key];
    const deptData = pressganeyData.filter(d => {
      const deptNameAr = (d.department_name_ar || '').toLowerCase().trim();
      const deptNameEn = (d.department_name_en || '').toLowerCase().trim();
      const deptKey = (d.department_key || '').toLowerCase().trim();
      
      // البحث في جميع الحقول
      const allNames = [deptNameAr, deptNameEn, deptKey].filter(n => n);
      
      return keywords.some(kw => {
        const kwLower = kw.toLowerCase();
        return allNames.some(name => name.includes(kwLower) || kwLower.includes(name));
      });
    });
    
    if (deptData.length > 0) {
      const scores = deptData.map(d => parseFloat(d.mean_score || 0)).filter(s => !isNaN(s) && s > 0);
      const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const satisfied = avgScore.toFixed(1);
      const notSatisfied = (100 - avgScore).toFixed(1);
      
      console.log(`✅ ${key}: وجد ${deptData.length} سجل، متوسط الرضا: ${satisfied}%`);
      
      updateDepartmentCard(key, { satisfied, notSatisfied });
      
      // تحديث رسم بياني خاص بالطوارئ
      if (key === 'emergency') {
        updateEmergencyChart(parseFloat(satisfied), parseFloat(notSatisfied));
      }
    } else {
      console.log(`❌ ${key}: لم يتم العثور على بيانات`);
      updateDepartmentCard(key, { satisfied: 0, notSatisfied: 0 });
      if (key === 'emergency') {
        updateEmergencyChart(0, 0);
      }
    }
  });
}

// تحديث بطاقة قسم واحد
function updateDepartmentCard(department, data) {
  const map = {
    'outpatient': { satisfied: 'outpatientSatisfied', notSatisfied: 'outpatientNotSatisfied' },
    'radiology': { satisfied: 'radiologySatisfied', notSatisfied: 'radiologyNotSatisfied' },
    'homeMedicine': { satisfied: 'homeMedicineSatisfied', notSatisfied: 'homeMedicineNotSatisfied' },
    'inpatient': { satisfied: 'inpatientSatisfied', notSatisfied: 'inpatientNotSatisfied' },
    'emergency': { satisfied: 'emergencySatisfied', notSatisfied: 'emergencyNotSatisfied' },
    'dentistry': { satisfied: 'dentistrySatisfied', notSatisfied: 'dentistryNotSatisfied' },
    'bloodBank': { satisfied: 'bloodBankSatisfied', notSatisfied: 'bloodBankNotSatisfied' },
    'mortality': { satisfied: 'mortalitySatisfied', notSatisfied: 'mortalityNotSatisfied' }
  };
  
  const ids = map[department];
  if (ids) {
    const satisfiedEl = document.getElementById(ids.satisfied);
    const notSatisfiedEl = document.getElementById(ids.notSatisfied);
    if (satisfiedEl) satisfiedEl.textContent = data.satisfied + '%';
    if (notSatisfiedEl) notSatisfiedEl.textContent = data.notSatisfied + '%';
  }
}

// تحديث الرسم البياني الدائري للطوارئ
function updateEmergencyChart(satisfied, notSatisfied) {
  const ctx = document.getElementById('emergencyChart');
  if (!ctx) return;
  
  if (emergencyChartInstance) {
    emergencyChartInstance.destroy();
  }
  
  emergencyChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['راضي', 'غير راضي'],
      datasets: [{
        data: [satisfied, notSatisfied],
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

// تحديث الجدول
function updateTable() {
  const tbody = document.querySelector('#pressganeyTable tbody');
  if (!tbody) return;
  
  if (!pressganeyData.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-3">لا توجد بيانات بعد</td></tr>';
    return;
  }
  
  // تجميع البيانات حسب القسم والسؤال والربع
  const byDeptQuestion = {};
  pressganeyData.forEach(d => {
    const dept = d.department_name_ar || d.department_key || 'غير محدد';
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
  
  // تجميع حسب القسم أولاً لعرض صف "إجمالي" لكل قسم
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

        // 🔍 البحث عن الصف اللي يحتوي على "Question" كبداية الأعمدة الحقيقية
        let headerRowIndex = rawRows.findIndex(r =>
          r.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('question'))
        );

        if (headerRowIndex === -1) {
          toast('تعذر العثور على صف الأعمدة (Question, Domain, ...)', 'error');
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

        const processed = [];

        for (const row of jsonData) {
          const question_text_en = (row['Question'] || '').toString().trim();
          const question_text_ar = (row['Question Ar'] || '').toString().trim();
          const department_name_en = (row['Domain'] || '').toString().trim();
          const department_name_ar = (row['Domain Ar'] || '').toString().trim();
          const nsize = parseInt(row['N-Size'] || 0);
          const mean_score = parseFloat(row['Meanscore'] || 0);
          const diff = parseFloat(row['Diff'] || 0);

          if (!question_text_en && !department_name_en) continue;

          const question_code = question_text_en
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');

          processed.push({
            department_key: department_name_en || department_name_ar || 'غير محدد',
            department_name_ar,
            department_name_en,
            question_code,
            question_text_en,
            question_text_ar,
            satisfied_count: nsize,
            not_satisfied_count: 0,
            mean_score,
            diff,
            quarter: 'Q2',
            year: 2025
          });
        }

        pressganeyData = [...pressganeyData, ...processed];
        
        // طباعة أسماء الأقسام الفعلية للمساعدة في التصحيح
        const uniqueDepartments = [...new Set(processed.map(d => d.department_name_ar || d.department_name_en || d.department_key))];
        console.log('📊 الأقسام الموجودة في Excel:', uniqueDepartments);
        
        updateSummary();
        updateChart();
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
    
    try {
      const quarter = lastImportedQuarter || 'Q1';
      const year = lastImportedYear || new Date().getFullYear();
      
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
  
  // تحميل البيانات
  loadData();
});

