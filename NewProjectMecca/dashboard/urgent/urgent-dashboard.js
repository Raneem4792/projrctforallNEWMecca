const API_BASE = window.API_BASE
  || (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : '');

const GRID_COLOR = 'rgba(148, 163, 184, 0.2)';
const FONT_FAMILY = 'Tajawal';
const chartRegistry = new Map();
const EMP_BAR_COLORS = [
  '#1D4ED8',
  '#2563EB',
  '#3B82F6',
  '#60A5FA',
  '#22C55E',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899'
];

if (window.Chart && window.ChartDataLabels) {
  Chart.register(window.ChartDataLabels);
}

function getAuthToken() {
  return localStorage.getItem('authToken') || localStorage.getItem('token') || '';
}

async function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');

  return fetch(url, {
    credentials: 'include',
    ...options,
    headers
  });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

// دالة لتنظيف النص العربي وإزالة الحركات والمسافات
function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u064B-\u0652]/g, "") // إزالة الحركات
    .replace(/\s+/g, "")             // إزالة المسافات
    .replace(/أ|إ|آ/g, "ا")          // توحيد الهمزات
    .replace(/ة/g, "ه")              // توحيد التاء المربوطة
    .toLowerCase();
}

function destroyChartById(canvasId) {
  const existingChart = chartRegistry.get(canvasId);
  if (existingChart) {
    existingChart.destroy();
    chartRegistry.delete(canvasId);
  }
}

function destroyAllCharts() {
  chartRegistry.forEach((chart) => chart.destroy());
  chartRegistry.clear();
}

function createChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`Canvas with id "${canvasId}" not found, skipping chart.`);
    return null;
  }
  destroyChartById(canvasId);
  const chart = new Chart(canvas, config);
  chartRegistry.set(canvasId, chart);
  return chart;
}

function formatArabicNumber(value) {
  return Number(value || 0).toLocaleString('ar-SA');
}

function stylizeBarDatasets(datasets, overrides = {}) {
  const defaults = {
    barThickness: overrides.barThickness ?? 14,
    maxBarThickness: overrides.maxBarThickness ?? 18,
    borderRadius: overrides.borderRadius ?? 12,
    borderSkipped: false
  };
  return datasets.map((dataset) => ({
    ...defaults,
    ...dataset
  }));
}

function buildBarOptions({
  horizontal = false,
  stacked = false,
  showLegend = false,
  legendPosition = 'bottom',
  padding = { top: 12, bottom: 8, left: 4, right: 10 }
} = {}) {
  // التحقق من الوضع الداكن
  const isDark = document.documentElement.classList.contains('dark') || 
                 document.documentElement.getAttribute('data-theme') === 'dark';
  
  // تحديد الألوان حسب الوضع
  const textColor = isDark ? '#FFFFFF' : '#0f172a';
  const secondaryTextColor = isDark ? '#E2E8F0' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : GRID_COLOR;
  
  const categoryAxis = {
    grid: { display: false },
    ticks: {
      color: textColor,
      font: { family: FONT_FAMILY, weight: 600 }
    }
  };

  const valueAxis = {
    beginAtZero: true,
    grid: { color: gridColor, drawBorder: false },
    ticks: {
      color: secondaryTextColor,
      font: { family: FONT_FAMILY },
      precision: 0
    }
  };

  const align = horizontal ? 'right' : 'top';

  return {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    indexAxis: horizontal ? 'y' : 'x',
    layout: { padding },
    plugins: {
      legend: {
        display: showLegend,
        position: legendPosition,
        labels: {
          font: { family: FONT_FAMILY, weight: 500 },
          color: textColor
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset?.label ? `${ctx.dataset.label}: ` : '';
            return ` ${label}${formatArabicNumber(ctx.raw)} بلاغ `;
          }
        }
      },
      datalabels: {
        anchor: 'end',
        align,
        clamp: true,
        offset: 4,
        color: textColor,
        font: { family: FONT_FAMILY, weight: 600, size: 13 },
        formatter: formatArabicNumber
      }
    },
    scales: horizontal
      ? {
        x: { ...valueAxis, stacked },
        y: { ...categoryAxis, stacked }
      }
      : {
        x: { ...categoryAxis, stacked },
        y: { ...valueAxis, stacked }
      }
  };
}

function renderKpiValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderError(message) {
  const containers = document.querySelectorAll('.chart-error');
  containers.forEach(c => (c.textContent = message));
}



let employeesMistreatmentAll = [];
let employeesMistreatmentByHospital = new Map();
let topEmployeesChart = null;

function populateMistreatmentFilters(hospitals = []) {
  const hospitalSelect = document.getElementById('mistreatmentEmployeesHospital');
  if (!hospitalSelect) return;

  const prevValue = hospitalSelect.value || 'all';
  hospitalSelect.innerHTML = '<option value="all">جميع المستشفيات</option>';

  hospitals.forEach((hospital) => {
    const option = document.createElement('option');
    option.value = hospital.id != null ? String(hospital.id) : '';
    option.textContent = hospital.name || 'مستشفى غير محدد';
    hospitalSelect.appendChild(option);
  });

  hospitalSelect.value = prevValue;
}

function getSelectedTopEmployeesSource() {
  const hospitalSelect = document.getElementById('mistreatmentEmployeesHospital');
  const topSelect = document.getElementById('mistreatmentEmployeesCount');
  const hospitalId = hospitalSelect?.value || 'all';
  const limit = Number(topSelect?.value || 8);

  let source = [];
  if (hospitalId === 'all') {
    source = employeesMistreatmentAll;
  } else if (employeesMistreatmentByHospital.has(hospitalId)) {
    source = employeesMistreatmentByHospital.get(hospitalId);
  }
  return source.slice(0, limit);
}

