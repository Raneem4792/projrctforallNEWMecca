// routes/complaints.js
import express from 'express';
import multer from 'multer';
import mysql from 'mysql2/promise';
import { centralDb, getContextualPool, getHospitalPool } from '../config/db.js';
import { getCentralPool } from '../db/centralPool.js';
import { addToTrash } from '../controllers/trashController.js';
import { requireAuth, optionalAuth, hospitalScopeSQL } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { getHospitalsMap, getHospitalInfo } from '../helpers/hospitals.js';
import { exportComplaintsExcel, exportComplaintsPDF } from '../controllers/complaints.export.controller.js';

const router = express.Router();

// ✅ إعداد multer لقراءة FormData والمرفقات
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB لكل ملف
  storage: multer.memoryStorage()
});

// تحويل Priority/Type إلى فئة عرض للوحة
const CATEGORY_SQL = `
  CASE
    WHEN UPPER(c.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
         OR c.PriorityCode IN ('حرجة','عاجلة','عالية','حرج')
      THEN 'critical'
    WHEN (ct.TypeCode = 'SUGGESTION') OR (ct.TypeName LIKE '%اقتراح%')
      THEN 'suggestion'
    ELSE 'complaint'
  END
`;

/**
 * GET /api/complaints/track?name=XXX&mobile=XXX&ticket=XXX&file=XXX&nid=XXX
 * تفاصيل البلاغ بواسطة رقم التذكرة (للواجهة العامة)
 * يستخدم القاعدة المركزية للبحث (تحتوي على جميع البلاغات)
 */
