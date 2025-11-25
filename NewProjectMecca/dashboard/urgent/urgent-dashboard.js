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

    renderKpiValue('kpi-total', data.totalUrgent ?? 0);
    renderKpiValue('kpi-time', `${data.avgClosureHours ?? 0} ساعة`);
    renderKpiValue('kpi-closure', `${data.closureRate ?? 0}%`);

    // تدمير الرسوم البيانية القديمة إذا وجدت
    destroyAllCharts();

    const hospitalLabels = hospitals.map(h => h.name || 'غير محدد');
    const hospitalCounts = hospitals.map(h => h.count ?? 0);
    createChart('chartHospitals', {
      type: 'bar',
      data: {
        labels: hospitalLabels,
        datasets: stylizeBarDatasets([{
          label: 'عدد البلاغات الحرجة',
          data: hospitalCounts,
          backgroundColor: '#dc2626'
        }])
      },
      options: buildBarOptions()
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
      options: buildBarOptions()
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
      createChart('chartMistreatmentTime', {
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
              data: mistreatmentTime.map(h => Number(h.avgHours ?? 0)),
              borderColor: '#f59e0b',
              backgroundColor: '#f59e0b',
              type: 'line',
              yAxisID: 'y1',
              tension: 0.35,
              fill: false,
              pointRadius: 4,
              pointBackgroundColor: '#f59e0b'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
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
              suggestedMax: 48,
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
    createChart('chartSubPerHospital', {
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
      options: buildBarOptions({ showLegend: true, legendPosition: 'top' })
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
      options: buildBarOptions({ horizontal: true })
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
      options: buildBarOptions({ horizontal: true })
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

document.addEventListener('DOMContentLoaded', loadUrgent);