function renderTopEmployeesChart() {
  const canvas = document.getElementById('chartTopEmployeesMistreatment');
  if (!canvas) return;

  const rows = getSelectedTopEmployeesSource();
  const emptyState = document.getElementById('topEmployeesMistreatmentEmpty');

  if (!rows.length) {
    canvas.classList.add('hidden');
    emptyState?.classList.remove('hidden');
    destroyChartById('chartTopEmployeesMistreatment');
    topEmployeesChart = null;
    return;
  }

  canvas.classList.remove('hidden');
  emptyState?.classList.add('hidden');

  const labels = rows.map((row) => row.label || row.name || 'غير معروف');
  const values = rows.map((row) => row.count ?? 0);
  const chartTitle = 'أكثر الموظفين المبلغ عليهم (سوء تعامل)';

  destroyChartById('chartTopEmployeesMistreatment');
  const ctx = canvas.getContext('2d');

  // التحقق من الوضع الداكن
  const isDark = document.documentElement.classList.contains('dark') || 
                 document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#FFFFFF' : '#0f172a';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.05)';
  const titleColor = isDark ? '#FFFFFF' : '#002B5B';

  topEmployeesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'عدد البلاغات',
        data: values,
        backgroundColor: labels.map((_, i) => EMP_BAR_COLORS[i % EMP_BAR_COLORS.length]),
        borderColor: '#fff',
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 24,
        maxBarThickness: 28
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const element = elements[0];
          const index = element.index;
          const employeeName = labels[index];
          const complaintCount = values[index];
          
          // فتح modal تفاصيل الموظف
          openEmployeeDetailsModal(employeeName, complaintCount);
        }
      },
      onHover: (event, elements) => {
        // تغيير شكل المؤشر عند التمرير
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: chartTitle,
          font: { family: 'Tajawal', size: 16 },
          color: titleColor,
          padding: { bottom: 10 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label} : ${ctx.raw} بلاغ `,
            afterBody: () => 'انقر لعرض التفاصيل'
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { 
            stepSize: 1,
            color: textColor,
            font: { family: 'Tajawal' }
          },
          grid: { color: gridColor }
        },
        y: {
          ticks: { 
            font: { family: 'Tajawal' },
            color: textColor
          },
          grid: { display: false }
        }
      },
      animation: { duration: 600 }
    }
  });

  chartRegistry.set('chartTopEmployeesMistreatment', topEmployeesChart);
}

function attachMistreatmentFilterListeners() {
  const hospitalSelect = document.getElementById('mistreatmentEmployeesHospital');
  const topSelect = document.getElementById('mistreatmentEmployeesCount');

  hospitalSelect?.addEventListener('change', renderTopEmployeesChart);
  topSelect?.addEventListener('change', renderTopEmployeesChart);
}

async function loadUrgent() {
  try {
    const response = await authFetch(`${API_BASE}/api/dashboard/urgent/all`);
    if (response.status === 401) {
      renderError('يجب تسجيل الدخول للوصول إلى لوحة البلاغات الحرجة.');
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('📊 Received data:', data);
    
    const hospitals = safeArray(data.hospitals);
    const employees = safeArray(data.employees);
    const weekly = safeArray(data.weekly);
    const departments = safeArray(data.departments);
    const mistreatmentTime = safeArray(data.mistreatmentClosingTime);
    const mistreatmentSla = safeArray(data.mistreatmentSla);
    const labSla = safeArray(data.labSla);
    
    console.log('🏥 Hospitals:', hospitals.length);
    console.log('👥 Employees:', employees.length);
    console.log('⏱️ Mistreatment time data:', mistreatmentTime.length);
    console.log('📊 Mistreatment SLA data:', mistreatmentSla.length);
    console.log('🔬 Lab SLA data:', labSla.length);

    // تسجيل للتشخيص
    if (mistreatmentSla.length > 0) {
      console.log('📊 بيانات mistreatmentSla:', mistreatmentSla.map(h => ({
        name: h.name,
        within24: h.within24,
        over24: h.over24
      })));
    }

    renderKpiValue('kpi-total', data.totalUrgent ?? 0);
    renderKpiValue('kpi-time', `${data.avgClosureHours ?? 0} ساعة`);
    renderKpiValue('kpi-closure', `${data.closureRate ?? 0}%`);

    // تدمير الرسوم البيانية القديمة إذا وجدت
    destroyAllCharts();

    const hospitalLabels = hospitals.map(h => h.name || 'غير محدد');
    const hospitalCounts = hospitals.map(h => h.count ?? 0);
    const hospitalsChart = createChart('chartHospitals', {
      type: 'bar',
      data: {
        labels: hospitalLabels,
        datasets: stylizeBarDatasets([{
          label: 'عدد البلاغات الحرجة',
          data: hospitalCounts,
          backgroundColor: '#dc2626'
        }])
      },
      options: {
        ...buildBarOptions(),
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const element = elements[0];
            const index = element.index;
            const hospital = hospitals[index];
            if (hospital && hospital.id) {
              openUrgentComplaintsModal(hospital.id, hospital.name);
            }
          }
        },
        onHover: (event, elements) => {
          // تغيير شكل المؤشر عند التمرير
          event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          ...buildBarOptions().plugins,
          tooltip: {
            ...buildBarOptions().plugins?.tooltip,
            callbacks: {
              ...buildBarOptions().plugins?.tooltip?.callbacks,
              afterBody: () => 'انقر لعرض البلاغات'
            }
          }
        }
      }
    });


    createChart('chartUrgentOpenClosed', {
      type: 'bar',
      data: {
        labels: ['مغلقة', 'مفتوحة'],
        datasets: stylizeBarDatasets([{
          data: [data.closedUrgent ?? 0, data.openUrgent ?? 0],
          backgroundColor: ['#10b981', '#dc2626']
        }])
      },
      options: {
        ...buildBarOptions(),
        onClick: async (event, elements) => {
          if (elements && elements.length > 0) {
            const element = elements[0];
            const index = element.index; // 0 = مغلقة، 1 = مفتوحة
            const isClosed = index === 0;
            
            // فتح Modal مع جميع البلاغات المغلقة أو المفتوحة من جميع المستشفيات
            await openAllUrgentComplaintsModal(isClosed ? 'closed' : 'open');
          }
        },
        onHover: (event, elements) => {
          event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          ...buildBarOptions().plugins,
          tooltip: {
            ...buildBarOptions().plugins?.tooltip,
            callbacks: {
              ...buildBarOptions().plugins?.tooltip?.callbacks,
              afterBody: () => 'انقر لعرض البلاغات'
            }
          }
        }
      }
    });



    // رسم جديد: سوء التعامل خلال 24 ساعة والمتجاوز
    if (mistreatmentSla.length) {
      const slaData = mistreatmentSla.map(h => ({
        name: h.name || 'غير محدد',
        within24: Number(h.within24 || 0),
        over24: Number(h.over24 || 0),
        id: h.id
      }));

      // التحقق من الوضع الداكن
      const isDark = document.documentElement.classList.contains('dark') || 
                     document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#FFFFFF' : '#1f2937';
      const axisTextColor = isDark ? '#FFFFFF' : '#374151';
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(156, 163, 175, 0.3)';

      createChart('chartMistreatmentTime', {
        type: 'bar',
        data: {
          labels: slaData.map(h => h.name),
          datasets: [
            {
              label: 'مغلقة خلال 24 ساعة',
              data: slaData.map(h => h.within24),
              backgroundColor: '#10b981',
              borderColor: '#059669',
              borderWidth: 2,
              borderRadius: 10,
              borderSkipped: false,
              barThickness: 40,
              maxBarThickness: 50
            },
            {
              label: 'متجاوزة 24 ساعة',
              data: slaData.map(h => h.over24),
              backgroundColor: '#ef4444',
              borderColor: '#dc2626',
              borderWidth: 2,
              borderRadius: 10,
              borderSkipped: false,
              barThickness: 40,
              maxBarThickness: 50
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: true
          },
          onClick: async (event, elements) => {
            if (elements && elements.length > 0) {
              const element = elements[0];
              const index = element.index;
              const datasetIndex = element.datasetIndex;
              const hospital = slaData[index];
              if (hospital && hospital.id) {
                const within24 = datasetIndex === 0;
                const over24 = datasetIndex === 1;
                await openComplaintsModal(hospital.id, hospital.name, within24, over24);
              }
            }
          },
          onHover: (event, elements) => {
            event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { family: FONT_FAMILY, size: 14, weight: 600 },
                color: textColor,
                padding: 20,
                usePointStyle: true,
                pointStyle: 'rectRounded'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: '#374151',
              borderWidth: 1,
              cornerRadius: 12,
              displayColors: true,
              callbacks: {
                title: (tooltipItems) => {
                  return `🏥 ${tooltipItems[0].label}`;
                },
                label: (ctx) => {
                  if (ctx.datasetIndex === 0) {
                    return `✅ مغلقة خلال 24 ساعة: ${formatArabicNumber(ctx.raw)} بلاغ`;
                  }
                  return `❌ متجاوزة 24 ساعة: ${formatArabicNumber(ctx.raw)} بلاغ`;
                },
                afterBody: () => '👆 انقر لعرض تفاصيل البلاغات'
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: axisTextColor,
                font: { family: FONT_FAMILY, size: 12, weight: 600 },
                maxRotation: 45,
                minRotation: 0
              }
            },
            y: {
              beginAtZero: true,
              grid: { 
                color: gridColor,
                drawBorder: false 
              },
              ticks: {
                color: axisTextColor,
                font: { family: FONT_FAMILY, size: 11, weight: 600 },
                stepSize: 1,
                callback: function(value) {
                  return formatArabicNumber(value);
                }
              },
              title: {
                display: true,
                text: 'عدد البلاغات',
                color: axisTextColor,
                font: { family: FONT_FAMILY, size: 14, weight: 'bold' },
                padding: { bottom: 10 }
              }
            }
          },
          animation: {
            duration: 1000,
            easing: 'easeInOutQuart'
          }
        }
      });
    }

    // 🔬 رسم SLA المختبرات
    if (labSla.length) {
      const labSlaData = labSla.map(h => ({
        name: h.name || 'غير محدد',
        within24: Number(h.within24 || 0),
        over24: Number(h.over24 || 0),
        id: h.id
      }));

      // التحقق من الوضع الداكن
      const isDark = document.documentElement.classList.contains('dark') || 
                     document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#FFFFFF' : '#1f2937';
      const axisTextColor = isDark ? '#FFFFFF' : '#374151';
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(156, 163, 175, 0.3)';

      createChart('chartLabTime', {
        type: 'bar',
        data: {
          labels: labSlaData.map(h => h.name),
          datasets: [
            {
              label: 'مغلقة خلال 24 ساعة',
              data: labSlaData.map(h => h.within24),
              backgroundColor: '#10b981',
              borderColor: '#059669',
              borderWidth: 2,
              borderRadius: 10,
              borderSkipped: false,
              barThickness: 40,
              maxBarThickness: 50
            },
            {
              label: 'متجاوزة 24 ساعة',
              data: labSlaData.map(h => h.over24),
              backgroundColor: '#ef4444',
              borderColor: '#dc2626',
              borderWidth: 2,
              borderRadius: 10,
              borderSkipped: false,
              barThickness: 40,
              maxBarThickness: 50
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: true
          },
          onClick: async (event, elements) => {
            if (!elements || elements.length === 0) return;

            const element = elements[0];
            const hospitalIndex = element.index;
            const datasetIndex = element.datasetIndex; // 0 = الأخضر، 1 = الأحمر

            const hospital = labSlaData[hospitalIndex];
            if (!hospital || !hospital.id) return;

            const onlyWithin24 = datasetIndex === 0; // الأخضر
            const onlyOver24 = datasetIndex === 1;   // الأحمر

            await openLabComplaintsModal(
              hospital.id,
              hospital.name,
              onlyWithin24,
              onlyOver24
            );
          },
          onHover: (event, elements) => {
            event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { family: FONT_FAMILY, size: 14, weight: 600 },
                color: textColor,
                padding: 20,
                usePointStyle: true,
                pointStyle: 'rectRounded'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: '#374151',
              borderWidth: 1,
              cornerRadius: 12,
              displayColors: true,
              callbacks: {
                title: (tooltipItems) => {
                  return `🏥 ${tooltipItems[0].label}`;
                },
                label: (ctx) => {
                  if (ctx.datasetIndex === 0) {
                    return `✅ مغلقة خلال 24 ساعة: ${formatArabicNumber(ctx.raw)} بلاغ`;
                  }
                  return `❌ متجاوزة 24 ساعة: ${formatArabicNumber(ctx.raw)} بلاغ`;
                },
                afterBody: () => '👆 انقر لعرض تفاصيل البلاغات'
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: axisTextColor,
                font: { family: FONT_FAMILY, size: 12, weight: 600 },
                maxRotation: 45,
                minRotation: 0
              }
            },
            y: {
              beginAtZero: true,
              grid: { 
                color: gridColor,
                drawBorder: false 
              },
              ticks: {
                color: axisTextColor,
                font: { family: FONT_FAMILY, size: 11, weight: 600 },
                stepSize: 1,
                callback: function(value) {
                  return formatArabicNumber(value);
                }
              },
              title: {
                display: true,
                text: 'عدد البلاغات',
                color: axisTextColor,
                font: { family: FONT_FAMILY, size: 14, weight: 'bold' },
                padding: { bottom: 10 }
              }
            }
          },
          animation: {
            duration: 1000,
            easing: 'easeInOutQuart'
          }
        }
      });
    }

    // (1) مقارنة سوء التعامل + الأدوية لكل مستشفى
    const subTypesChart = createChart('chartSubPerHospital', {
      type: 'bar',
      data: {
        labels: data.subTypesByHospital.map(h => h.name),
        datasets: stylizeBarDatasets([
          {
            label: 'سوء تعامل',
            data: data.subTypesByHospital.map(h => h.mistreatment),
            backgroundColor: '#dc2626'
          },
          {
            label: 'بلاغات الأدوية',
            data: data.subTypesByHospital.map(h => h.medicine),
            backgroundColor: '#f59e0b'
          }
        ])
      },
      options: {
        ...buildBarOptions({ showLegend: true, legendPosition: 'top' }),
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const element = elements[0];
            const index = element.index; // فهرس المستشفى
            const datasetIndex = element.datasetIndex; // 0 لسوء التعامل، 1 للأدوية
            const hospital = data.subTypesByHospital[index];
            
            if (hospital && hospital.id) {
              if (datasetIndex === 0) {
                // سوء تعامل
                openComplaintsModal(hospital.id, hospital.name);
              } else if (datasetIndex === 1) {
                // بلاغات الأدوية
                openMedicineComplaintsModal(hospital.id, hospital.name);
              }
            }
          }
        },
        onHover: (event, elements) => {
          event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          ...buildBarOptions({ showLegend: true, legendPosition: 'top' }).plugins,
          tooltip: {
            ...buildBarOptions({ showLegend: true, legendPosition: 'top' }).plugins?.tooltip,
            callbacks: {
              ...buildBarOptions({ showLegend: true, legendPosition: 'top' }).plugins?.tooltip?.callbacks,
              afterBody: () => 'انقر لعرض البلاغات'
            }
          }
        }
      }
    });

    // (2) أعلى المستشفيات في سوء التعامل
    const sortedMistreatment = data.subTypesByHospital
      .slice()
      .sort((a, b) => b.mistreatment - a.mistreatment);

    createChart('chartTopMistreatment', {
      type: 'bar',
      data: {
        labels: sortedMistreatment.map(h => h.name),
        datasets: stylizeBarDatasets([{
          label: 'سوء تعامل',
          data: sortedMistreatment.map(h => h.mistreatment),
          backgroundColor: '#dc2626'
        }])
      },
      options: {
        ...buildBarOptions({ horizontal: true }),
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const element = elements[0];
            const index = element.index;
            const hospital = sortedMistreatment[index];
            if (hospital && hospital.id) {
              openComplaintsModal(hospital.id, hospital.name);
            }
          }
        },
        onHover: (event, elements) => {
          event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          ...buildBarOptions({ horizontal: true }).plugins,
          tooltip: {
            ...buildBarOptions({ horizontal: true }).plugins?.tooltip,
            callbacks: {
              ...buildBarOptions({ horizontal: true }).plugins?.tooltip?.callbacks,
              afterBody: () => 'انقر لعرض البلاغات'
            }
          }
        }
      }
    });

    // (3) أعلى المستشفيات في بلاغات الأدوية
    const sortedMedicine = data.subTypesByHospital
      .slice()
      .sort((a, b) => b.medicine - a.medicine);

    createChart('chartTopMedicine', {
      type: 'bar',
      data: {
        labels: sortedMedicine.map(h => h.name),
        datasets: stylizeBarDatasets([{
          label: 'بلاغات الأدوية',
          data: sortedMedicine.map(h => h.medicine),
          backgroundColor: '#f59e0b'
        }])
      },
      options: {
        ...buildBarOptions({ horizontal: true }),
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const element = elements[0];
            const index = element.index;
            const hospital = sortedMedicine[index];
            if (hospital && hospital.id) {
              openMedicineComplaintsModal(hospital.id, hospital.name);
            }
          }
        },
        onHover: (event, elements) => {
          event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          ...buildBarOptions({ horizontal: true }).plugins,
          tooltip: {
            ...buildBarOptions({ horizontal: true }).plugins?.tooltip,
            callbacks: {
              ...buildBarOptions({ horizontal: true }).plugins?.tooltip?.callbacks,
              afterBody: () => 'انقر لعرض البلاغات'
            }
          }
        }
      }
    });

    // (4) أكثر الموظفين تكرارًا في بلاغات سوء التعامل
    const mistreatmentAllSource =
      data.employeesMistreatmentAll
      ?? data.employeesMistreatment
      ?? data.employees;
    employeesMistreatmentAll = safeArray(mistreatmentAllSource);

    const mistreatmentByHospitalSource =
      data.employeesMistreatmentByHospital
      ?? data.employeesByHospital
      ?? [];

    employeesMistreatmentByHospital = new Map(
      safeArray(mistreatmentByHospitalSource).map((item) => [
        item.hospitalId != null ? String(item.hospitalId) : '',
        safeArray(item.employees || item.items || [])
      ])
    );
    populateMistreatmentFilters(hospitals.length ? hospitals : (data.subTypesByHospital?.map(h => ({
      id: h.id,
      name: h.name
    })) || []));
    attachMistreatmentFilterListeners();
    renderTopEmployeesChart();

    // =====================
    // 🎯 بلاغات التحرش حسب المستشفى
    // =====================
    try {
      // استخدام البيانات الجاهزة من API بدلاً من جلب البلاغات يدوياً
      const harassmentData = safeArray(data.harassment || []).map(h => ({
        id: h.id,
        name: h.name,
        within24: Number(h.within24 || 0),
        over24: Number(h.over24 || 0)
      }));

      // رسم المخطط
      if (harassmentData.length > 0) {
        // التحقق من الوضع الداكن
        const isDark = document.documentElement.classList.contains('dark') || 
                       document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#FFFFFF' : '#1f2937';
        const axisTextColor = isDark ? '#FFFFFF' : '#374151';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(156, 163, 175, 0.3)';

        createChart('chartHarassment', {
          type: 'bar',
          data: {
            labels: harassmentData.map(h => h.name),
            datasets: [
              {
                label: 'مغلقة خلال 24 ساعة',
                data: harassmentData.map(h => h.within24),
                backgroundColor: '#10b981',
                borderColor: '#059669',
                borderWidth: 2,
                borderRadius: 10,
                borderSkipped: false,
                barThickness: 40,
                maxBarThickness: 50
              },
              {
                label: 'متجاوزة 24 ساعة',
                data: harassmentData.map(h => h.over24),
                backgroundColor: '#ef4444',
                borderColor: '#dc2626',
                borderWidth: 2,
                borderRadius: 10,
                borderSkipped: false,
                barThickness: 40,
                maxBarThickness: 50
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index',
              intersect: false
            },
            onClick: async (event, elements) => {
              if (!elements || !elements.length) return;

              const el = elements[0];
              const index = el.index;
              const datasetIndex = el.datasetIndex;

              const hospital = harassmentData[index];
              if (!hospital || !hospital.id) return;

              const onlyWithin24 = datasetIndex === 0;
              const onlyOver24 = datasetIndex === 1;

              // فتح Modal للنتائج
              await openHarassmentModal(
                hospital.id,
                hospital.name,
                onlyWithin24,
                onlyOver24
              );
            },
            onHover: (event, elements) => {
              event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  font: { family: FONT_FAMILY, size: 14, weight: 600 },
                  color: textColor,
                  padding: 20,
                  usePointStyle: true,
                  pointStyle: 'rectRounded'
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                borderColor: '#374151',
                borderWidth: 1,
                cornerRadius: 12,
                displayColors: true,
                callbacks: {
                  title: (tooltipItems) => {
                    return `🏥 ${tooltipItems[0].label}`;
                  },
                  label: (ctx) => {
                    if (ctx.datasetIndex === 0) {
                      return `✅ مغلقة خلال 24 ساعة: ${formatArabicNumber(ctx.raw)} بلاغ`;
                    }
                    return `❌ متجاوزة 24 ساعة: ${formatArabicNumber(ctx.raw)} بلاغ`;
                  },
                  afterBody: () => '👆 انقر لعرض تفاصيل البلاغات'
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  color: axisTextColor,
                  font: { family: FONT_FAMILY, size: 12, weight: 600 },
                  maxRotation: 45,
                  minRotation: 0
                }
              },
              y: {
                beginAtZero: true,
                grid: { 
                  color: gridColor,
                  drawBorder: false 
                },
                ticks: {
                  color: axisTextColor,
                  font: { family: FONT_FAMILY, size: 11, weight: 600 },
                  stepSize: 1,
                  callback: function(value) {
                    return formatArabicNumber(value);
                  }
                },
                title: {
                  display: true,
                  text: 'عدد البلاغات',
                  color: axisTextColor,
                  font: { family: FONT_FAMILY, size: 14, weight: 'bold' },
                  padding: { bottom: 10 }
                }
              }
            },
            animation: {
              duration: 1000,
              easing: 'easeInOutQuart'
            }
          }
        });
      }

    } catch (err) {
      console.error("خطأ في رسم التحرش:", err);
    }

  } catch (error) {
    console.error('Failed to load urgent dashboard data:', error);
    renderError('لم يتم تحميل بيانات البلاغات الحرجة. يرجى المحاولة لاحقاً.');
  }
}

// ========================================
// Modal البلاغات
// ========================================

async function openComplaintsModal(hospitalId, hospitalName, within24 = false, over24 = false) {
  const modal = document.getElementById('complaintsModal');
  const modalTitleElement = document.getElementById('modal-title');
  const modalTitle = document.getElementById('modal-hospital-name');
  const loading = document.getElementById('complaintsModalLoading');
  const empty = document.getElementById('complaintsModalEmpty');
  const content = document.getElementById('complaintsModalContent');
  const list = document.getElementById('complaints-list');

  // تغيير عنوان الـ Modal لبلاغات سوء التعامل
  if (modalTitleElement) {
    let titleText = 'بلاغات سوء التعامل';
    if (within24) titleText += ' (مغلقة خلال 24 ساعة)';
    if (over24) titleText += ' (متجاوزة 24 ساعة)';
    modalTitleElement.innerHTML = `${titleText} - <span id="modal-hospital-name"></span>`;
  }

  // إظهار الـ Modal
  modal.classList.remove('hidden');
  // تحديث اسم المستشفى بعد إعادة إنشاء span
  const updatedTitle = document.getElementById('modal-hospital-name');
  if (updatedTitle) {
    updatedTitle.textContent = hospitalName || 'غير محدد';
  }

  // إخفاء المحتوى وإظهار التحميل
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');
  list.innerHTML = '';

  try {
    // جلب البلاغات
    let complaints = await loadComplaintsForHospital(hospitalId);

    // تصفية حسب SLA إذا تم التحديد
    if (within24 || over24) {
      complaints = complaints.filter(c => {
        const status = String(c.StatusCode || c.status || '').toUpperCase();
        const isClosed = ['CLOSED', 'RESOLVED', 'CANCELLED', 'مغلق', 'محلول', 'منتهي', 'مكتمل']
          .some(s => status.includes(s));

        // تحسين حساب الساعات لمطابقة المنطق في المخطط البياني
        let hours = 9999;
        const actualHours = Number(c.ActualClosingHours ?? c.actualClosingHours);

        if (!isNaN(actualHours) && actualHours > 0) {
           hours = actualHours;
        } else {
           // حساب تقريبي في حال عدم توفر ActualClosingHours
           let createdStr = String(c.createdAt || c.CreatedAt || '');
           // إصلاح صيغة التاريخ للمتصفحات (استبدال المسافة بـ T)
           if (createdStr.indexOf('T') === -1) createdStr = createdStr.replace(' ', 'T');
           
           const created = new Date(createdStr);
           
           // استخدام تاريخ التحديث كتقريب لتاريخ الإغلاق للبلاغات المغلقة
           let endStr = String(c.lastUpdate || c.UpdatedAt || '');
           if (endStr.indexOf('T') === -1) endStr = endStr.replace(' ', 'T');
           
           const end = isClosed && endStr ? new Date(endStr) : new Date();
           
           if (!isNaN(created.getTime())) {
             const diffMs = end - created;
             if (diffMs > 0) {
               hours = diffMs / (1000 * 60 * 60);
             }
           }
        }

        if (within24) {
          // يجب أن تكون مغلقة وخلال 24 ساعة
          return isClosed && hours <= 24;
        }
        if (over24) {
          // إما غير مغلقة (مفتوحة) أو مغلقة وتجاوزت 24 ساعة
          // ملاحظة: حسب منطق المخطط، البلاغات المفتوحة تُحتسب ضمن "المتجاوزة" أو التي تحتاج انتباه
          return !isClosed || hours > 24;
        }
        return true;
      });
    }
    
    // إخفاء التحميل
    loading.classList.add('hidden');

    if (!complaints || complaints.length === 0) {
      empty.classList.remove('hidden');
    } else {
      content.classList.remove('hidden');
      renderComplaintsList(complaints);
    }
  } catch (error) {
    console.error('خطأ في جلب البلاغات:', error);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = '<p class="text-red-600">حدث خطأ في تحميل البلاغات</p>';
  }
}

function closeComplaintsModal() {
  const modal = document.getElementById('complaintsModal');
  modal.classList.add('hidden');
}

async function loadComplaintsForHospital(hospitalId) {
  try {
    // استخدام API history مع فلاتر
    const response = await authFetch(
      `${API_BASE}/api/complaints/history?hospitalId=${hospitalId}&pageSize=100`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const allComplaints = safeArray(data.items || []);

    // فلترة بلاغات سوء التعامل (ComplaintTypeID = 3 أو 17 أو SubTypeID = 15)
    const mistreatmentComplaints = allComplaints.filter(complaint => {
      const typeId = complaint.type || complaint.ComplaintTypeID;
      const subTypeId = complaint.subTypeId || complaint.SubTypeID;
      // إضافة التحقق من PriorityCode أيضًا لتكون متوافقة مع الرسوم البيانية
      // PriorityCode يجب أن يكون URGENT, CRITICAL, HIGH
      const priority = (complaint.priority || complaint.PriorityCode || '').toUpperCase();
      const isUrgent = priority === 'URGENT' || priority === 'CRITICAL' || priority === 'HIGH';

      const isMistreatment = typeId === 17 || subTypeId === 15 || subTypeId === 29 || subTypeId === 8;
      
      // يجب أن يكون سوء تعامل + عاجل
      return isMistreatment && isUrgent;
    });

    return mistreatmentComplaints;
  } catch (error) {
    console.error('خطأ في loadComplaintsForHospital:', error);
    throw error;
  }
}

function renderComplaintsList(complaints) {
  const list = document.getElementById('complaints-list');
  list.innerHTML = '';

  if (complaints.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'text-center py-8 text-gray-500';
    emptyDiv.textContent = 'لا توجد بلاغات';
    list.appendChild(emptyDiv);
    return;
  }

  complaints.forEach((complaint, index) => {
    const item = document.createElement('div');
    item.className = 'border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all bg-white';
    item.onclick = () => openComplaintDetails(complaint);

    const ticket = complaint.ticket || complaint.TicketNumber || `#${complaint.id || complaint.ComplaintID}`;
    const patientName = complaint.fullName || complaint.PatientFullName || 'غير محدد';
    const status = (complaint.status || complaint.StatusCode || 'open').toLowerCase();
    const createdAt = complaint.createdAt || complaint.CreatedAt || '';
    const description = complaint.Description || complaint.description || '';
    const priority = complaint.priority || complaint.PriorityCode || 'MEDIUM';

    const statusColors = {
      'open': 'bg-blue-100 text-blue-800',
      'closed': 'bg-gray-100 text-gray-800',
      'in_progress': 'bg-yellow-100 text-yellow-800',
      'resolved': 'bg-green-100 text-green-800',
      'مفتوح': 'bg-blue-100 text-blue-800',
      'مغلق': 'bg-gray-100 text-gray-800',
      'قيد المعالجة': 'bg-yellow-100 text-yellow-800',
      'محلول': 'bg-green-100 text-green-800'
    };

    const statusText = {
      'open': 'مفتوح',
      'closed': 'مغلق',
      'in_progress': 'قيد المعالجة',
      'resolved': 'محلول',
      'مفتوح': 'مفتوح',
      'مغلق': 'مغلق',
      'قيد المعالجة': 'قيد المعالجة',
      'محلول': 'محلول'
    };

    const statusClass = statusColors[status] || 'bg-gray-100 text-gray-800';
    const statusLabel = statusText[status] || status;

    const priorityBadge = priority && priority.toUpperCase() === 'URGENT' 
      ? '<span class="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 mr-2">عاجل</span>'
      : '';

    item.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            <span class="font-bold text-gray-900" style="color:#002B5B">${ticket}</span>
            ${priorityBadge}
            <span class="text-xs px-2 py-1 rounded-full ${statusClass}">${statusLabel}</span>
          </div>
          <p class="text-sm font-medium text-gray-800 mb-1">${patientName}</p>
          ${description ? `<p class="text-xs text-gray-600 mb-2 line-clamp-2">${description.substring(0, 100)}${description.length > 100 ? '...' : ''}</p>` : ''}
          ${createdAt ? `<p class="text-xs text-gray-500 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ${createdAt}
          </p>` : ''}
        </div>
        <svg class="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </div>
    `;

    list.appendChild(item);
  });
}

async function openHarassmentModal(hospitalId, hospitalName, within24, over24) {
  const modal = document.getElementById('complaintsModal');
  const loading = document.getElementById('complaintsModalLoading');
  const empty = document.getElementById('complaintsModalEmpty');
  const content = document.getElementById('complaintsModalContent');
  const list = document.getElementById('complaints-list');

  modal.classList.remove('hidden');

  const modalTitleElement = document.getElementById('modal-title');
  if (modalTitleElement) {
    modalTitleElement.innerHTML =
      (within24 ? 'بلاغات التحرش مغلقة خلال 24 ساعة - ' : 'بلاغات التحرش متجاوزة 24 ساعة - ') +
      `<span id="modal-hospital-name">${hospitalName}</span>`;
  }

  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');
  list.innerHTML = '';

  try {
    // استخدام API الجديد المخصص لبلاغات التحرش
    const response = await authFetch(
      `${API_BASE}/api/dashboard/urgent/harassment/details/${hospitalId}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const all = safeArray(data.items || []);

    // لا حاجة للفلترة - البيانات جاهزة من API
    let filtered = all;

    // فلترة SLA
    filtered = filtered.filter(c => {
      const hours = Number(c.ActualClosingHours ?? 9999);
      const status = String(c.StatusCode || c.status || '').toUpperCase();
      const isClosed = ['CLOSED', 'RESOLVED', 'CANCELLED', 'مغلق', 'محلول', 'مكتمل', 'منتهي']
        .some(s => status.includes(s));

      if (within24) {
        return isClosed && hours <= 24;
      }

      if (over24) {
        return !isClosed || hours > 24;
      }

      return true;
    });

    loading.classList.add('hidden');

    if (!filtered.length) {
      empty.classList.remove('hidden');
      return;
    }

    content.classList.remove('hidden');
    renderComplaintsList(filtered);

  } catch (err) {
    console.error('خطأ في openHarassmentModal:', err);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = '<p class="text-red-600">حدث خطأ في تحميل البلاغات</p>';
  }
}