router.get('/track', optionalAuth, async (req, res) => {
  try {
    // قراءة جميع معاملات البحث حسب الأولوية
    const ticket = (req.query.ticket || '').trim();
    const mobile = (req.query.mobile || '').trim();
    const file = (req.query.file || '').trim();
    const nid = (req.query.nid || '').trim();
    const name = (req.query.name || '').trim().replace(/\s+/g,' ');
    
    // تحديد قيمة البحث ونوعها حسب الأولوية
    let term = '';
    let searchBy = '';
    
    if (ticket) {
      term = ticket;
      searchBy = 'TicketNumber';
    } else if (mobile) {
      term = mobile;
      searchBy = 'PatientMobile';
    } else if (file) {
      term = file;
      searchBy = 'FileNumber';
    } else if (nid) {
      term = nid;
      searchBy = 'PatientIDNumber';
    } else if (name) {
      term = name;
      // التعرّف على نوع البحث من النمط (للتوافق مع الكود القديم)
      if (/^05\d{8}$/.test(term)) {
        searchBy = 'PatientMobile'; // رقم جوال (يبدأ بـ 05)
      } else if (/^\d{10}$/.test(term)) {
        searchBy = 'PatientIDNumber'; // رقم هوية (10 أرقام)
      } else if (/^(B|C)[0-9\-]+$/i.test(term)) {
        searchBy = 'TicketNumber';
      } else if (/^[A-Z]-\d{4,7}$/i.test(term)) {
        searchBy = 'TicketNumber';
      } else if (/^[A-Za-z0-9\-_/]{6,20}$/.test(term)) {
        searchBy = 'FileNumber';
      } else {
        searchBy = 'PatientFullName'; // البحث بالاسم
      }
    }
    
    if (!term) {
      return res.status(400).json({ ok:false, message:'أدخل قيمة للبحث' });
    }

    // لوج تشخيصي
    console.log(`🔍 [TRACK] البحث عن: "${term}" | نوع البحث: ${searchBy} | hasUser: ${!!req.user} | hospitalId: ${req.user?.HospitalID || req.user?.hospitalId || 'none'}`);

    const scope = hospitalScopeSQL(req.user, 'c', req);

    // تحديد نوع البحث
    const isTicket     = searchBy === 'TicketNumber';
    const isMobile     = searchBy === 'PatientMobile';
    const isNationalId = searchBy === 'PatientIDNumber';
    const isFileNo     = searchBy === 'FileNumber';
    const isName       = searchBy === 'PatientFullName';
    
    console.log(`🔍 [TRACK] تحليل النص:`, {
      term,
      searchBy,
      isTicket,
      isMobile,
      isNationalId,
      isFileNo,
      isName
    });
    
    console.log(`🔎 [TRACK] نوع البحث المحدد: ${searchBy}`);

    const sql = `
      SELECT
        c.ComplaintID,
        c.TicketNumber,
        c.PatientFullName,
        c.PatientIDNumber,
        c.PatientMobile,
        c.FileNumber,
        c.Description,
        c.StatusCode,
        c.PriorityCode,
        c.HospitalID,
        c.DepartmentID,
        c.CreatedAt,
        c.AssignedToUserID,
        c.AssignedAt,
        d.NameAr  AS DepartmentNameAr,
        d.NameEn  AS DepartmentNameEn,
        dp.NameAr AS ParentDepartmentNameAr,
        dp.NameEn AS ParentDepartmentNameEn,
        u.FullName AS CreatedByFullName,
        au.FullName AS AssignedToFullName,
        ct.TypeName  AS ComplaintTypeNameAr,
        ct.TypeNameEn AS ComplaintTypeNameEn,
        cs.LabelAr AS StatusLabelAr,
        cs.LabelEn AS StatusLabelEn
      FROM complaints c
      LEFT JOIN departments d   ON d.DepartmentID = c.DepartmentID
      LEFT JOIN departments dp  ON dp.DepartmentID = d.ParentDepartmentID
      LEFT JOIN users u         ON u.UserID       = c.CreatedByUserID
      LEFT JOIN users au        ON au.UserID      = c.AssignedToUserID
      LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
      LEFT JOIN complaint_statuses cs ON cs.StatusCode = c.StatusCode
      WHERE 1=1
        ${scope.where}
        AND (
          ${isTicket     ? 'c.TicketNumber = ?' : '0'} OR
          ${isMobile     ? 'c.PatientMobile = ?' : '0'} OR
          ${isNationalId ? 'c.PatientIDNumber = ?' : '0'} OR
          ${isFileNo     ? 'c.FileNumber = ?' : '0'} OR
          ${isName       ? 'c.PatientFullName COLLATE utf8mb4_0900_ai_ci LIKE ?' : '0'}
        )
      ORDER BY c.CreatedAt DESC
      LIMIT 50
    `;

    const params = [...scope.params];
    if (isTicket) params.push(term);
    if (isMobile) params.push(term);
    if (isNationalId) params.push(term);
    if (isFileNo) params.push(term);
    if (isName) params.push(`%${term}%`);

    // تحديد نوع المستخدم
    const roleId = Number(req.user?.RoleID ?? req.user?.roleId ?? 0);
    const isClusterManager = [1, 4].includes(roleId); // SUPER_ADMIN, CLUSTER_MANAGER
    const requestedHospitalId = req.query.hospitalId ? parseInt(req.query.hospitalId, 10) : null;

    console.log(`🔍 [TRACK] تشخيص المستخدم:`, {
      roleId,
      isClusterManager,
      requestedHospitalId,
      hasUser: !!req.user,
      userRole: req.user?.RoleID ?? req.user?.roleId
    });

    let items = [];
    let source = '';

    if (isClusterManager && !requestedHospitalId) {
      // مدير التجمع بدون تحديد مستشفى = جمع من جميع المستشفيات
      console.log(`🏥 [TRACK] مدير التجمع - البحث في جميع المستشفيات عن: "${term}"`);
      
      try {
        // جلب جميع المستشفيات النشطة
        const [allHospitals] = await centralDb.query(`
          SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
          FROM hospitals 
          WHERE IFNULL(IsActive, Active) = 1 AND DbName IS NOT NULL
        `);
        
        console.log(`📋 [TRACK] تم العثور على ${allHospitals.length} مستشفى للبحث`);
        
        const allItems = [];
        
        // البحث في كل مستشفى
        for (const hospital of allHospitals) {
          try {
            console.log(`🔍 [TRACK] البحث في مستشفى ${hospital.HospitalID}: ${hospital.NameAr}`);
            
            const hospitalPool = mysql.createPool({
              host: hospital.DbHost || '127.0.0.1',
              user: hospital.DbUser || 'root',
              password: hospital.DbPass || '',
              database: hospital.DbName,
              waitForConnections: true,
              connectionLimit: 3
            });

            // استعلام البلاغات من هذا المستشفى
            const [hospitalRows] = await hospitalPool.query(sql, params);

            if (hospitalRows.length > 0) {
              console.log(`✅ [TRACK] تم العثور على ${hospitalRows.length} بلاغ في ${hospital.NameAr}`);
              allItems.push(...hospitalRows);
            }
            
            hospitalPool.end();
          } catch (error) {
            console.error(`❌ [TRACK] خطأ في مستشفى ${hospital.HospitalID}:`, error.message);
          }
        }
        
        // ترتيب النتائج حسب التاريخ (الأحدث أولاً)
        allItems.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
        
        items = allItems;
        source = 'all-hospitals';
        
        console.log(`📊 [TRACK] إجمالي النتائج: ${items.length} من جميع المستشفيات`);
        
      } catch (error) {
        console.error('❌ [TRACK] خطأ في جمع البيانات من المستشفيات:', error.message);
      }
      
    } else {
      // منطق عادي: موظف مستشفى أو مدير تجمع يحدد مستشفى معين
      // ✅ أولوية للمستشفى من query parameter (من الرابط) ثم من التوكن
      const queryHospitalId = parseInt(req.query.hospitalId, 10);
      const userHospitalId = req.user?.HospitalID || req.user?.hospitalId;
      const hospitalId = Number.isFinite(queryHospitalId) ? queryHospitalId : userHospitalId;
      
      console.log(`🔍 [TRACK] منطق عادي - hospitalId: ${hospitalId}`);
      console.log(`🔍 [TRACK] المصادر:`, { 
        queryHospitalId, 
        userHospitalId, 
        finalHospitalId: hospitalId 
      });
      
      if (Number.isFinite(hospitalId)) {
        // البحث مباشرة في قاعدة المستشفى أولاً
        console.log(`🏥 [TRACK] البحث في قاعدة المستشفى ${hospitalId} عن: "${term}"`);
        
        try {
          const hospitalInfo = await getHospitalInfo(hospitalId);
          if (hospitalInfo && hospitalInfo.DbName) {
            // إنشاء اتصال بقاعدة المستشفى
            const hospitalPool = mysql.createPool({
              host: process.env.CENTRAL_DB_HOST || 'localhost',
              user: process.env.CENTRAL_DB_USER || 'root',
              password: process.env.CENTRAL_DB_PASS || 'Raneem11',
              database: hospitalInfo.DbName,
              waitForConnections: true,
              connectionLimit: 5
            });

            const [hospitalRows] = await hospitalPool.query(sql, params);
            console.log(`📋 [TRACK] نتائج المستشفى ${hospitalId}:`, { rowsCount: hospitalRows.length });
            
            // ✅ إضافة اسم المستشفى الصحيح لكل بلاغ
            items = hospitalRows.map(item => ({
              ...item,
              hospitalNameAr: hospitalInfo.NameAr || 'غير محدد',
              hospital: hospitalInfo.NameAr || 'غير محدد',
              HospitalID: hospitalId // تأكد من وجود HospitalID
            }));
            
            // ✅ جلب بيانات الموظف المُبلّغ عليه لكل بلاغ
            for (let i = 0; i < items.length; i++) {
              const complaint = items[i];
              try {
                const [targets] = await hospitalPool.query(
                  `SELECT TargetID, TargetEmployeeID, TargetEmployeeName,
                          TargetDepartmentID, TargetDepartmentName, CreatedAt
                   FROM complaint_targets
                   WHERE ComplaintID = ?`,
                  [complaint.ComplaintID]
                );
                
                complaint.targets = targets || [];
                console.log(`📋 [TRACK] بلاغ ${complaint.ComplaintID}: ${targets?.length || 0} موظف مُبلّغ عليه`);
              } catch (error) {
                console.error(`❌ [TRACK] خطأ في جلب بيانات الموظف للبلاغ ${complaint.ComplaintID}:`, error.message);
                complaint.targets = [];
              }
            }
            
            console.log(`📋 [TRACK] اسم المستشفى المُضاف:`, hospitalInfo.NameAr);
            source = 'hospital';

            await hospitalPool.end();
            
            // إذا لم توجد نتائج في المستشفى المحدد، جرب البحث في جميع المستشفيات
            if (!items.length) {
              console.log(`🔄 [TRACK] لا توجد نتائج في المستشفى ${hospitalId}، البحث في جميع المستشفيات`);
              
              try {
                const [allHospitals] = await centralDb.query(`
                  SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
                  FROM hospitals 
                  WHERE IFNULL(IsActive, Active) = 1 AND DbName IS NOT NULL
                `);
                
                for (const hospital of allHospitals) {
                  if (hospital.HospitalID === hospitalId) continue; // تخطي المستشفى المحدد (تم البحث فيه)
                  
                  try {
                    const hospitalPool2 = mysql.createPool({
                      host: hospital.DbHost || 'localhost',
                      user: hospital.DbUser || 'root',
                      password: hospital.DbPass || '',
                      database: hospital.DbName,
                      waitForConnections: true,
                      connectionLimit: 3
                    });

                    const [hospitalRows2] = await hospitalPool2.query(sql, params);
                    if (hospitalRows2.length > 0) {
                      console.log(`✅ [TRACK] تم العثور على ${hospitalRows2.length} بلاغ في ${hospital.NameAr}`);
                      items = hospitalRows2;
                      source = `hospital-${hospital.HospitalID}`;
                      hospitalPool2.end();
                      break;
                    }
                    
                    hospitalPool2.end();
        } catch (error) {
                    console.error(`❌ [TRACK] خطأ في مستشفى ${hospital.HospitalID}:`, error.message);
                  }
                }
              } catch (error) {
                console.error('❌ [TRACK] خطأ في البحث في جميع المستشفيات:', error.message);
              }
            }
          } else {
            console.log(`⚠️ [TRACK] معلومات المستشفى ${hospitalId} غير متوفرة`);
          }
        } catch (error) {
          console.error(`❌ [TRACK] خطأ في الاتصال بقاعدة المستشفى ${hospitalId}:`, error.message);
        }
      } else {
        // لا يوجد مستشفى محدد - للزوار: ابحث في جميع المستشفيات مباشرة
        console.log(`🔍 [TRACK] زائر بدون مستشفى محدد - البحث في جميع المستشفيات مباشرة عن: "${term}"`);
        
        try {
          // جلب جميع المستشفيات النشطة
          const [allHospitals] = await centralDb.query(`
            SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
            FROM hospitals 
            WHERE IFNULL(IsActive, Active) = 1 AND DbName IS NOT NULL
          `);
          
          console.log(`📋 [TRACK] تم العثور على ${allHospitals.length} مستشفى للبحث`);
          
          // البحث في كل مستشفى
          for (const hospital of allHospitals) {
            try {
              console.log(`🔍 [TRACK] البحث في مستشفى ${hospital.HospitalID}: ${hospital.NameAr}`);
              
              const hospitalPool = mysql.createPool({
                host: hospital.DbHost || 'localhost',
                user: hospital.DbUser || 'root',
                password: hospital.DbPass || '',
                database: hospital.DbName,
                waitForConnections: true,
                connectionLimit: 3
              });

              const [hospitalRows] = await hospitalPool.query(sql, params);
              if (hospitalRows.length > 0) {
                console.log(`✅ [TRACK] تم العثور على ${hospitalRows.length} بلاغ في ${hospital.NameAr}`);
                items = hospitalRows;
                source = `hospital-${hospital.HospitalID}`;
                hospitalPool.end();
                break; // توقف عند العثور على النتائج
              }
              
              hospitalPool.end();
            } catch (error) {
              console.error(`❌ [TRACK] خطأ في مستشفى ${hospital.HospitalID}:`, error.message);
            }
          }
          
          if (items.length > 0) {
            console.log(`📊 [TRACK] تم العثور على النتائج في قاعدة المستشفى`);
          } else {
            console.log(`⚠️ [TRACK] لم يتم العثور على نتائج في أي مستشفى`);
          }
          
        } catch (error) {
          console.error('❌ [TRACK] خطأ في البحث في جميع المستشفيات:', error.message);
        }
        
        // إذا لم توجد نتائج في المستشفيات، جرب المركزية كبديل احتياطي
        if (!items.length) {
          console.log(`🔄 [TRACK] لا توجد نتائج في المستشفيات، البحث في المركزية كبديل احتياطي`);
          
          const [rowsCentral] = await centralDb.query(sql, params);
          console.log(`📋 [TRACK] نتائج المركزية:`, { rowsCount: rowsCentral.length });
          
          if (rowsCentral.length > 0) {
            items = rowsCentral;
            source = 'central';
            console.log(`📊 [TRACK] تم العثور على النتائج في المركزية كبديل احتياطي`);
          }
        }
      }
    }

    // 🎯 بدل 404 نرجع 200 مع قائمة فارغة
    if (!items.length) {
      return res.json({
        ok: true,
        total: 0,
        items: [],
        message: 'لا توجد نتائج مطابقة لمدخل البحث'
      });
    }

    // أضِف اسم المستشفى من المركزي
    try {
      const hospitalsMap = await getHospitalsMap(); // يعيد Map بـ {id => {nameAr,nameEn}}
      items = items.map(it => ({
        ...it,
        hospitalNameAr: hospitalsMap.get(it.HospitalID)?.nameAr || hospitalsMap.get(it.hospitalId)?.nameAr || null,
        hospital:        hospitalsMap.get(it.HospitalID)?.nameAr || hospitalsMap.get(it.hospitalId)?.nameAr || null
      }));
    } catch (_) {}

    // كان فيه نتائج
    res.json({
      ok: true,
      total: items.length,
      items,
      source
    });

  } catch (err) {
    console.error('❌ خطأ في /track:', err);
    res.status(500).json({ 
      ok: false,
      message: 'حدث خطأ في الخادم',
      error: err.message 
    });
  }
});

