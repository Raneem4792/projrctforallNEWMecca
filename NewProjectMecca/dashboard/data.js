// data.js - ملف البيانات المشترك

window.hospitalsData = [
  {
    id: 1, 
    name: "مستشفى الملك فيصل التخصصي", 
    type: "تخصصي", 
    beds: 500,
    totalReports: 245, 
    openReports: 23, 
    closedReports: 222, 
    resolutionRate: 91,
    priorityCounts: { red: 4, orange: 12, yellow: 18 },
    redReports: [
      { 
        id: 'RPT-2025-101', 
        dept:'الطوارئ', 
        createdAt:'2025-01-16 09:40',
        updatedAt: '2025-01-16 10:15',
        reporter: 'د. أحمد محمد',
        contact: '0501234567',
        source: 'منظومة 937',
        assignee: 'فريق الطوارئ',
        status: 'قيد المعالجة',
        description: 'انقطاع في نظام الإنذار المبكر في قسم الطوارئ مما يؤثر على سرعة الاستجابة للحالات الحرجة',
        attachments: [
          { name: 'صورة النظام', url: '#' },
          { name: 'تقرير فني', url: '#' }
        ],
        history: [
          { at: '2025-01-16 09:40', action: 'تم إنشاء البلاغ', by: 'د. أحمد محمد' },
          { at: '2025-01-16 10:00', action: 'تم توجيه البلاغ لفريق الطوارئ', by: 'النظام' },
          { at: '2025-01-16 10:15', action: 'تم بدء المعالجة', by: 'فريق الطوارئ', note: 'تم التواصل مع الفريق الفني' }
        ]
      },
      { 
        id: 'RPT-2025-088', 
        dept:'العناية المركزة', 
        createdAt:'2025-01-16 08:55',
        updatedAt: '2025-01-16 09:30',
        reporter: 'ممرضة فاطمة',
        contact: '0509876543',
        source: 'تطبيق البلاغات',
        assignee: 'مهندس الأجهزة',
        status: 'قيد المعالجة',
        description: 'عطل في جهاز التنفس الصناعي رقم 3 مما يتطلب استبدال فوري',
        attachments: [
          { name: 'فيديو العطل', url: '#' }
        ],
        history: [
          { at: '2025-01-16 08:55', action: 'تم إنشاء البلاغ', by: 'ممرضة فاطمة' },
          { at: '2025-01-16 09:15', action: 'تم توجيه البلاغ لمهندس الأجهزة', by: 'النظام' },
          { at: '2025-01-16 09:30', action: 'تم بدء المعالجة', by: 'مهندس الأجهزة', note: 'تم طلب جهاز بديل' }
        ]
      },
      { 
        id: 'RPT-2025-072', 
        dept:'المختبر', 
        createdAt:'2025-01-15 17:30',
        updatedAt: '2025-01-15 18:00',
        reporter: 'د. سارة أحمد',
        contact: '0505555555',
        source: 'منظومة 937',
        assignee: 'فريق المختبر',
        status: 'مغلقة',
        description: 'تأخر في نتائج التحاليل الطبية مما يؤثر على تشخيص المرضى',
        attachments: [],
        history: [
          { at: '2025-01-15 17:30', action: 'تم إنشاء البلاغ', by: 'د. سارة أحمد' },
          { at: '2025-01-15 17:45', action: 'تم توجيه البلاغ لفريق المختبر', by: 'النظام' },
          { at: '2025-01-15 18:00', action: 'تم حل المشكلة', by: 'فريق المختبر', note: 'تم إصلاح الجهاز وتنظيف النظام' }
        ]
      },
      { 
        id: 'RPT-2025-066', 
        dept:'غرف العمليات', 
        createdAt:'2025-01-15 11:05',
        updatedAt: '2025-01-15 12:00',
        reporter: 'د. خالد العتيبي',
        contact: '0507777777',
        source: 'تطبيق البلاغات',
        assignee: 'فريق الصيانة',
        status: 'قيد المعالجة',
        description: 'مشكلة في نظام التهوية في غرفة العمليات رقم 2',
        attachments: [
          { name: 'تقرير فني', url: '#' },
          { name: 'قياسات الهواء', url: '#' }
        ],
        history: [
          { at: '2025-01-15 11:05', action: 'تم إنشاء البلاغ', by: 'د. خالد العتيبي' },
          { at: '2025-01-15 11:30', action: 'تم توجيه البلاغ لفريق الصيانة', by: 'النظام' },
          { at: '2025-01-15 12:00', action: 'تم بدء المعالجة', by: 'فريق الصيانة', note: 'تم فحص النظام وطلب قطع غيار' }
        ]
      },
    ]
  },
  {
    id: 2, 
    name: "مستشفى الملك عبدالعزيز", 
    type: "عام", 
    beds: 400,
    totalReports: 189, 
    openReports: 31, 
    closedReports: 158, 
    resolutionRate: 84,
    priorityCounts: { red: 1, orange: 8, yellow: 22 },
    redReports: [
      { 
        id: 'RPT-2025-055', 
        dept:'الأشعة', 
        createdAt:'2025-01-15 14:20',
        updatedAt: '2025-01-15 15:00',
        reporter: 'فني الأشعة محمد',
        contact: '0503333333',
        source: 'منظومة 937',
        assignee: 'مهندس الأشعة',
        status: 'قيد المعالجة',
        description: 'عطل في جهاز الأشعة المقطعية مما يؤثر على تشخيص المرضى',
        attachments: [
          { name: 'صورة الخطأ', url: '#' }
        ],
        history: [
          { at: '2025-01-15 14:20', action: 'تم إنشاء البلاغ', by: 'فني الأشعة محمد' },
          { at: '2025-01-15 14:45', action: 'تم توجيه البلاغ لمهندس الأشعة', by: 'النظام' },
          { at: '2025-01-15 15:00', action: 'تم بدء المعالجة', by: 'مهندس الأشعة', note: 'تم التواصل مع الشركة الموردة' }
        ]
      },
    ]
  },
  {
    id: 3, 
    name: "مستشفى النور التخصصي", 
    type: "تخصصي", 
    beds: 300,
    totalReports: 167, 
    openReports: 18, 
    closedReports: 149, 
    resolutionRate: 89,
    priorityCounts: { red: 0, orange: 6, yellow: 15 },
    redReports: []
  },
  {
    id: 4, 
    name: "مستشفى الهدى العام", 
    type: "عام", 
    beds: 250,
    totalReports: 134, 
    openReports: 22, 
    closedReports: 112, 
    resolutionRate: 84,
    priorityCounts: { red: 2, orange: 3, yellow: 9 },
    redReports: [
      { 
        id: 'RPT-2025-060', 
        dept:'العيادات الخارجية', 
        createdAt:'2025-01-14 10:05',
        updatedAt: '2025-01-14 11:00',
        reporter: 'د. نورا السعيد',
        contact: '0504444444',
        source: 'تطبيق البلاغات',
        assignee: 'فريق العيادات',
        status: 'قيد المعالجة',
        description: 'مشكلة في نظام الحجز الإلكتروني مما يسبب تأخير في مواعيد المرضى',
        attachments: [
          { name: 'لقطة شاشة', url: '#' }
        ],
        history: [
          { at: '2025-01-14 10:05', action: 'تم إنشاء البلاغ', by: 'د. نورا السعيد' },
          { at: '2025-01-14 10:30', action: 'تم توجيه البلاغ لفريق العيادات', by: 'النظام' },
          { at: '2025-01-14 11:00', action: 'تم بدء المعالجة', by: 'فريق العيادات', note: 'تم التواصل مع قسم تقنية المعلومات' }
        ]
      },
      { 
        id: 'RPT-2025-059', 
        dept:'الصيدلية', 
        createdAt:'2025-01-14 08:10',
        updatedAt: '2025-01-14 09:00',
        reporter: 'صيدلي عبدالله',
        contact: '0506666666',
        source: 'منظومة 937',
        assignee: 'فريق الصيدلية',
        status: 'مغلقة',
        description: 'نقص في أدوية الطوارئ مما يتطلب توريد فوري',
        attachments: [],
        history: [
          { at: '2025-01-14 08:10', action: 'تم إنشاء البلاغ', by: 'صيدلي عبدالله' },
          { at: '2025-01-14 08:30', action: 'تم توجيه البلاغ لفريق الصيدلية', by: 'النظام' },
          { at: '2025-01-14 09:00', action: 'تم حل المشكلة', by: 'فريق الصيدلية', note: 'تم طلب الأدوية من المستودع المركزي' }
        ]
      },
    ]
  },
  {
    id: 5, 
    name: "مركز الرعاية الأولية - العزيزية", 
    type: "رعاية أولية", 
    beds: 50,
    totalReports: 89, 
    openReports: 12, 
    closedReports: 77, 
    resolutionRate: 87,
    priorityCounts: { red: 0, orange: 2, yellow: 7 },
    redReports: []
  },
  {
    id: 6, 
    name: "مركز الرعاية الأولية - الشرائع", 
    type: "رعاية أولية", 
    beds: 40,
    totalReports: 76, 
    openReports: 8, 
    closedReports: 68, 
    resolutionRate: 89,
    priorityCounts: { red: 0, orange: 1, yellow: 6 },
    redReports: []
  }
];
