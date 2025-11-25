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
  const categoryAxis = {
    grid: { display: false },
    ticks: {
      color: '#0f172a',
      font: { family: FONT_FAMILY, weight: 600 }
    }
  };

  const valueAxis = {
    beginAtZero: true,
    grid: { color: GRID_COLOR, drawBorder: false },
    ticks: {
      color: '#475569',
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
          color: '#0f172a'
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
        color: '#0f172a',
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
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: chartTitle,
          font: { family: 'Tajawal', size: 16 },
          color: '#002B5B',
          padding: { bottom: 10 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label} : ${ctx.raw} بلاغ `
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        y: {
          ticks: { font: { family: 'Tajawal' } },
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
    const hospitals = safeArray(data.hospitals);
    const employees = safeArray(data.employees);
    const weekly = safeArray(data.weekly);
    const departments = safeArray(data.departments);
    const mistreatmentTime = safeArray(data.mistreatmentClosingTime);

    // تسجيل للتشخيص
    if (mistreatmentTime.length > 0) {
      console.log('📊 بيانات mistreatmentClosingTime:', mistreatmentTime.map(h => ({
        name: h.name,
        count: h.count,
        closedCount: h.closedCount,
        avgHours: h.avgHours
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

    createChart('chartEmployees', {
      type: 'bar',
      data: {
        labels: employees.map(e => e.name || 'غير معروف'),
        datasets: stylizeBarDatasets([{
          label: 'بلاغات',
          data: employees.map(e => e.count ?? 0),
          backgroundColor: '#ef4444'
        }])
      },
      options: buildBarOptions({ horizontal: true })
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

    createChart('chartWeekly', {
      type: 'line',
      data: {
        labels: weekly.map(d => d.day || ''),
        datasets: [{
          label: 'بلاغات حرجة',
          data: weekly.map(d => d.count ?? 0),
          borderColor: '#b91c1c',
          tension: 0.45
        }]
      }
    });

    createChart('chartDepartments', {
      type: 'bar',
      data: {
        labels: departments.map(d => d.name || 'غير محدد'),
        datasets: stylizeBarDatasets([{
          label: 'عدد البلاغات الحرجة',
          data: departments.map(d => d.count ?? 0),
          backgroundColor: '#f87171'
        }])
      },
      options: buildBarOptions()
    });

    if (mistreatmentTime.length) {
      const mistreatmentChart = createChart('chartMistreatmentTime', {
        type: 'bar',
        data: {
          labels: mistreatmentTime.map(h => h.name || 'غير محدد'),
          datasets: [
            {
              label: 'عدد بلاغات سوء التعامل',
              data: mistreatmentTime.map(h => h.count ?? 0),
              backgroundColor: '#dc2626',
              yAxisID: 'y'
            },
            {
              label: 'متوسط زمن الإغلاق بالساعات',
              data: mistreatmentTime.map(h => h.avgHours ?? 0),
              borderColor: '#f59e0b',
              backgroundColor: '#f59e0b',
              type: 'line',
              yAxisID: 'y1',
              tension: 0.35,
              fill: false,
              borderWidth: 3,
              pointRadius: 6,
              pointHoverRadius: 8,
              pointBackgroundColor: '#f59e0b',
              datalabels: {
                align: 'top',
                anchor: 'end',
                color: '#f59e0b',
                font: { family: FONT_FAMILY, weight: 'bold', size: 14 },
                formatter: (value) => (value ? `${value} س` : '')
              }
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onClick: (event, elements) => {
            if (elements && elements.length > 0) {
              // الحصول على الفهرس من أول عنصر تم النقر عليه
              const element = elements[0];
              const index = element.index;
              const hospital = mistreatmentTime[index];
              if (hospital && hospital.id) {
                openComplaintsModal(hospital.id, hospital.name);
              }
            }
          },
          onHover: (event, elements) => {
            // تغيير شكل المؤشر عند التمرير
            event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { family: FONT_FAMILY, weight: 600 },
                color: '#0f172a'
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const value = ctx.datasetIndex === 0
                    ? formatArabicNumber(ctx.raw)
                    : `${Number(ctx.raw ?? 0).toFixed(1)} ساعة`;
                  return ` ${ctx.dataset.label}: ${value} `;
                },
                afterBody: (items) => {
                  return 'انقر لعرض البلاغات';
                }
              }
            },
            datalabels: {
              color: '#0f172a',
              font: { family: FONT_FAMILY, weight: 600, size: 12 },
              align: (ctx) => (ctx.dataset.type === 'line' ? 'top' : 'end'),
              anchor: (ctx) => (ctx.dataset.type === 'line' ? 'end' : 'end'),
              formatter: (value, ctx) => {
                if (ctx.dataset.type === 'line') {
                  const val = Number(value ?? 0);
                  return val ? `${val.toFixed(1)}س` : '';
                }
                return value ? formatArabicNumber(value) : '';
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: GRID_COLOR, drawBorder: false },
              ticks: {
                color: '#475569',
                font: { family: FONT_FAMILY },
                precision: 0
              },
              title: {
                display: true,
                text: 'عدد البلاغات',
                color: '#0f172a',
                font: { family: FONT_FAMILY, weight: 600 }
              }
            },
            y1: {
              position: 'right',
              beginAtZero: true,
              max: 48,
              grid: { drawOnChartArea: false },
              ticks: {
                color: '#f97316',
                font: { family: FONT_FAMILY },
                stepSize: 4,
                callback: (value) => `${value} س`
              },
              title: {
                display: true,
                text: 'متوسط الساعات',
                color: '#f97316',
                font: { family: FONT_FAMILY, weight: 600 }
              }
            },
            x: {
              ticks: {
                color: '#0f172a',
                font: { family: FONT_FAMILY, weight: 600 }
              },
              grid: { display: false }
            }
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

  } catch (error) {
    console.error('Failed to load urgent dashboard data:', error);
    renderError('لم يتم تحميل بيانات البلاغات الحرجة. يرجى المحاولة لاحقاً.');
  }
}

// ========================================
// Modal البلاغات
// ========================================

async function openComplaintsModal(hospitalId, hospitalName) {
  const modal = document.getElementById('complaintsModal');
  const modalTitleElement = document.getElementById('modal-title');
  const modalTitle = document.getElementById('modal-hospital-name');
  const loading = document.getElementById('complaintsModalLoading');
  const empty = document.getElementById('complaintsModalEmpty');
  const content = document.getElementById('complaintsModalContent');
  const list = document.getElementById('complaints-list');

  // تغيير عنوان الـ Modal لبلاغات سوء التعامل
  if (modalTitleElement) {
    modalTitleElement.innerHTML = 'بلاغات سوء التعامل - <span id="modal-hospital-name"></span>';
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
    const complaints = await loadComplaintsForHospital(hospitalId);
    
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
      return typeId === 3 || typeId === 17 || subTypeId === 15;
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

// جعل الدوال متاحة بشكل عام
window.openComplaintsModal = openComplaintsModal;
window.closeComplaintsModal = closeComplaintsModal;
window.openUrgentComplaintsModal = openUrgentComplaintsModal;
window.openMedicineComplaintsModal = openMedicineComplaintsModal;
window.openAllUrgentComplaintsModal = openAllUrgentComplaintsModal;

document.addEventListener('DOMContentLoaded', loadUrgent);