/**
 * GET /api/complaints/export-excel
 * تصدير البلاغات إلى Excel مع الفلاتر
 * ⚠️ يجب أن يكون قبل /history لتجنب تعارض المسارات
 */
router.get('/export-excel', requireAuth, exportComplaintsExcel);

/**
 * POST /api/complaints/export-pdf
 * تصدير البلاغات إلى PDF (يستقبل صورة من html2canvas)
 */
router.post('/export-pdf', requireAuth, exportComplaintsPDF);

/**
 * GET /api/complaints/history
 * سجل البلاغات مع الفلاتر والترقيم
 * يستخدم نفس منطق /track: مركزية أولاً + fallback لقاعدة المستشفى
 */
router.get('/history', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  
  try {
    const page     = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '9', 10)));
    const offset   = (page - 1) * pageSize;

    const name     = (req.query.name   || '').trim();
    const mobile   = (req.query.mobile || '').trim();
    const file     = (req.query.file   || '').trim();
    const ticket   = (req.query.ticket || '').trim();
    const status   = (req.query.status || 'ALL').toUpperCase();
    const from     = (req.query.from   || '').trim();
    const to       = (req.query.to     || '').trim();
    const assigned = (req.query.assigned || '').trim().toLowerCase();

    // لوج تشخيصي مفصل
    console.log(`📋 [HISTORY] البحث | hasUser: ${!!req.user} | hospitalId: ${req.user?.HospitalID || req.user?.hospitalId || 'none'} | queryHospitalId: ${req.query.hospitalId || 'none'} | page: ${page}`);
    console.log(`📋 [HISTORY] الفلاتر:`, { name, mobile, file, ticket, status, from, to, assigned });

    // جلب خريطة المستشفيات من القاعدة المركزية (مرة واحدة)
    const hospitalsMap = await getHospitalsMap();

    // نطاق المستشفى (مدير التجمع يشوف الكل أو يحدد ?hospitalId=)
    const scope = hospitalScopeSQL(req.user, 'c', req);
    console.log(`📋 [HISTORY] نطاق المستشفى:`, scope);

    // تطبيق صلاحيات المستخدم (نطاق العرض)
    let permissionScope = '';
    let permissionParams = [];
    
    if (req.user && req.user.HospitalID) {
      try {
        // جلب صلاحيات المستخدم من قاعدة المستشفى
        // للمديرين: نستخدم HospitalID من المستخدم مباشرة (لأن الفرونت لا يرسل ?hospitalId=)
        const hospitalId = req.user.HospitalID;
        const hospitalPool = await getHospitalPool(hospitalId);
        console.log(`🔍 [HISTORY] المستخدم:`, {
          UserID: req.user.UserID,
          HospitalID: req.user.HospitalID,
          RoleID: req.user.RoleID
        });
        console.log(`🔍 [HISTORY] نوع الاتصال:`, hospitalPool.constructor.name);
        console.log(`🔍 [HISTORY] قاعدة البيانات:`, hospitalPool._dbName || 'غير محدد');
        console.log(`🔍 [HISTORY] معرف المستشفى:`, hospitalPool._hospitalId || 'غير محدد');
        
        const [perms] = await hospitalPool.query(`
          SELECT PermissionKey, ViewScope
          FROM user_permissions
          WHERE UserID=? AND HospitalID=?
        `, [req.user.uid || req.user.UserID, req.user.HospitalID]);
        
        console.log(`🔍 [HISTORY] الصلاحيات الموجودة:`, perms);
        const viewScope = perms.find(p => p.PermissionKey === 'COMPLAINT_HISTORY_SCOPE')?.ViewScope;
        console.log(`🔍 [HISTORY] نطاق الصلاحية:`, viewScope);
        
        if (viewScope === 'DEPARTMENT') {
          permissionScope = ' AND c.DepartmentID = ?';
          permissionParams.push(req.user.DepartmentID);
          console.log(`🏢 [HISTORY] تطبيق فلتر القسم: ${req.user.DepartmentID}`);
        } else if (viewScope === 'ASSIGNED') {
          permissionScope = ` AND (c.AssignedToUserID = ? OR EXISTS(
            SELECT 1 FROM complaint_assignee_history h
            WHERE h.ComplaintID = c.ComplaintID AND h.ToUserID = ?
          ))`;
          permissionParams.push(req.user.uid || req.user.UserID, req.user.uid || req.user.UserID);
          console.log(`👤 [HISTORY] تطبيق فلتر المسنّدة لي: ${req.user.uid || req.user.UserID}`);
        }
        // إذا كان viewScope === 'HOSPITAL' أو null، لا نضيف قيود إضافية
      } catch (err) {
        console.error('❌ [HISTORY] خطأ في جلب الصلاحيات:', err);
        // في حالة الخطأ، نستمر بدون قيود إضافية
      }
    }

    // شروط فلاتر إضافية
    const where = [];
    const params = [...scope.params, ...permissionParams];

    if (name)   { where.push('c.PatientFullName COLLATE utf8mb4_0900_ai_ci LIKE ?'); params.push(`%${name}%`); }
    if (mobile) { where.push('c.PatientMobile = ?'); params.push(mobile); }
    if (file)   { where.push('c.FileNumber = ?'); params.push(file); }
    if (ticket) { where.push('c.TicketNumber = ?'); params.push(ticket); }
    if (status !== 'ALL') { where.push('c.StatusCode = ?'); params.push(status); }
    if (from)   { where.push('DATE(c.CreatedAt) >= ?'); params.push(from); }
    if (to)     { where.push('DATE(c.CreatedAt) <= ?'); params.push(to); }
    
    // فلتر "المسنّدة لي"
    if (assigned === 'me') {
      const userId = Number(req.user?.uid || req.user?.userId || req.user?.id);
      if (userId) {
        where.push('last_assign.ToUserID = ?');
        params.push(userId);
        console.log(`📌 [HISTORY] فلتر "المسنّدة لي" مفعّل للمستخدم: ${userId}`);
      } else {
        console.log(`⚠️ [HISTORY] لم يتم العثور على معرف المستخدم للفلتر "المسنّدة لي"`);
      }
    }
    
    // لا تعرض المحذوفات منطقياً
    where.push('(c.IsDeleted IS NULL OR c.IsDeleted = 0)');

    const whereSql = `${scope.where}${permissionScope} ${where.length ? ' AND ' + where.join(' AND ') : ''}`;

    const baseSelect = `
      FROM complaints c
      WHERE 1=1 ${whereSql}
    `;

    // استعلام للقاعدة المركزية (مع JOIN hospitals و complaint_types)
    const sqlCentral = `
      SELECT 
        c.ComplaintID         AS id,
        c.TicketNumber        AS ticket,
        c.PatientFullName     AS fullName,
        c.PatientMobile       AS mobile,
        c.FileNumber          AS fileNumber,
        c.StatusCode          AS status,
        c.PriorityCode        AS priority,
        c.HospitalID          AS hospitalId,
        c.DepartmentID        AS departmentId,
        COALESCE(h.NameAr, 'غير محدد') AS hospital,
        c.ComplaintTypeID     AS type,
        t.TypeName            AS typeName,
        DATE_FORMAT(c.CreatedAt, '%Y-%m-%d %H:%i') AS createdAt,
        DATE_FORMAT(c.UpdatedAt, '%Y-%m-%d %H:%i') AS lastUpdate,
        COALESCE((
          SELECT r.Message
          FROM complaint_responses r
          WHERE r.ComplaintID = c.ComplaintID
          ORDER BY r.CreatedAt DESC
          LIMIT 1
        ), '') AS reply
      FROM complaints c
      LEFT JOIN hospitals h ON h.HospitalID = c.HospitalID
      LEFT JOIN complaint_types t ON c.ComplaintTypeID = t.ComplaintTypeID
      /* آخر إسناد */
      LEFT JOIN (
        SELECT ComplaintID, ToUserID
        FROM (
          SELECT ComplaintID, ToUserID,
                 ROW_NUMBER() OVER (PARTITION BY ComplaintID ORDER BY ChangedAt DESC, HistoryID DESC) rn
          FROM complaint_assignee_history
        ) t
        WHERE rn = 1
      ) last_assign ON last_assign.ComplaintID = c.ComplaintID
      WHERE 1=1 ${whereSql}
      ORDER BY c.CreatedAt DESC
      LIMIT ? OFFSET ?
    `;

    // استعلام لقاعدة المستشفى (مع JOIN complaint_types)
    const sqlHospital = `
      SELECT 
        c.ComplaintID         AS id,
        c.TicketNumber        AS ticket,
        c.PatientFullName     AS fullName,
        c.PatientMobile       AS mobile,
        c.FileNumber          AS fileNumber,
        c.StatusCode          AS status,
        c.PriorityCode        AS priority,
        c.HospitalID          AS hospitalId,
        c.DepartmentID        AS departmentId,
        c.ComplaintTypeID     AS type,
        t.TypeName            AS typeName,
        DATE_FORMAT(c.CreatedAt, '%Y-%m-%d %H:%i') AS createdAt,
        DATE_FORMAT(c.UpdatedAt, '%Y-%m-%d %H:%i') AS lastUpdate,
        COALESCE((
          SELECT r.Message
          FROM complaint_responses r
          WHERE r.ComplaintID = c.ComplaintID
          ORDER BY r.CreatedAt DESC
          LIMIT 1
        ), '') AS reply
      FROM complaints c
      LEFT JOIN complaint_types t ON c.ComplaintTypeID = t.ComplaintTypeID
      /* آخر إسناد */
      LEFT JOIN (
        SELECT ComplaintID, ToUserID
        FROM (
          SELECT ComplaintID, ToUserID,
                 ROW_NUMBER() OVER (PARTITION BY ComplaintID ORDER BY ChangedAt DESC, HistoryID DESC) rn
          FROM complaint_assignee_history
        ) t
        WHERE rn = 1
      ) last_assign ON last_assign.ComplaintID = c.ComplaintID
      WHERE 1=1 ${whereSql}
      ORDER BY c.CreatedAt DESC
      LIMIT ? OFFSET ?
    `;
    const sqlCount = `
      SELECT COUNT(*) AS cnt 
      FROM complaints c
      /* آخر إسناد */
      LEFT JOIN (
        SELECT ComplaintID, ToUserID
        FROM (
          SELECT ComplaintID, ToUserID,
                 ROW_NUMBER() OVER (PARTITION BY ComplaintID ORDER BY ChangedAt DESC, HistoryID DESC) rn
          FROM complaint_assignee_history
        ) t
        WHERE rn = 1
      ) last_assign ON last_assign.ComplaintID = c.ComplaintID
      WHERE 1=1 ${whereSql}
    `;
    const sqlKPIs  = `
      SELECT
        SUM(c.StatusCode='OPEN')         AS openCount,
        SUM(c.StatusCode='CLOSED')       AS closedCount,
        SUM(c.StatusCode='CRITICAL')     AS criticalCount
      FROM complaints c
      /* آخر إسناد */
      LEFT JOIN (
        SELECT ComplaintID, ToUserID
        FROM (
          SELECT ComplaintID, ToUserID,
                 ROW_NUMBER() OVER (PARTITION BY ComplaintID ORDER BY ChangedAt DESC, HistoryID DESC) rn
          FROM complaint_assignee_history
        ) t
        WHERE rn = 1
      ) last_assign ON last_assign.ComplaintID = c.ComplaintID
      WHERE 1=1 ${whereSql}
    `;

    // تحديد نوع المستخدم
    const roleId = Number(req.user?.RoleID ?? req.user?.roleId ?? 0);
    const isClusterManager = [1, 4].includes(roleId); // SUPER_ADMIN, CLUSTER_MANAGER
    const requestedHospitalId = req.query.hospitalId ? parseInt(req.query.hospitalId, 10) : null;

    let items = [];
    let total = 0;
    let kpis = { open: 0, closed: 0, critical: 0 };
    let source = '';

    if (isClusterManager && !requestedHospitalId) {
      // مدير التجمع بدون تحديد مستشفى = جمع من جميع المستشفيات
      console.log(`🏥 [HISTORY] مدير التجمع - جمع البيانات من جميع المستشفيات`);
      
      try {
        // جلب جميع المستشفيات النشطة
        const [allHospitals] = await centralDb.query(`
          SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
          FROM hospitals 
          WHERE IFNULL(IsActive, Active) = 1 AND DbName IS NOT NULL
        `);
        
        console.log(`📋 [HISTORY] تم العثور على ${allHospitals.length} مستشفى للبحث`);
        
        const allItems = [];
        let allTotal = 0;
        let allKpis = { open: 0, closed: 0, critical: 0 };
        
        // البحث في كل مستشفى
        for (const hospital of allHospitals) {
          try {
            console.log(`🔍 [HISTORY] البحث في مستشفى ${hospital.HospitalID}: ${hospital.NameAr}`);
            
            const hospitalPool = mysql.createPool({
              host: hospital.DbHost || 'localhost',
              user: hospital.DbUser || 'root',
              password: hospital.DbPass || '',
              database: hospital.DbName,
              waitForConnections: true,
              connectionLimit: 3
            });

            // استعلام البلاغات من هذا المستشفى
            const [hospitalRows] = await hospitalPool.query(sqlHospital, [...params, 1000, 0]); // جلب أكثر من المطلوب للترتيب
            const [[hospitalCount]] = await hospitalPool.query(sqlCount, params);
            const [[hospitalKpis]] = await hospitalPool.query(sqlKPIs, params);

            if (hospitalRows.length > 0) {
              console.log(`✅ [HISTORY] تم العثور على ${hospitalRows.length} بلاغ في ${hospital.NameAr}`);
              
              // إضافة اسم المستشفى لكل بلاغ
              const enrichedRows = hospitalRows.map(item => ({
                ...item,
                hospital: hospital.NameAr
              }));
              
              allItems.push(...enrichedRows);
              allTotal += hospitalCount?.cnt || 0;
              allKpis.open += Number(hospitalKpis?.openCount || 0);
              allKpis.closed += Number(hospitalKpis?.closedCount || 0);
              allKpis.critical += Number(hospitalKpis?.criticalCount || 0);
            }
            
            hospitalPool.end();
          } catch (error) {
            console.error(`❌ [HISTORY] خطأ في مستشفى ${hospital.HospitalID}:`, error.message);
          }
        }
        
        // ترتيب النتائج حسب التاريخ (الأحدث أولاً)
        allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // تطبيق الترقيم (pagination)
        const startIndex = offset;
        const endIndex = startIndex + pageSize;
        items = allItems.slice(startIndex, endIndex);
        total = allItems.length; // إجمالي من جميع المستشفيات
        kpis = allKpis;
        source = 'all-hospitals';
        
        console.log(`📊 [HISTORY] إجمالي النتائج: ${items.length} من ${total} (صفحة ${page})`);
        
      } catch (error) {
        console.error('❌ [HISTORY] خطأ في جمع البيانات من المستشفيات:', error.message);
      }
      
    } else {
      // منطق عادي: موظف مستشفى أو مدير تجمع يحدد مستشفى معين
      const hospitalId = req.user?.HospitalID || req.user?.hospitalId || parseInt(req.query.hospitalId, 10);
      
      console.log(`🔍 [TRACK] منطق عادي - hospitalId: ${hospitalId}`);
      
      if (Number.isFinite(hospitalId)) {
        // البحث مباشرة في قاعدة المستشفى
        console.log(`🏥 [HISTORY] البحث في قاعدة المستشفى ${hospitalId}`);
        
        try {
          const hospitalInfo = await getHospitalInfo(hospitalId);
          if (hospitalInfo && hospitalInfo.DbName) {
            // إنشاء اتصال بقاعدة المستشفى
            const hospitalPool = mysql.createPool({
              host: process.env.CENTRAL_DB_HOST || 'localhost',
              user: process.env.CENTRAL_DB_USER || 'root',
              password: process.env.CENTRAL_DB_PASS || 'Raneem11',
              database: hospitalInfo.DbName,
              waitForConnections: true,
              connectionLimit: 5
            });

            const [rowsHospital] = await hospitalPool.query(sqlHospital, [...params, pageSize, offset]);
            const [[cntHospital]] = await hospitalPool.query(sqlCount, params);
            const [[kpisHospital]] = await hospitalPool.query(sqlKPIs, params);

            console.log(`📋 [HISTORY] نتائج المستشفى ${hospitalId}:`, { rowsCount: rowsHospital.length, total: cntHospital?.cnt, kpis: kpisHospital });
            
            // ربط أسماء المستشفيات من الـ Map
            // ✅ استخدام اسم المستشفى من hospitalInfo أولاً لضمان الاتساق
            items = rowsHospital.map(item => ({
              ...item,
              hospital: hospitalInfo.NameAr || hospitalsMap.get(hospitalId)?.nameAr || hospitalsMap.get(item.hospitalId)?.nameAr || 'غير محدد',
              hospitalNameAr: hospitalInfo.NameAr || hospitalsMap.get(hospitalId)?.nameAr || 'غير محدد',
              HospitalID: hospitalId // تأكد من وجود HospitalID
            }));
            
            total = cntHospital?.cnt || 0;
            kpis = {
              open: Number(kpisHospital?.openCount || 0),
              closed: Number(kpisHospital?.closedCount || 0),
              critical: Number(kpisHospital?.criticalCount || 0)
            };
            source = 'hospital';

            await hospitalPool.end();
          } else {
            console.log(`⚠️ [HISTORY] معلومات المستشفى ${hospitalId} غير متوفرة`);
          }
        } catch (error) {
          console.error(`❌ [HISTORY] خطأ في الاتصال بقاعدة المستشفى ${hospitalId}:`, error.message);
        }
      } else {
        // لا يوجد مستشفى محدد - جرب المركزية أولاً
        console.log(`📋 [HISTORY] استعلام المركزية (لا يوجد مستشفى محدد):`, sqlCentral.substring(0, 100) + '...');
      
        const [rowsCentral] = await centralDb.query(sqlCentral, [...params, pageSize, offset]);
        const [[cntCentral]] = await centralDb.query(sqlCount, params);
        const [[kpisCentral]] = await centralDb.query(sqlKPIs, params);
        
        console.log(`📋 [HISTORY] نتائج المركزية:`, { rowsCount: rowsCentral.length, total: cntCentral?.cnt, kpis: kpisCentral });

        items = rowsCentral;
        total = cntCentral?.cnt || 0;
        kpis = {
          open: Number(kpisCentral?.openCount || 0),
          closed: Number(kpisCentral?.closedCount || 0),
          critical: Number(kpisCentral?.criticalCount || 0)
        };
        source = 'central';
        
        // إذا لم توجد نتائج في المركزية، جرب البحث في جميع المستشفيات كبديل احتياطي
        if (!items.length) {
          console.log(`🔄 [HISTORY] لا توجد نتائج في المركزية، البحث في جميع المستشفيات كبديل احتياطي`);
          
          try {
            // جلب جميع المستشفيات النشطة
            const [allHospitals] = await centralDb.query(`
              SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
              FROM hospitals 
              WHERE IFNULL(IsActive, Active) = 1 AND DbName IS NOT NULL
            `);
            
            console.log(`📋 [HISTORY] البحث في ${allHospitals.length} مستشفى كبديل احتياطي`);
            
            const allItems = [];
            let allKpis = { open: 0, closed: 0, critical: 0 };
            
            // البحث في كل مستشفى
            for (const hospital of allHospitals) {
              try {
                console.log(`🔍 [HISTORY] البحث في مستشفى ${hospital.HospitalID}: ${hospital.NameAr}`);
                
                const hospitalPool = mysql.createPool({
                  host: hospital.DbHost || 'localhost',
                  user: hospital.DbUser || 'root',
                  password: hospital.DbPass || '',
                  database: hospital.DbName,
                  waitForConnections: true,
                  connectionLimit: 3
                });

                const [hospitalRows] = await hospitalPool.query(sqlHospital, [...params, 1000, 0]);
                const [[hospitalKpis]] = await hospitalPool.query(sqlKPIs, params);

                if (hospitalRows.length > 0) {
                  console.log(`✅ [HISTORY] تم العثور على ${hospitalRows.length} بلاغ في ${hospital.NameAr}`);
                  
                  // إضافة اسم المستشفى لكل بلاغ
                  const enrichedRows = hospitalRows.map(item => ({
                    ...item,
                    hospital: hospital.NameAr
                  }));
                  
                  allItems.push(...enrichedRows);
                  allKpis.open += Number(hospitalKpis?.openCount || 0);
                  allKpis.closed += Number(hospitalKpis?.closedCount || 0);
                  allKpis.critical += Number(hospitalKpis?.criticalCount || 0);
                }
                
                hospitalPool.end();
        } catch (error) {
                console.error(`❌ [HISTORY] خطأ في مستشفى ${hospital.HospitalID}:`, error.message);
              }
            }
            
            if (allItems.length > 0) {
              // ترتيب النتائج حسب التاريخ (الأحدث أولاً)
              allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
              
              // تطبيق الترقيم (pagination)
              const startIndex = offset;
              const endIndex = startIndex + pageSize;
              items = allItems.slice(startIndex, endIndex);
              total = allItems.length;
              kpis = allKpis;
              source = 'all-hospitals-fallback';
              
              console.log(`📊 [HISTORY] تم العثور على ${items.length} نتيجة من جميع المستشفيات كبديل احتياطي`);
            }
            
          } catch (error) {
            console.error('❌ [HISTORY] خطأ في البحث الاحتياطي:', error.message);
          }
        }
      }
    } // إغلاق else block

    // نجاح
    return res.json({
      ok: true,
      source,
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      kpis
    });

  } catch (err) {
    console.error('❌ خطأ في /history:', err);
    res.status(500).json({ 
      ok: false,
      message: 'حدث خطأ في الخادم',
      error: err.message 
    });
  }
});