async function openLabComplaintsModal(hospitalId, hospitalName, within24, over24) {
  const modal = document.getElementById('complaintsModal');
  const loading = document.getElementById('complaintsModalLoading');
  const empty = document.getElementById('complaintsModalEmpty');
  const content = document.getElementById('complaintsModalContent');
  const list = document.getElementById('complaints-list');

  modal.classList.remove('hidden');

  // عنوان المودال
  const modalTitleElement = document.getElementById('modal-title');
  if (modalTitleElement) {
    modalTitleElement.innerHTML =
      (within24 ? 'بلاغات المختبر مغلقة خلال 24 ساعة - ' : 'بلاغات المختبر متجاوزة 24 ساعة - ') +
      `<span id="modal-hospital-name">${hospitalName}</span>`;
  }

  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');
  list.innerHTML = '';

  try {
    // جلب جميع البلاغات الحرجة للمستشفى
    const response = await authFetch(
      `${API_BASE}/api/complaints/history?hospitalId=${hospitalId}&pageSize=500`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const all = safeArray(data.items || []);

    // فلترة المختبرات فقط
    let filtered = all.filter(c => {
      const subTypeName = String(c.subTypeName || c.SubTypeName || '').toLowerCase();
      const typeId = Number(c.type || c.ComplaintTypeID);
      return typeId === 16 || // 16 = إجراءات متعلقة بالتحاليل المخبرية
             subTypeName.includes('تحاليل') ||
             subTypeName.includes('الفحوصات') ||
             subTypeName.includes('مخبري') ||
             subTypeName.includes('مختبر');
    });

    // فلترة حسب SLA
    filtered = filtered.filter(c => {
      const status = String(c.StatusCode || c.status || '').toUpperCase();
      const isClosed = ['CLOSED', 'RESOLVED', 'CANCELLED', 'مغلق', 'محلول', 'منتهي', 'مكتمل']
        .some(s => status.includes(s));

      // تحسين حساب الساعات لمطابقة المنطق في المخطط البياني
      let hours = 9999;
      const actualHours = Number(c.ActualClosingHours ?? c.actualClosingHours);

      if (!isNaN(actualHours) && actualHours > 0) {
         hours = actualHours;
      } else {
         // حساب تقريبي في حال عدم توفر ActualClosingHours
         let createdStr = String(c.createdAt || c.CreatedAt || '');
         // إصلاح صيغة التاريخ للمتصفحات (استبدال المسافة بـ T)
         if (createdStr.indexOf('T') === -1) createdStr = createdStr.replace(' ', 'T');
         
         const created = new Date(createdStr);
         
         // استخدام تاريخ التحديث كتقريب لتاريخ الإغلاق للبلاغات المغلقة
         let endStr = String(c.lastUpdate || c.UpdatedAt || '');
         if (endStr.indexOf('T') === -1) endStr = endStr.replace(' ', 'T');
         
         const end = isClosed && endStr ? new Date(endStr) : new Date();
         
         if (!isNaN(created.getTime())) {
           const diffMs = end - created;
           if (diffMs > 0) {
             hours = diffMs / (1000 * 60 * 60);
           }
         }
      }

      if (within24) {
        return isClosed && hours <= 24;
      }

      if (over24) {
        return !isClosed || hours > 24;
      }

      return true;
    });

    loading.classList.add('hidden');

    if (!filtered.length) {
      empty.classList.remove('hidden');
      return;
    }

    content.classList.remove('hidden');
    renderComplaintsList(filtered);

  } catch (err) {
    console.error('خطأ في openLabComplaintsModal:', err);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = '<p class="text-red-600">حدث خطأ في تحميل البلاغات</p>';
  }
}

function openComplaintDetails(complaint) {
  // إغلاق الـ Modal أولاً
  closeComplaintsModal();

  // فتح صفحة تفاصيل البلاغ - استخدام complaint-details.html
  const ticket = complaint.ticket || complaint.TicketNumber || '';
  const hospitalId = complaint.hospitalId || complaint.HospitalID || complaint.hospitalId;

  // التأكد من وجود ticket (مطلوب لصفحة complaint-details.html)
  if (!ticket) {
    console.error('لا يمكن فتح التفاصيل: لا يوجد رقم البلاغ (TicketNumber)');
    alert('خطأ: لا يمكن العثور على رقم البلاغ');
    return;
  }

  // بناء رابط صفحة complaint-details.html
  // المسار النسبي: من dashboard/urgent/ إلى public/complaints/history/
  let detailsUrl = '../../public/complaints/history/complaint-details.html';
  const params = new URLSearchParams();
  params.set('ticket', ticket);
  
  if (hospitalId) {
    params.set('hid', String(hospitalId));
  }

  detailsUrl += '?' + params.toString();
  
  console.log('🔗 فتح صفحة تفاصيل البلاغ:', detailsUrl);
  
  // الانتقال لصفحة التفاصيل
  window.location.href = detailsUrl;
}

// ========================================
// Modal البلاغات الحرجة (لرسم المستشفيات)
// ========================================

async function openUrgentComplaintsModal(hospitalId, hospitalName) {
  const modal = document.getElementById('complaintsModal');
  const modalTitleElement = document.getElementById('modal-title');
  const loading = document.getElementById('complaintsModalLoading');
  const empty = document.getElementById('complaintsModalEmpty');
  const content = document.getElementById('complaintsModalContent');
  const list = document.getElementById('complaints-list');

  // تغيير عنوان الـ Modal للبلاغات الحرجة
  if (modalTitleElement) {
    modalTitleElement.innerHTML = 'البلاغات الحرجة - <span id="modal-hospital-name"></span>';
  }

  // إظهار الـ Modal
  modal.classList.remove('hidden');
  // تحديث اسم المستشفى بعد إعادة إنشاء span
  const updatedTitle = document.getElementById('modal-hospital-name');
  if (updatedTitle) {
    updatedTitle.textContent = hospitalName || 'غير محدد';
  }

  // إخفاء المحتوى وإظهار التحميل
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');
  list.innerHTML = '';

  try {
    // جلب البلاغات الحرجة
    const complaints = await loadUrgentComplaintsForHospital(hospitalId);
    
    // إخفاء التحميل
    loading.classList.add('hidden');

    if (!complaints || complaints.length === 0) {
      empty.classList.remove('hidden');
    } else {
      content.classList.remove('hidden');
      renderComplaintsList(complaints);
    }
  } catch (error) {
    console.error('خطأ في جلب البلاغات الحرجة:', error);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = '<p class="text-red-600">حدث خطأ في تحميل البلاغات</p>';
  }
}

async function loadUrgentComplaintsForHospital(hospitalId) {
  try {
    // استخدام API history مع فلاتر للبلاغات الحرجة
    const response = await authFetch(
      `${API_BASE}/api/complaints/history?hospitalId=${hospitalId}&pageSize=100`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const allComplaints = safeArray(data.items || []);

    // فلترة البلاغات الحرجة (PriorityCode = URGENT, CRITICAL, HIGH)
    const urgentComplaints = allComplaints.filter(complaint => {
      const priority = (complaint.priority || complaint.PriorityCode || '').toUpperCase();
      return priority === 'URGENT' || priority === 'CRITICAL' || priority === 'HIGH';
    });

    return urgentComplaints;
  } catch (error) {
    console.error('خطأ في loadUrgentComplaintsForHospital:', error);
    throw error;
  }
}

// ========================================
// Modal بلاغات الأدوية
// ========================================

async function openMedicineComplaintsModal(hospitalId, hospitalName) {
  const modal = document.getElementById('complaintsModal');
  const modalTitleElement = document.getElementById('modal-title');
  const loading = document.getElementById('complaintsModalLoading');
  const empty = document.getElementById('complaintsModalEmpty');
  const content = document.getElementById('complaintsModalContent');
  const list = document.getElementById('complaints-list');

  // تغيير عنوان الـ Modal لبلاغات الأدوية
  if (modalTitleElement) {
    modalTitleElement.innerHTML = 'بلاغات الأدوية - <span id="modal-hospital-name"></span>';
  }

  // إظهار الـ Modal
  modal.classList.remove('hidden');
  // تحديث اسم المستشفى بعد إعادة إنشاء span
  const updatedTitle = document.getElementById('modal-hospital-name');
  if (updatedTitle) {
    updatedTitle.textContent = hospitalName || 'غير محدد';
  }

  // إخفاء المحتوى وإظهار التحميل
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');
  list.innerHTML = '';

  try {
    // جلب بلاغات الأدوية
    const complaints = await loadMedicineComplaintsForHospital(hospitalId);
    
    // إخفاء التحميل
    loading.classList.add('hidden');

    if (!complaints || complaints.length === 0) {
      empty.classList.remove('hidden');
    } else {
      content.classList.remove('hidden');
      renderComplaintsList(complaints);
    }
  } catch (error) {
    console.error('خطأ في جلب بلاغات الأدوية:', error);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = '<p class="text-red-600">حدث خطأ في تحميل البلاغات</p>';
  }
}

async function loadMedicineComplaintsForHospital(hospitalId) {
  try {
    // استخدام API history مع فلاتر لبلاغات الأدوية
    const response = await authFetch(
      `${API_BASE}/api/complaints/history?hospitalId=${hospitalId}&pageSize=100`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const allComplaints = safeArray(data.items || []);

    // فلترة بلاغات الأدوية (ComplaintTypeID = 6)
    const medicineComplaints = allComplaints.filter(complaint => {
      const typeId = complaint.type || complaint.ComplaintTypeID;
      return typeId === 6;
    });

    return medicineComplaints;
  } catch (error) {
    console.error('خطأ في loadMedicineComplaintsForHospital:', error);
    throw error;
  }
}

// ========================================
// Modal جميع البلاغات المغلقة/المفتوحة
// ========================================

async function openAllUrgentComplaintsModal(statusType) {
  const modal = document.getElementById('complaintsModal');
  const modalTitleElement = document.getElementById('modal-title');
  const loading = document.getElementById('complaintsModalLoading');
  const empty = document.getElementById('complaintsModalEmpty');
  const content = document.getElementById('complaintsModalContent');
  const list = document.getElementById('complaints-list');

  // تغيير عنوان الـ Modal
  const statusLabel = statusType === 'closed' ? 'المغلقة' : 'المفتوحة';
  if (modalTitleElement) {
    modalTitleElement.innerHTML = `جميع البلاغات الحرجة ${statusLabel} - <span id="modal-hospital-name">جميع المستشفيات</span>`;
  }

  // إظهار الـ Modal
  modal.classList.remove('hidden');

  // إخفاء المحتوى وإظهار التحميل
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');
  list.innerHTML = '';

  try {
    // جلب جميع البلاغات المغلقة أو المفتوحة من جميع المستشفيات
    const complaints = await loadAllUrgentComplaintsByStatus(statusType);
    
    // إخفاء التحميل
    loading.classList.add('hidden');

    if (!complaints || complaints.length === 0) {
      empty.classList.remove('hidden');
    } else {
      content.classList.remove('hidden');
      renderComplaintsList(complaints);
    }
  } catch (error) {
    console.error('خطأ في جلب البلاغات:', error);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = '<p class="text-red-600">حدث خطأ في تحميل البلاغات</p>';
  }
}

async function loadAllUrgentComplaintsByStatus(statusType) {
  try {
    // استخدام API history بدون فلترة hospitalId للحصول على جميع البلاغات
    // نستخدم ALL للحصول على جميع البلاغات ثم نفلترها
    const response = await authFetch(
      `${API_BASE}/api/complaints/history?status=ALL&pageSize=200`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const allComplaints = safeArray(data.items || []);

    // فلترة البلاغات الحرجة حسب الحالة المطلوبة
    const urgentComplaints = allComplaints.filter(complaint => {
      const priority = (complaint.priority || complaint.PriorityCode || '').toUpperCase();
      const isUrgent = priority === 'URGENT' || priority === 'CRITICAL' || priority === 'HIGH';
      
      if (!isUrgent) return false;
      
      // فلترة حسب الحالة المطلوبة
      const status = (complaint.status || complaint.StatusCode || '').toUpperCase();
      const isClosed = status === 'CLOSED' || status === 'RESOLVED' || status === 'CANCELLED';
      
      if (statusType === 'closed') {
        return isClosed;
      } else {
        return !isClosed;
      }
    });

    return urgentComplaints;
  } catch (error) {
    console.error('خطأ في loadAllUrgentComplaintsByStatus:', error);
    throw error;
  }
}

// ========================================
// Modal تفاصيل الموظف
// ========================================

async function openEmployeeDetailsModal(employeeName, complaintCount) {
  const modal = document.getElementById('employeeDetailsModal');
  const content = document.getElementById('employeeDetailsContent');
  
  // إظهار الـ Modal
  modal.classList.remove('hidden');
  
  // إظهار حالة التحميل
  content.innerHTML = `
    <div class="border-l-4 border-red-500 bg-gray-50 p-4 mb-4">
      <h4 class="text-xl font-bold text-gray-800 mb-1">${employeeName}</h4>
      <p class="text-sm text-gray-600">بيانات الموظف المبلغ عليه</p>
    </div>
    
    <div class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
      <p class="mt-4 text-gray-600">جاري تحميل البلاغات...</p>
    </div>
  `;
  
  try {
    // جلب بلاغات الموظف
    const complaints = await loadEmployeeComplaints(employeeName);
    
    // إنشاء محتوى تفاصيل الموظف مع البلاغات
    content.innerHTML = `
      <div class="border-l-4 border-red-500 bg-gray-50 p-4 mb-4">
        <h4 class="text-xl font-bold text-gray-800 mb-1">${employeeName}</h4>
        <p class="text-sm text-gray-600">بيانات الموظف المبلغ عليه</p>
      </div>

      <div class="grid gap-4 md:grid-cols-2 mb-4">
        <div class="border border-gray-200 rounded-lg p-4">
          <h5 class="font-semibold text-gray-700 mb-2">عدد البلاغات</h5>
          <p class="text-2xl font-bold text-red-600">${complaintCount}</p>
          <p class="text-sm text-gray-500">بلاغ سوء تعامل</p>
        </div>

        <div class="border border-gray-200 rounded-lg p-4">
          <h5 class="font-semibold text-gray-700 mb-2">مستوى الأولوية</h5>
          <p class="text-lg font-bold ${complaintCount >= 5 ? 'text-red-600' : complaintCount >= 3 ? 'text-yellow-600' : 'text-green-600'}">
            ${complaintCount >= 5 ? 'عالي جداً' : complaintCount >= 3 ? 'عالي' : 'متوسط'}
          </p>
          <p class="text-sm text-gray-500">حسب عدد البلاغات</p>
        </div>
      </div>

      <div class="border border-gray-200 rounded-lg p-4 mb-4">
        <h5 class="font-semibold text-gray-700 mb-3">الإحصائيات</h5>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-600">نسبة البلاغات من الإجمالي:</span>
            <span class="font-medium text-gray-800" id="employeePercentage">-</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">الترتيب بين الموظفين:</span>
            <span class="font-medium text-gray-800" id="employeeRank">-</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">حالة المتابعة:</span>
            <span class="font-medium ${complaintCount >= 3 ? 'text-red-600' : 'text-green-600'}">
              ${complaintCount >= 3 ? 'يحتاج متابعة' : 'طبيعي'}
            </span>
          </div>
        </div>
      </div>

      <div class="border border-gray-200 rounded-lg p-4 mb-4">
        <h5 class="font-semibold text-gray-700 mb-2">جميع البلاغات المسجلة ضد هذا الموظف</h5>
        <p class="text-xs text-gray-500 mb-3">عرض جميع البلاغات (مفتوحة ومغلقة) المسجلة ضد الموظف: ${employeeName}</p>
        <div class="max-h-60 overflow-y-auto space-y-3">
          ${complaints.length > 0 ? `
            <div class="text-xs text-blue-600 mb-2 font-medium">
              تم العثور على ${complaints.length} بلاغ مسجل ضد هذا الموظف
            </div>
          ` + complaints.map((complaint, index) => `
            <div class="border border-gray-100 rounded-lg p-3 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all duration-200" 
                 onclick="openComplaintDetailsFromEmployee('${complaint.ticket}', '${complaint.id}')">
              <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-gray-800">${complaint.ticket || `بلاغ #${index + 1}`}</span>
                  ${complaint.priority && (complaint.priority.toUpperCase() === 'URGENT' || complaint.priority.toUpperCase() === 'HIGH') ? 
                    '<span class="text-xs px-2 py-1 rounded-full bg-red-100 text-red-600">عاجل</span>' : ''}
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs px-2 py-1 rounded-full ${getStatusColor(complaint.status)}">
                    ${getStatusText(complaint.status)}
                  </span>
                  <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </div>
              </div>
              <p class="text-sm text-gray-600 mb-2">${complaint.description || 'لا يوجد وصف'}</p>
              <div class="flex justify-between text-xs text-gray-500">
                <span>المستشفى: ${complaint.hospitalName || 'غير محدد'}</span>
                <span>${formatDate(complaint.createdAt) || 'تاريخ غير محدد'}</span>
              </div>
              <div class="text-xs text-blue-600 mt-2 font-medium">انقر لعرض التفاصيل</div>
            </div>
          `).join('') : '<p class="text-gray-500 text-center py-4">لا توجد بلاغات مسجلة ضد هذا الموظف في النظام</p>'}
        </div>
      </div>

      <div class="flex gap-3 mt-6">
        <button onclick="closeEmployeeDetailsModal()" 
          class="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
          إغلاق
        </button>
      </div>
    `;
    
    // حساب النسبة والترتيب
    calculateEmployeeStats(employeeName, complaintCount);
    
  } catch (error) {
    console.error('خطأ في تحميل بلاغات الموظف:', error);
    content.innerHTML = `
      <div class="border-l-4 border-red-500 bg-gray-50 p-4 mb-4">
        <h4 class="text-xl font-bold text-gray-800 mb-1">${employeeName}</h4>
        <p class="text-sm text-gray-600">بيانات الموظف المبلغ عليه</p>
      </div>
      
      <div class="text-center py-8">
        <p class="text-red-600">حدث خطأ في تحميل البلاغات</p>
        <button onclick="closeEmployeeDetailsModal()" 
          class="mt-4 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
          إغلاق
        </button>
      </div>
    `;
  }
}

function closeEmployeeDetailsModal() {
  const modal = document.getElementById('employeeDetailsModal');
  modal.classList.add('hidden');
}

function calculateEmployeeStats(employeeName, complaintCount) {
  // حساب النسبة من إجمالي البلاغات
  const totalComplaints = employeesMistreatmentAll.reduce((sum, emp) => sum + (emp.count || 0), 0);
  const percentage = totalComplaints > 0 ? ((complaintCount / totalComplaints) * 100).toFixed(1) : 0;
  
  // حساب الترتيب
  const sortedEmployees = [...employeesMistreatmentAll].sort((a, b) => (b.count || 0) - (a.count || 0));
  const rank = sortedEmployees.findIndex(emp => (emp.label || emp.name) === employeeName) + 1;
  
  // تحديث القيم
  setTimeout(() => {
    const percentageEl = document.getElementById('employeePercentage');
    const rankEl = document.getElementById('employeeRank');
    
    if (percentageEl) percentageEl.textContent = `${percentage}%`;
    if (rankEl) rankEl.textContent = `#${rank} من ${sortedEmployees.length}`;
  }, 100);
}

async function loadEmployeeComplaints(employeeName) {
  try {
    console.log(`🎯 البحث عن بلاغات الموظف: "${employeeName}"`);
    
    // جلب البلاغات من جدول complaint_targets
    const response = await authFetch(`${API_BASE}/api/complaints/employee-targets?employeeName=${encodeURIComponent(employeeName)}`);
    
    if (!response.ok) {
      // إذا لم يوجد API مخصص، استخدم الطريقة القديمة
      console.log('⚠️ API مخصص غير متوفر، استخدام الطريقة البديلة...');
      return await loadEmployeeComplaintsLegacy(employeeName);
    }

    const data = await response.json();
    const employeeTargets = safeArray(data.items || data.targets || []);

    console.log(`📊 تم جلب ${employeeTargets.length} بلاغ من جدول complaint_targets`);

    if (employeeTargets.length === 0) {
      console.log('📭 لا توجد بلاغات في جدول complaint_targets، جرب الطريقة البديلة...');
      return await loadEmployeeComplaintsLegacy(employeeName);
    }

    // تنسيق البيانات من جدول complaint_targets
    const complaints = employeeTargets.map(target => ({
      ticket: target.TicketNumber || target.ticket || '',
      description: target.Description || target.description || '',
      status: target.StatusCode || target.status || 'open',
      hospitalName: target.HospitalName || target.hospitalName || '',
      createdAt: target.CreatedAt || target.createdAt || '',
      id: target.ComplaintID || target.id,
      priority: target.PriorityCode || target.priority || '',
      targetEmployeeName: target.TargetEmployeeName,
      targetDepartmentName: target.TargetDepartmentName
    }));

    console.log(`✅ تم العثور على ${complaints.length} بلاغ للموظف ${employeeName}`);

    // ترتيب حسب التاريخ (الأحدث أولاً)
    return complaints.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  } catch (error) {
    console.error('خطأ في loadEmployeeComplaints:', error);
    // في حالة الخطأ، جرب الطريقة القديمة
    return await loadEmployeeComplaintsLegacy(employeeName);
  }
}

// الطريقة القديمة كـ fallback
async function loadEmployeeComplaintsLegacy(employeeName) {
  try {
    console.log('🔄 استخدام الطريقة القديمة لجلب البلاغات...');
    
    // جلب جميع البلاغات من API (مفتوحة ومغلقة)
    const response = await authFetch(`${API_BASE}/api/complaints/history?status=ALL&pageSize=500`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const allComplaints = safeArray(data.items || []);

    console.log(`📊 تم جلب ${allComplaints.length} بلاغ من النظام`);

    // فلترة البلاغات الخاصة بالموظف المحدد
    const employeeComplaints = allComplaints.filter(complaint => {
      const targetEmployee = complaint.targetEmployeeName || complaint.TargetEmployeeName || '';
      
      // مطابقة دقيقة أو جزئية
      const exactMatch = targetEmployee.trim().toLowerCase() === employeeName.trim().toLowerCase();
      const partialMatch = targetEmployee.toLowerCase().includes(employeeName.toLowerCase());
      
      return exactMatch || partialMatch;
    });

    console.log(`🔍 تم العثور على ${employeeComplaints.length} بلاغ للموظف ${employeeName}`);

    // تنسيق البيانات
    return employeeComplaints
      .map(complaint => ({
        ticket: complaint.ticket || complaint.TicketNumber || '',
        description: complaint.Description || complaint.description || '',
        status: complaint.status || complaint.StatusCode || 'open',
        hospitalName: complaint.hospitalName || complaint.HospitalName || '',
        createdAt: complaint.createdAt || complaint.CreatedAt || '',
        id: complaint.id || complaint.ComplaintID,
        priority: complaint.priority || complaint.PriorityCode || ''
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  } catch (error) {
    console.error('خطأ في loadEmployeeComplaintsLegacy:', error);
    throw error;
  }
}

function getStatusColor(status) {
  const statusLower = (status || '').toLowerCase();
  const colors = {
    'open': 'bg-blue-100 text-blue-800',
    'closed': 'bg-gray-100 text-gray-800',
    'in_progress': 'bg-yellow-100 text-yellow-800',
    'resolved': 'bg-green-100 text-green-800',
    'مفتوح': 'bg-blue-100 text-blue-800',
    'مغلق': 'bg-gray-100 text-gray-800',
    'قيد المعالجة': 'bg-yellow-100 text-yellow-800',
    'محلول': 'bg-green-100 text-green-800'
  };
  return colors[statusLower] || 'bg-gray-100 text-gray-800';
}

function getStatusText(status) {
  const statusLower = (status || '').toLowerCase();
  const texts = {
    'open': 'مفتوح',
    'closed': 'مغلق',
    'in_progress': 'قيد المعالجة',
    'resolved': 'محلول',
    'مفتوح': 'مفتوح',
    'مغلق': 'مغلق',
    'قيد المعالجة': 'قيد المعالجة',
    'محلول': 'محلول'
  };
  return texts[statusLower] || status || 'غير محدد';
}

function formatDate(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
}

function openComplaintDetailsFromEmployee(ticket, complaintId) {
  // إغلاق modal الموظف
  closeEmployeeDetailsModal();
  
  // التأكد من وجود رقم البلاغ
  if (!ticket) {
    console.error('لا يمكن فتح التفاصيل: لا يوجد رقم البلاغ');
    alert('خطأ: لا يمكن العثور على رقم البلاغ');
    return;
  }

  // بناء رابط صفحة complaint-details.html
  // المسار النسبي: من dashboard/urgent/ إلى public/complaints/history/
  let detailsUrl = '../../public/complaints/history/complaint-details.html';
  const params = new URLSearchParams();
  params.set('ticket', ticket);
  
  if (complaintId) {
    params.set('id', String(complaintId));
  }

  detailsUrl += '?' + params.toString();
  
  console.log('🔗 فتح صفحة تفاصيل البلاغ:', detailsUrl);
  
  // الانتقال لصفحة التفاصيل
  window.location.href = detailsUrl;
}

function viewEmployeeComplaints(employeeName) {
  // إغلاق modal الحالي
  closeEmployeeDetailsModal();
  
  // هنا يمكن إضافة وظيفة لعرض البلاغات الخاصة بالموظف
  // يمكن فتح modal جديد أو الانتقال لصفحة أخرى
  console.log(`عرض بلاغات الموظف: ${employeeName}`);
  alert(`سيتم عرض بلاغات الموظف: ${employeeName}\n(هذه الوظيفة يمكن تطويرها لاحقاً)`);
}

// جعل الدوال متاحة بشكل عام
window.openComplaintsModal = openComplaintsModal;
window.closeComplaintsModal = closeComplaintsModal;
window.openUrgentComplaintsModal = openUrgentComplaintsModal;
window.openMedicineComplaintsModal = openMedicineComplaintsModal;
window.openAllUrgentComplaintsModal = openAllUrgentComplaintsModal;
window.openEmployeeDetailsModal = openEmployeeDetailsModal;
window.closeEmployeeDetailsModal = closeEmployeeDetailsModal;
window.viewEmployeeComplaints = viewEmployeeComplaints;
window.openComplaintDetailsFromEmployee = openComplaintDetailsFromEmployee;

document.addEventListener('DOMContentLoaded', loadUrgent);

// إعادة رسم الرسوم البيانية عند تغيير الوضع الداكن
function reRenderChartsOnThemeChange() {
  // مراقبة تغييرات الوضع الداكن
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        // إعادة تحميل البيانات وإعادة رسم الرسوم البيانية
        if (typeof loadUrgent === 'function') {
          loadUrgent();
        }
        if (typeof renderTopEmployeesChart === 'function') {
          renderTopEmployeesChart();
        }
      }
    });
  });

  // مراقبة تغييرات على html element
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme']
  });

  // مراقبة تغييرات على body element أيضاً
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });
}

// تشغيل المراقب عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', reRenderChartsOnThemeChange);