/**
 * GET /api/complaints/:id
 * يُعيد تفاصيل البلاغ + المرفقات + السجل
 */
router.get('/:id', optionalAuth, async (req, res) => {
  const id = req.params.id;

  try {
    // الحصول على الاتصال المناسب حسب المستخدم
    const pool = await getContextualPool(req.user, req);
    
    // 1) البلاغ الأساسي + الأسماء
    const [rows] = await pool.query(`
      SELECT
        c.ComplaintID,
        COALESCE(NULLIF(c.TicketNumber,''), CONCAT('C-', c.ComplaintID)) AS TicketNo,
        c.HospitalID, c.DepartmentID, c.CreatedByUserID,
        c.SubmissionType, c.StatusCode, c.PriorityCode,
        c.Description, c.CreatedAt, c.UpdatedAt,
        d.NameAr AS DepartmentNameAr,
        d.NameEn AS DepartmentNameEn,
        u.FullName AS CreatedByFullName,
        ${CATEGORY_SQL} AS Category
      FROM complaints c
      LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
      LEFT JOIN users       u ON u.UserID       = c.CreatedByUserID
      LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
      WHERE c.ComplaintID = ?
      LIMIT 1
    `, [id]);

    if (!rows.length) return res.status(404).json({ error: 'Complaint not found' });
    const c = rows[0];

    // 1.5) جلب اسم المستشفى من القاعدة المركزية
    let hospitalName = null;
    if (c.HospitalID) {
      try {
        const centralPool = await getCentralPool();
        const [hospitalRows] = await centralPool.query(`
          SELECT NameAr AS HospitalNameAr, NameEn AS HospitalNameEn
          FROM hospitals
          WHERE HospitalID = ?
        `, [c.HospitalID]);
        
        if (hospitalRows.length > 0) {
          hospitalName = hospitalRows[0].HospitalNameAr || hospitalRows[0].HospitalNameEn;
        }
      } catch (error) {
        console.error('خطأ في جلب اسم المستشفى:', error);
      }
    }

    // 2) المرفقات (اختياري إن كان جدول attachments موجود)
    let attachments = [];
    try {
      const [att] = await pool.query(`
        SELECT AttachmentID, FileName, FilePath, Description
        FROM attachments
        WHERE ComplaintID = ?
        ORDER BY AttachmentID DESC
      `, [id]);
      attachments = att.map(a => ({
        name: a.FileName || a.Description || `Attachment #${a.AttachmentID}`,
        url: a.FilePath || '#'
      }));
    } catch (_) { /* جدول مرفقات غير موجود */ }

    // 3) السجل الزمني (نستخدم logs لو موجود، وإلا complaint_responses)
    let history = [];
    try {
      const [lg] = await pool.query(`
        SELECT CreatedAt AS at, COALESCE(ActionAr, ActionCode) AS action,
               COALESCE(u.FullName, 'النظام') AS by
        FROM logs l
        LEFT JOIN users u ON u.UserID = l.ActorUserID
        WHERE l.HospitalID = ? AND (l.Details LIKE CONCAT('%', ?, '%') OR l.Details LIKE CONCAT('%ComplaintID=', ?, '%'))
        ORDER BY l.CreatedAt ASC
      `, [c.HospitalID, c.TicketNo || '', id]);
      history = lg.map(x => ({ at: x.at, action: x.action, by: x.by }));
    } catch (_) {
      // خيار بديل: complaint_responses إن كان موجود
      try {
        const [rp] = await pool.query(`
          SELECT r.CreatedAt AS at,
                 CONCAT('رد: ', COALESCE(rt.NameAr, 'بدون نوع')) AS action,
                 u.FullName AS by
          FROM complaint_responses r
          LEFT JOIN reply_types rt ON rt.ReplyTypeID = r.ReplyTypeID
          LEFT JOIN users u ON u.UserID = r.ResponderUserID
          WHERE r.ComplaintID = ?
          ORDER BY r.CreatedAt ASC
        `, [id]);
        history = rp.map(x => ({ at: x.at, action: x.action, by: x.by }));
      } catch(__) { /* لا شيء */ }
    }

    // 4) تركيب الاستجابة بواجهة موحّدة لفرونت
    res.json({
      id: c.TicketNo,
      complaintId: c.ComplaintID,
      hospitalId: c.HospitalID,
      hospital: hospitalName || '—',
      hospitalNameAr: hospitalName,
      dept: c.DepartmentNameAr || c.DepartmentNameEn || '—',
      departmentNameAr: c.DepartmentNameAr,
      departmentNameEn: c.DepartmentNameEn,
      category: c.Category,         // 'complaint' | 'suggestion' | 'critical'
      status: c.StatusCode || 'open',
      createdAt: c.CreatedAt,
      updatedAt: c.UpdatedAt,
      reporter: c.CreatedByFullName || '—',
      createdByFullName: c.CreatedByFullName,
      assignee: null,               // إذا عندك جدول إسناد، املئيه لاحقًا
      source: c.SubmissionType || '—',
      description: c.Description || '',
      attachments,
      history
    });
  } catch (err) {
    console.error('GET /complaints/:id error', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * DELETE /api/complaints/:id
 * حذف منطقي للبلاغ (نقله إلى سلة المحذوفات)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const user = req.user;
  const hospitalId = Number(user.hospitalId);
  
  if (!hospitalId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Hospital ID مفقود في التوكن' 
    });
  }

  // الحصول على اتصال قاعدة المستشفى المناسب
  const hospitalPool = await getContextualPool(user);
  const connection = await hospitalPool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { deleteReason } = req.body;
    const userId = req.user?.UserID;

    // جلب بيانات البلاغ قبل الحذف
    const [complaints] = await connection.query(`
      SELECT 
        c.ComplaintID,
        c.TicketNumber,
        c.HospitalID,
        c.DepartmentID,
        c.PriorityCode,
        c.StatusCode,
        c.SubmissionType,
        c.Description,
        c.CreatedAt,
        c.PatientFullName,
        d.NameAr AS DepartmentName,
        ct.TypeName AS ComplaintTypeName
      FROM complaints c
      LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
      LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
      WHERE c.ComplaintID = ? AND (c.IsDeleted IS NULL OR c.IsDeleted = 0)
    `, [id]);

    if (complaints.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'البلاغ غير موجود أو محذوف مسبقاً' 
      });
    }

    const complaint = complaints[0];

    // الحذف المنطقي
    await connection.query(`
      UPDATE complaints 
      SET IsDeleted = 1,
          DeletedAt = NOW(),
          DeletedByUserID = ?,
          DeleteReason = ?
      WHERE ComplaintID = ?
    `, [userId, deleteReason || null, id]);

    // إضافة إلى سلة المحذوفات
    const entityTitle = complaint.TicketNumber 
      ? `بلاغ #${complaint.TicketNumber}`
      : `بلاغ رقم ${complaint.ComplaintID}`;

    const snapshot = {
      ComplaintID: complaint.ComplaintID,
      TicketNumber: complaint.TicketNumber,
      DepartmentID: complaint.DepartmentID,
      DepartmentName: complaint.DepartmentName,
      PriorityCode: complaint.PriorityCode,
      StatusCode: complaint.StatusCode,
      SubmissionType: complaint.SubmissionType,
      PatientFullName: complaint.PatientFullName,
      ComplaintTypeName: complaint.ComplaintTypeName,
      CreatedAt: complaint.CreatedAt,
      Description: complaint.Description?.substring(0, 200) // أول 200 حرف فقط
    };

    // ✅ استخدام addToTrash بدلاً من INSERT مباشر
    await addToTrash({
      hospitalId: complaint.HospitalID,
      entityType: 'COMPLAINT',
      entityTable: 'complaints',
      entityId: complaint.ComplaintID,
      entityTitle: entityTitle,
      entitySnapshot: snapshot,
      deleteReason: deleteReason || null,
      deletedByUserId: userId
    });

    await connection.commit();

    res.json({
      success: true,
      message: 'تم حذف البلاغ ونقله إلى سلة المحذوفات',
      data: {
        complaintId: complaint.ComplaintID,
        ticketNumber: complaint.TicketNumber,
        entityTitle
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('خطأ في حذف البلاغ:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء حذف البلاغ',
      error: error.message 
    });
  } finally {
    connection.release();
  }
});

/**
 * POST /api/complaints
 * إنشاء بلاغ جديد (يتطلب تسجيل دخول)
 * HospitalID يؤخذ من التوكن، لا يُرسل من العميل
 * ✅ يدعم FormData مع المرفقات
 */
router.post('/', requireAuth, upload.array('attachments', 10), resolveHospitalId, async (req, res) => {
  const user = req.user;
  const hospitalId = Number(req.hospitalId); // من الميدلوير
  const userId = Number(user.id);
    
    if (!hospitalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Hospital ID مفقود - يجب تحديد المستشفى في الهيدر أو التوكن' 
      });
    }

  // الحصول على اتصال قاعدة المستشفى المناسب
  const hospitalPool = await getContextualPool(user);
  const connection = await hospitalPool.getConnection();
  
  try {

    console.log('📥 البيانات المستلمة:', {
      body: req.body,
      files: req.files?.length || 0
    });

    // ✅ دعم الاسمين (PascalCase و camelCase)
    const DepartmentID     = Number(req.body.DepartmentID || req.body.departmentId || 0);
    const PatientFullName  = (req.body.PatientFullName || req.body.patientName || '').trim();
    const Description      = (req.body.Description || req.body.description || '').trim();
    
    const VisitDate        = req.body.VisitDate || req.body.visitDate || null;
    const PatientIDNumber  = req.body.PatientIDNumber || req.body.patientIdNumber || null;
    const PatientMobile    = req.body.PatientMobile || req.body.patientMobile || null;
    const GenderCode       = req.body.GenderCode || req.body.genderCode || null;
    const FileNumber       = req.body.FileNumber || req.body.fileNumber || null;
    const ComplaintTypeID  = Number(req.body.ComplaintTypeID || req.body.complaintTypeId || 0) || null;
    const SubTypeID        = Number(req.body.SubTypeID || req.body.subTypeId || 0) || null;
    
    // ✅ تحديد الأولوية: إذا كان التصنيف "سوء معاملة" (ComplaintTypeID = 17) → URGENT
    let PriorityCode = (req.body.PriorityCode || req.body.priorityCode || 'MEDIUM').toUpperCase();
    if (ComplaintTypeID === 17) {
      PriorityCode = 'URGENT';
      console.log('🚨 تم تعيين الأولوية إلى URGENT لأن التصنيف هو "سوء معاملة"');
    }
    
    const SubmissionType   = req.body.SubmissionType || req.body.submissionType || '937';
    
    // ✅ تأكيد StatusCode بحروف كبيرة
    const StatusCode       = 'OPEN';

    console.log('📋 البيانات المُعالجة:', {
      DepartmentID,
      PatientFullName: PatientFullName?.substring(0, 20),
      Description: Description?.substring(0, 30),
      HospitalID: hospitalId
    });

    // التحقق من الحقول الإلزامية
    if (!DepartmentID || !PatientFullName || !Description) {
      return res.status(400).json({
        success: false,
        message: 'الحقول الإلزامية مفقودة',
        missing: {
          DepartmentID: !DepartmentID,
          PatientFullName: !PatientFullName,
          Description: !Description
        },
        received: { DepartmentID, PatientFullName, Description }
      });
    }

    await connection.beginTransaction();

    // توليد رقم التذكرة باستخدام ticket_counters (atomic)
    const year = new Date().getFullYear();
    
    // ✅ زيادة العداد بشكل ذري (atomic) باستخدام LAST_INSERT_ID
    await connection.query(`
      INSERT INTO ticket_counters (YearSmall, LastSeq)
      VALUES (YEAR(CURDATE()), 0)
      ON DUPLICATE KEY UPDATE LastSeq = LAST_INSERT_ID(LastSeq + 1)
    `);

    // ✅ جلب الرقم الذي زاد للتو (آمن من التزامن)
    const [[{ seq }]] = await connection.query('SELECT LAST_INSERT_ID() AS seq');
    
    const ticketNumber = `C-${year}-${String(seq).padStart(6, '0')}`;

    // إدخال البلاغ
    const [result] = await connection.query(`
      INSERT INTO complaints (
        TicketNumber,
        HospitalID,
        DepartmentID,
        SubmissionType,
        VisitDate,
        PatientFullName,
        PatientIDNumber,
        PatientMobile,
        GenderCode,
        FileNumber,
        ComplaintTypeID,
        SubTypeID,
        Description,
        PriorityCode,
        StatusCode,
        CreatedByUserID
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `, [
      ticketNumber,
      hospitalId,
      DepartmentID,
      SubmissionType,
      VisitDate,
      PatientFullName,
      PatientIDNumber,
      PatientMobile,
      GenderCode,
      FileNumber,
      ComplaintTypeID,
      SubTypeID,
      Description,
      PriorityCode,
      StatusCode,
      userId
    ]);

    const complaintId = result.insertId;

    await connection.commit();

    // ✅ الـ trigger سيُدخل في outbox_events تلقائياً

    console.log(`✅ تم إنشاء البلاغ #${complaintId} - ${ticketNumber}`);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء البلاغ بنجاح',
      data: {
        ComplaintID: complaintId,
        TicketNumber: ticketNumber,
        PriorityCode: PriorityCode,
        StatusCode: 'OPEN',
        HospitalID: hospitalId
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ خطأ في إنشاء البلاغ:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء البلاغ',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

export default router;