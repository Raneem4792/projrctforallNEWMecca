// controllers/permissions.controller.js
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

// helper: استنتاج HospitalID الفعلي (مدير مستشفى نثبت على مستشفاه)
function resolveHid(req) {
  const roleId = req.user?.RoleID;
  
  // مدير التجمع (RoleID = 1) - يمكنه الوصول لأي مستشفى
  if (roleId === 1) {
    const q = Number(req.query.hospitalId || req.body.hospitalId);
    if (!q) throw new Error('hospitalId required for central admin');
    return q;
  }
  
  // مدير مستشفى (RoleID = 2) - مقيد بمستشفاه فقط
  if (roleId === 2) {
    return req.user.HospitalID;
  }
  
  // موظف عادي (RoleID = 3) - مقيد بمستشفاه فقط
  if (roleId === 3) {
    return req.user.HospitalID;
  }
  
  throw new Error('Invalid role or insufficient permissions');
}

export async function listUsersForHospital(req, res) {
  try {
    const hid = resolveHid(req);
    const roleId = req.user?.RoleID;
    const tenant = await getTenantPoolByHospitalId(hid);
    
    let query = `
      SELECT u.UserID, u.FullName, u.Username, u.DepartmentID
      FROM users u
      WHERE u.HospitalID = ?
    `;
    
    // للموظفين العاديين، اعرض المستخدمين الآخرين فقط (ليس نفسه)
    if (roleId === 3) {
      query += ` AND u.UserID != ?`;
      const [rows] = await tenant.query(query, [hid, req.user.UserID]);
      res.json({ ok:true, data: rows });
    } else {
      // للمديرين، اعرض جميع المستخدمين
      const [rows] = await tenant.query(query + ` ORDER BY u.FullName`, [hid]);
      res.json({ ok:true, data: rows });
    }
  } catch (e) {
    res.status(400).json({ ok:false, error: e.message });
  }
}

// قراءة صلاحيات مستخدم معيّن
export async function getUserPermissions(req, res) {
  try {
    const hid = resolveHid(req);
    const userId = Number(req.params.userId);
    const roleId = req.user?.RoleID;
    const tenant = await getTenantPoolByHospitalId(hid);

    // للموظفين العاديين، تأكد أنهم لا يحاولون رؤية صلاحيات أنفسهم
    if (roleId === 3 && userId === req.user.UserID) {
      return res.status(403).json({ 
        ok: false, 
        error: 'لا يمكنك رؤية صلاحياتك الخاصة من هذا الـendpoint' 
      });
    }

    const [perms] = await tenant.query(`
      SELECT PermissionKey, ViewScope
      FROM user_permissions
      WHERE UserID=? AND HospitalID=?
    `, [userId, hid]);

    // خرّجيها كبوليانات + scope
    const has = k => perms.some(p => p.PermissionKey === k);
    const scope = perms.find(p => p.PermissionKey==='COMPLAINT_HISTORY_SCOPE')?.ViewScope || null;

    res.json({
      ok:true,
      data: {
        submit: has('COMPLAINT_SUBMIT'),
        view:   has('COMPLAINT_VIEW'),
        historyScope: scope,             // HOSPITAL|DEPARTMENT|ASSIGNED|null
        reply:  has('COMPLAINT_REPLY'),
        transfer: has('COMPLAINT_TRANSFER'),
        transferDept: has('COMPLAINT_TRANSFER_DEPT'),
        transferUser: has('COMPLAINT_TRANSFER_USER'),
        statusUpdate: has('COMPLAINT_STATUS_UPDATE'),
        remove: has('COMPLAINT_DELETE'),
        // مدير التجمع (RoleID = 1) دائماً له صلاحية الإدارة
        adminPanel: has('ADMIN_PANEL_ACCESS') || req.user?.RoleID === 1,
        adminDepartments: has('ADMIN_DEPARTMENTS'),
        adminHospital: has('ADMIN_HOSPITAL'),
        adminClusters: has('ADMIN_CLUSTERS'),
        hospitalCreate: has('HOSPITAL_CREATE'),
        // صلاحيات إدارة المستشفى (الأيقونات الأربعة)
        hospitalTrash: has('HOSPITAL_TRASH'),
        hospitalLogs: has('HOSPITAL_LOGS'),
        hospitalPermissions: has('HOSPITAL_PERMISSIONS'),
        hospitalUsers: has('HOSPITAL_USERS'),
        hospitalUserCreate: has('HOSPITAL_USER_CREATE'),
        hospitalUserEdit: has('HOSPITAL_USER_EDIT'),
        hospitalUserDelete: has('HOSPITAL_USER_DELETE'),
        improvementCreate: has('IMPROVEMENT_CREATE'),
        improvementView: has('IMPROVEMENT_VIEW'),
        improvementEdit: has('IMPROVEMENT_EDIT'),
        improvementDelete: has('IMPROVEMENT_DELETE'),
        improvementReportView: has('IMPROVEMENT_REPORT_VIEW'),
        improvementsModule: has('IMPROVEMENTS_MODULE'),
        // صلاحيات الزائر السري
        mysteryModule: has('MYSTERY_MODULE'),
        mysteryView: has('MYSTERY_VIEW'),
        mysteryReplyAdd: has('MYSTERY_REPLY_ADD'),
        mysteryStatusUpdate: has('MYSTERY_STATUS_UPDATE'),
        mysteryTransferDept: has('MYSTERY_TRANSFER_DEPT'),
        mysteryTransferEmp: has('MYSTERY_TRANSFER_EMP'),
        mysteryDelete: has('MYSTERY_DELETE'),
        // صلاحيات الاستيراد
        importsPage: has('IMPORTS_PAGE'),
        importDepartments: has('IMPORTS_DEPARTMENTS'),
        importMystery: has('IMPORTS_MYSTERY'),
        import937: has('IMPORTS_937'),
        // ===== Dashboard permissions =====
        dashPage:             has('DASH_PAGE'),
        dashCardTotals:       has('DASH_CARD_TOTALS'),
        dashCardOpen:         has('DASH_CARD_OPEN'),
        dashCardClosed:       has('DASH_CARD_CLOSED'),
        dashCardUrgent:       has('DASH_CARD_URGENT'),
        dashCardCloseRate:    has('DASH_CARD_CLOSE_RATE'),
        dashCardHospCount:    has('DASH_CARD_HOSPITAL_COUNT'),
        dashChartMystery:     has('DASH_CHART_MYSTERY_BY_DEPT'),
        dashChartClasses:     has('DASH_CHART_CLASSIFICATIONS'),
        dashChartTopClinics:  has('DASH_CHART_TOP_CLINICS'),
        dashChartDailyTrend:  has('DASH_CHART_DAILY_TREND'),
        dashUrgentList:       has('DASH_URGENT_LIST'),
        // ===== Reports permissions =====
        reportsPage:              has('REPORTS_PAGE'),
        reportsCardTotals:        has('REPORTS_CARD_TOTALS'),
        reportsCardOpen:          has('REPORTS_CARD_OPEN'),
        reportsCardClosed:        has('REPORTS_CARD_CLOSED'),
        reportsCardUrgent:        has('REPORTS_CARD_URGENT'),
        reportsCardSLA:           has('REPORTS_CARD_SLA'),
        reportsCardHospitals:     has('REPORTS_CARD_HOSPITALS'),
        reportsChartByHospitalType:    has('REPORTS_CHART_BY_HOSPITAL_TYPE'),
        reportsChartStatusDistribution: has('REPORTS_CHART_STATUS_DISTRIBUTION'),
        reportsChartTrend6m:           has('REPORTS_CHART_TREND_6M'),
        reportsChartUrgentPercent:     has('REPORTS_CHART_URGENT_PERCENT'),
        reportsChartByDepartment:      has('REPORTS_CHART_BY_DEPARTMENT'),
        reportsChartTopEmployees:      has('REPORTS_CHART_TOP_EMPLOYEES'),
        // ===== صلاحيات بلاغات إدارة التجمع =====
        clusterSubmit:  has('CLUSTER_REPORT_CREATE'),
        clusterView:    has('CLUSTER_REPORT_VIEW'),
        clusterDetails: has('CLUSTER_REPORT_DETAILS'),
        clusterReply:   has('CLUSTER_REPORT_REPLY'),
        clusterStatus:  has('CLUSTER_REPORT_STATUS'),
        // ===== صلاحيات الأرشيف =====
        archiveView:   has('ARCHIVE_VIEW'),
        archiveUpload: has('ARCHIVE_UPLOAD')
      }
    });
  } catch (e) {
    res.status(400).json({ ok:false, error: e.message });
  }
}

// حفظ صلاحيات مستخدم معيّن
export async function saveUserPermissions(req, res) {
  try {
    const hid = resolveHid(req);
    const targetUserId = Number(req.params.userId);
    const {
      submit, view, historyScope, reply, transfer, transferDept, transferUser, statusUpdate, remove, adminPanel,
      adminDepartments, adminHospital, adminClusters, hospitalCreate,
      hospitalTrash, hospitalLogs, hospitalPermissions, hospitalUsers, hospitalUserCreate, hospitalUserEdit, hospitalUserDelete,
      improvementCreate, improvementView, improvementEdit, improvementDelete, improvementReportView, improvementsModule,
      mysteryModule, mysteryView, mysteryReplyAdd, mysteryStatusUpdate, mysteryTransferDept, mysteryTransferEmp, mysteryDelete,
      importsPage, importDepartments, importMystery, import937,
      // Dashboard permissions
      dashPage, dashCardTotals, dashCardOpen, dashCardClosed, dashCardUrgent, dashCardCloseRate, dashCardHospCount,
      dashChartMystery, dashChartClasses, dashChartTopClinics, dashChartDailyTrend, dashUrgentList,
      // Reports permissions
      reportsPage, reportsCardTotals, reportsCardOpen, reportsCardClosed, reportsCardUrgent, reportsCardSLA, reportsCardHospitals,
        reportsChartByHospitalType, reportsChartStatusDistribution, reportsChartTrend6m, reportsChartUrgentPercent, reportsChartByDepartment, reportsChartTopEmployees,
      // صلاحيات بلاغات إدارة التجمع
      clusterSubmit, clusterView, clusterDetails, clusterReply, clusterStatus,
      // صلاحيات الأرشيف
      archiveView, archiveUpload
    } = req.body;
    
    console.log('📥 Received archive permissions:', {
      archiveView,
      archiveUpload,
      hospitalId: hid,
      targetUserId
    });

    const tenant = await getTenantPoolByHospitalId(hid);
    const conn = await tenant.getConnection();

    const upsert = async (key, scope=null) => {
      await conn.query(`
        INSERT INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope)
        VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE ViewScope=VALUES(ViewScope), GrantedAt=NOW()
      `, [targetUserId, hid, key, scope]);
    };
    const drop = async (key) => {
      await conn.query(`
        DELETE FROM user_permissions
        WHERE UserID=? AND HospitalID=? AND PermissionKey=?
      `, [targetUserId, hid, key]);
    };

    await conn.beginTransaction();

    // مفاتيح بدون نطاق
    submit ? await upsert('COMPLAINT_SUBMIT')      : await drop('COMPLAINT_SUBMIT');
    view   ? await upsert('COMPLAINT_VIEW')        : await drop('COMPLAINT_VIEW');
    reply  ? await upsert('COMPLAINT_REPLY')       : await drop('COMPLAINT_REPLY');
    transfer ? await upsert('COMPLAINT_TRANSFER')  : await drop('COMPLAINT_TRANSFER');
    transferDept ? await upsert('COMPLAINT_TRANSFER_DEPT') : await drop('COMPLAINT_TRANSFER_DEPT');
    transferUser ? await upsert('COMPLAINT_TRANSFER_USER') : await drop('COMPLAINT_TRANSFER_USER');
    statusUpdate ? await upsert('COMPLAINT_STATUS_UPDATE') : await drop('COMPLAINT_STATUS_UPDATE');
    remove ? await upsert('COMPLAINT_DELETE')      : await drop('COMPLAINT_DELETE');
    adminPanel ? await upsert('ADMIN_PANEL_ACCESS') : await drop('ADMIN_PANEL_ACCESS');
    adminDepartments ? await upsert('ADMIN_DEPARTMENTS') : await drop('ADMIN_DEPARTMENTS');
    adminHospital ? await upsert('ADMIN_HOSPITAL') : await drop('ADMIN_HOSPITAL');
    adminClusters ? await upsert('ADMIN_CLUSTERS') : await drop('ADMIN_CLUSTERS');
    hospitalCreate ? await upsert('HOSPITAL_CREATE') : await drop('HOSPITAL_CREATE');
    // صلاحيات إدارة المستشفى (الأيقونات الأربعة)
    hospitalTrash ? await upsert('HOSPITAL_TRASH') : await drop('HOSPITAL_TRASH');
    hospitalLogs ? await upsert('HOSPITAL_LOGS') : await drop('HOSPITAL_LOGS');
    hospitalPermissions ? await upsert('HOSPITAL_PERMISSIONS') : await drop('HOSPITAL_PERMISSIONS');
    hospitalUsers ? await upsert('HOSPITAL_USERS') : await drop('HOSPITAL_USERS');
    hospitalUserCreate ? await upsert('HOSPITAL_USER_CREATE') : await drop('HOSPITAL_USER_CREATE');
    hospitalUserEdit ? await upsert('HOSPITAL_USER_EDIT') : await drop('HOSPITAL_USER_EDIT');
    hospitalUserDelete ? await upsert('HOSPITAL_USER_DELETE') : await drop('HOSPITAL_USER_DELETE');
    improvementCreate ? await upsert('IMPROVEMENT_CREATE') : await drop('IMPROVEMENT_CREATE');
    improvementView ? await upsert('IMPROVEMENT_VIEW') : await drop('IMPROVEMENT_VIEW');
    improvementEdit ? await upsert('IMPROVEMENT_EDIT') : await drop('IMPROVEMENT_EDIT');
    improvementDelete ? await upsert('IMPROVEMENT_DELETE') : await drop('IMPROVEMENT_DELETE');
    improvementReportView ? await upsert('IMPROVEMENT_REPORT_VIEW') : await drop('IMPROVEMENT_REPORT_VIEW');
    improvementsModule ? await upsert('IMPROVEMENTS_MODULE') : await drop('IMPROVEMENTS_MODULE');
    // صلاحيات الزائر السري
    mysteryModule ? await upsert('MYSTERY_MODULE') : await drop('MYSTERY_MODULE');
    mysteryView ? await upsert('MYSTERY_VIEW') : await drop('MYSTERY_VIEW');
    mysteryReplyAdd ? await upsert('MYSTERY_REPLY_ADD') : await drop('MYSTERY_REPLY_ADD');
    mysteryStatusUpdate ? await upsert('MYSTERY_STATUS_UPDATE') : await drop('MYSTERY_STATUS_UPDATE');
    mysteryTransferDept ? await upsert('MYSTERY_TRANSFER_DEPT') : await drop('MYSTERY_TRANSFER_DEPT');
    mysteryTransferEmp ? await upsert('MYSTERY_TRANSFER_EMP') : await drop('MYSTERY_TRANSFER_EMP');
    mysteryDelete ? await upsert('MYSTERY_DELETE') : await drop('MYSTERY_DELETE');
    // صلاحيات الاستيراد
    importsPage ? await upsert('IMPORTS_PAGE') : await drop('IMPORTS_PAGE');
    importDepartments ? await upsert('IMPORTS_DEPARTMENTS') : await drop('IMPORTS_DEPARTMENTS');
    importMystery ? await upsert('IMPORTS_MYSTERY') : await drop('IMPORTS_MYSTERY');
    import937 ? await upsert('IMPORTS_937') : await drop('IMPORTS_937');
    
    // Dashboard permissions
    dashPage ? await upsert('DASH_PAGE') : await drop('DASH_PAGE');
    dashCardTotals ? await upsert('DASH_CARD_TOTALS') : await drop('DASH_CARD_TOTALS');
    dashCardOpen   ? await upsert('DASH_CARD_OPEN')   : await drop('DASH_CARD_OPEN');
    dashCardClosed ? await upsert('DASH_CARD_CLOSED') : await drop('DASH_CARD_CLOSED');
    dashCardUrgent ? await upsert('DASH_CARD_URGENT') : await drop('DASH_CARD_URGENT');
    dashCardCloseRate ? await upsert('DASH_CARD_CLOSE_RATE') : await drop('DASH_CARD_CLOSE_RATE');
    dashCardHospCount ? await upsert('DASH_CARD_HOSPITAL_COUNT') : await drop('DASH_CARD_HOSPITAL_COUNT');
    
    dashChartMystery    ? await upsert('DASH_CHART_MYSTERY_BY_DEPT') : await drop('DASH_CHART_MYSTERY_BY_DEPT');
    dashChartClasses    ? await upsert('DASH_CHART_CLASSIFICATIONS') : await drop('DASH_CHART_CLASSIFICATIONS');
    dashChartTopClinics ? await upsert('DASH_CHART_TOP_CLINICS')     : await drop('DASH_CHART_TOP_CLINICS');
    dashChartDailyTrend ? await upsert('DASH_CHART_DAILY_TREND')     : await drop('DASH_CHART_DAILY_TREND');
    
    dashUrgentList ? await upsert('DASH_URGENT_LIST') : await drop('DASH_URGENT_LIST');

    // Reports permissions
    reportsPage              ? await upsert('REPORTS_PAGE')                      : await drop('REPORTS_PAGE');
    reportsCardTotals        ? await upsert('REPORTS_CARD_TOTALS')               : await drop('REPORTS_CARD_TOTALS');
    reportsCardOpen          ? await upsert('REPORTS_CARD_OPEN')                 : await drop('REPORTS_CARD_OPEN');
    reportsCardClosed        ? await upsert('REPORTS_CARD_CLOSED')               : await drop('REPORTS_CARD_CLOSED');
    reportsCardUrgent        ? await upsert('REPORTS_CARD_URGENT')               : await drop('REPORTS_CARD_URGENT');
    reportsCardSLA           ? await upsert('REPORTS_CARD_SLA')                  : await drop('REPORTS_CARD_SLA');
    reportsCardHospitals     ? await upsert('REPORTS_CARD_HOSPITALS')            : await drop('REPORTS_CARD_HOSPITALS');
    reportsChartByHospitalType     ? await upsert('REPORTS_CHART_BY_HOSPITAL_TYPE')      : await drop('REPORTS_CHART_BY_HOSPITAL_TYPE');
    reportsChartStatusDistribution ? await upsert('REPORTS_CHART_STATUS_DISTRIBUTION')   : await drop('REPORTS_CHART_STATUS_DISTRIBUTION');
    reportsChartTrend6m            ? await upsert('REPORTS_CHART_TREND_6M')             : await drop('REPORTS_CHART_TREND_6M');
    reportsChartUrgentPercent      ? await upsert('REPORTS_CHART_URGENT_PERCENT')       : await drop('REPORTS_CHART_URGENT_PERCENT');
        reportsChartByDepartment       ? await upsert('REPORTS_CHART_BY_DEPARTMENT')        : await drop('REPORTS_CHART_BY_DEPARTMENT');
        reportsChartTopEmployees       ? await upsert('REPORTS_CHART_TOP_EMPLOYEES')         : await drop('REPORTS_CHART_TOP_EMPLOYEES');
    
    // صلاحيات بلاغات إدارة التجمع
    clusterSubmit  ? await upsert('CLUSTER_REPORT_CREATE')   : await drop('CLUSTER_REPORT_CREATE');
    clusterView    ? await upsert('CLUSTER_REPORT_VIEW')     : await drop('CLUSTER_REPORT_VIEW');
    clusterDetails ? await upsert('CLUSTER_REPORT_DETAILS')  : await drop('CLUSTER_REPORT_DETAILS');
    clusterReply   ? await upsert('CLUSTER_REPORT_REPLY')    : await drop('CLUSTER_REPORT_REPLY');
    clusterStatus  ? await upsert('CLUSTER_REPORT_STATUS')   : await drop('CLUSTER_REPORT_STATUS');
    
    // صلاحيات الأرشيف
    console.log('💾 Saving archive permissions:', {
      archiveView: archiveView ? 'ARCHIVE_VIEW' : 'DROP',
      archiveUpload: archiveUpload ? 'ARCHIVE_UPLOAD' : 'DROP'
    });
    archiveView   ? await upsert('ARCHIVE_VIEW')   : await drop('ARCHIVE_VIEW');
    archiveUpload ? await upsert('ARCHIVE_UPLOAD') : await drop('ARCHIVE_UPLOAD');
    console.log('✅ Archive permissions saved successfully');

    // نطاق السجل
    if (historyScope) {
      await upsert('COMPLAINT_HISTORY_SCOPE', historyScope);  // HOSPITAL | DEPARTMENT | ASSIGNED
    } else {
      await drop('COMPLAINT_HISTORY_SCOPE');
    }

    await conn.commit();
    conn.release();
    res.json({ ok:true });
  } catch (e) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    console.error('❌ Error saving permissions:', e);
    res.status(400).json({ ok:false, error: e.message });
  }
}

// دالة للموظفين العاديين لرؤية صلاحياتهم الخاصة فقط
export async function getMyPermissions(req, res) {
  try {
    const userId = req.user.UserID;
    const roleId = req.user.RoleID;
    
    // مدير التجمع - يمكنه رؤية صلاحياته من أي مستشفى
    if (roleId === 1) {
      const hospitalId = req.query.hospitalId || req.user.HospitalID;
      
      // إذا لم يتم توفير hospitalId، نعيد صلاحيات كاملة لمدير التجمع
      if (!hospitalId) {
        res.json({
          ok: true,
          data: {
            submit: true,
            view: true,
            historyScope: 'HOSPITAL',
            reply: true,
            transfer: true,
            transferDept: true,
            transferUser: true,
            statusUpdate: true,
            remove: true,
            adminPanel: true,
            adminDepartments: true,
            adminHospital: true,
            adminClusters: true,
            hospitalCreate: true,
            hospitalTrash: true,
            hospitalLogs: true,
            hospitalPermissions: true,
            hospitalUsers: true,
            hospitalUserCreate: true,
            hospitalUserEdit: true,
            hospitalUserDelete: true,
            improvementCreate: true,
            improvementView: true,
            improvementEdit: true,
            improvementDelete: true,
            improvementReportView: true,
            improvementsModule: true,
            // صلاحيات الزائر السري
            mysteryModule: true,
            mysteryView: true,
            mysteryReplyAdd: true,
            mysteryStatusUpdate: true,
            mysteryTransferDept: true,
            mysteryTransferEmp: true,
            mysteryDelete: true,
            importsPage: true,
            importDepartments: true,
            importMystery: true,
            import937: true,
            dashPage: true,
            dashCardTotals: true,
            dashCardOpen: true,
            dashCardClosed: true,
            dashCardUrgent: true,
            dashCardCloseRate: true,
            dashCardHospCount: true,
            dashChartMystery: true,
            dashChartClasses: true,
            dashChartTopClinics: true,
            dashChartDailyTrend: true,
            dashUrgentList: true,
            // ===== Reports permissions =====
            reportsPage: true,
            reportsCardTotals: true,
            reportsCardOpen: true,
            reportsCardClosed: true,
            reportsCardUrgent: true,
            reportsCardSLA: true,
            reportsCardHospitals: true,
            reportsChartByHospitalType: true,
            reportsChartStatusDistribution: true,
            reportsChartTrend6m: true,
            reportsChartUrgentPercent: true,
            reportsChartByDepartment: true,
            reportsChartTopEmployees: true,
            // ===== صلاحيات بلاغات إدارة التجمع =====
            clusterSubmit:  true,
            clusterView:    true,
            clusterDetails: true,
            clusterReply:   true,
            clusterStatus:  true,
            // ===== صلاحيات الأرشيف =====
            archiveView:   true,
            archiveUpload: true
          }
        });
        return;
      }
      
      const tenant = await getTenantPoolByHospitalId(hospitalId);
      const [perms] = await tenant.query(`
        SELECT PermissionKey, ViewScope
        FROM user_permissions
        WHERE UserID=? AND HospitalID=?
      `, [userId, hospitalId]);
      
      const has = k => perms.some(p => p.PermissionKey === k);
      const scope = perms.find(p => p.PermissionKey==='COMPLAINT_HISTORY_SCOPE')?.ViewScope || null;

      res.json({
        ok:true,
        data: {
          submit: has('COMPLAINT_SUBMIT'),
          view:   has('COMPLAINT_VIEW'),
          historyScope: scope,
          reply:  has('COMPLAINT_REPLY'),
          transfer: has('COMPLAINT_TRANSFER'),
          transferDept: has('COMPLAINT_TRANSFER_DEPT'),
          transferUser: has('COMPLAINT_TRANSFER_USER'),
          statusUpdate: has('COMPLAINT_STATUS_UPDATE'),
          remove: has('COMPLAINT_DELETE'),
          // مدير التجمع (مركزي) دائماً له صلاحية الإدارة
          adminPanel: has('ADMIN_PANEL_ACCESS') || (req.user?.HospitalID == null),
          adminDepartments: has('ADMIN_DEPARTMENTS'),
          adminHospital: has('ADMIN_HOSPITAL'),
          adminClusters: has('ADMIN_CLUSTERS'),
          hospitalCreate: has('HOSPITAL_CREATE'),
          // صلاحيات إدارة المستشفى (الأيقونات الأربعة)
          hospitalTrash: has('HOSPITAL_TRASH'),
          hospitalLogs: has('HOSPITAL_LOGS'),
          hospitalPermissions: has('HOSPITAL_PERMISSIONS'),
          hospitalUsers: has('HOSPITAL_USERS'),
          hospitalUserCreate: has('HOSPITAL_USER_CREATE'),
          hospitalUserEdit: has('HOSPITAL_USER_EDIT'),
          hospitalUserDelete: has('HOSPITAL_USER_DELETE'),
          improvementCreate: has('IMPROVEMENT_CREATE'),
          improvementView: has('IMPROVEMENT_VIEW'),
          improvementEdit: has('IMPROVEMENT_EDIT'),
          improvementDelete: has('IMPROVEMENT_DELETE'),
          improvementReportView: has('IMPROVEMENT_REPORT_VIEW'),
          improvementsModule: has('IMPROVEMENTS_MODULE'),
          // صلاحيات الزائر السري
          mysteryModule: has('MYSTERY_MODULE'),
          mysteryView: has('MYSTERY_VIEW'),
          mysteryReplyAdd: has('MYSTERY_REPLY_ADD'),
          mysteryStatusUpdate: has('MYSTERY_STATUS_UPDATE'),
          mysteryTransferDept: has('MYSTERY_TRANSFER_DEPT'),
          mysteryTransferEmp: has('MYSTERY_TRANSFER_EMP'),
          mysteryDelete: has('MYSTERY_DELETE'),
          // ===== Dashboard permissions =====
          dashPage:             has('DASH_PAGE'),
          dashCardTotals:       has('DASH_CARD_TOTALS'),
          dashCardOpen:         has('DASH_CARD_OPEN'),
          dashCardClosed:       has('DASH_CARD_CLOSED'),
          dashCardUrgent:       has('DASH_CARD_URGENT'),
          dashCardCloseRate:    has('DASH_CARD_CLOSE_RATE'),
          dashCardHospCount:    has('DASH_CARD_HOSPITAL_COUNT'),
          dashChartMystery:     has('DASH_CHART_MYSTERY_BY_DEPT'),
          dashChartClasses:     has('DASH_CHART_CLASSIFICATIONS'),
          dashChartTopClinics:  has('DASH_CHART_TOP_CLINICS'),
          dashChartDailyTrend:  has('DASH_CHART_DAILY_TREND'),
          dashUrgentList:       has('DASH_URGENT_LIST'),
          // ===== Reports permissions =====
          reportsPage:              has('REPORTS_PAGE'),
          reportsCardTotals:        has('REPORTS_CARD_TOTALS'),
          reportsCardOpen:          has('REPORTS_CARD_OPEN'),
          reportsCardClosed:        has('REPORTS_CARD_CLOSED'),
          reportsCardUrgent:        has('REPORTS_CARD_URGENT'),
          reportsCardSLA:           has('REPORTS_CARD_SLA'),
          reportsCardHospitals:     has('REPORTS_CARD_HOSPITALS'),
          reportsChartByHospitalType:    has('REPORTS_CHART_BY_HOSPITAL_TYPE'),
          reportsChartStatusDistribution: has('REPORTS_CHART_STATUS_DISTRIBUTION'),
          reportsChartTrend6m:           has('REPORTS_CHART_TREND_6M'),
          reportsChartUrgentPercent:     has('REPORTS_CHART_URGENT_PERCENT'),
          reportsChartByDepartment:      has('REPORTS_CHART_BY_DEPARTMENT'),
          reportsChartTopEmployees:      has('REPORTS_CHART_TOP_EMPLOYEES'),
          // ===== صلاحيات بلاغات إدارة التجمع =====
          clusterSubmit:  has('CLUSTER_REPORT_CREATE'),
          clusterView:    has('CLUSTER_REPORT_VIEW'),
          clusterDetails: has('CLUSTER_REPORT_DETAILS'),
          clusterReply:   has('CLUSTER_REPORT_REPLY'),
          clusterStatus:  has('CLUSTER_REPORT_STATUS'),
          // ===== صلاحيات الأرشيف =====
          archiveView:   has('ARCHIVE_VIEW'),
          archiveUpload: has('ARCHIVE_UPLOAD')
        }
      });
    } else {
      // مدير مستشفى أو موظف عادي - صلاحياته من مستشفاه فقط
      const hospitalId = req.user.HospitalID;
      
      if (!userId || !hospitalId) {
        throw new Error('معلومات المستخدم غير مكتملة');
      }

      const tenant = await getTenantPoolByHospitalId(hospitalId);

      const [perms] = await tenant.query(`
        SELECT PermissionKey, ViewScope
        FROM user_permissions
        WHERE UserID=? AND HospitalID=?
      `, [userId, hospitalId]);

      // خرّجيها كبوليانات + scope
      const has = k => perms.some(p => p.PermissionKey === k);
      const scope = perms.find(p => p.PermissionKey==='COMPLAINT_HISTORY_SCOPE')?.ViewScope || null;

      res.json({
        ok:true,
        data: {
          submit: has('COMPLAINT_SUBMIT'),
          view:   has('COMPLAINT_VIEW'),
          historyScope: scope,             // HOSPITAL|DEPARTMENT|ASSIGNED|null
          reply:  has('COMPLAINT_REPLY'),
          transfer: has('COMPLAINT_TRANSFER'),
          transferDept: has('COMPLAINT_TRANSFER_DEPT'),
          transferUser: has('COMPLAINT_TRANSFER_USER'),
          statusUpdate: has('COMPLAINT_STATUS_UPDATE'),
          remove: has('COMPLAINT_DELETE'),
          // مدير التجمع (مركزي) دائماً له صلاحية الإدارة
          adminPanel: has('ADMIN_PANEL_ACCESS') || (req.user?.HospitalID == null),
          adminDepartments: has('ADMIN_DEPARTMENTS'),
          adminHospital: has('ADMIN_HOSPITAL'),
          adminClusters: has('ADMIN_CLUSTERS'),
          hospitalCreate: has('HOSPITAL_CREATE'),
          // صلاحيات إدارة المستشفى (الأيقونات الأربعة)
          hospitalTrash: has('HOSPITAL_TRASH'),
          hospitalLogs: has('HOSPITAL_LOGS'),
          hospitalPermissions: has('HOSPITAL_PERMISSIONS'),
          hospitalUsers: has('HOSPITAL_USERS'),
          hospitalUserCreate: has('HOSPITAL_USER_CREATE'),
          hospitalUserEdit: has('HOSPITAL_USER_EDIT'),
          hospitalUserDelete: has('HOSPITAL_USER_DELETE'),
          improvementCreate: has('IMPROVEMENT_CREATE'),
          improvementView: has('IMPROVEMENT_VIEW'),
          improvementEdit: has('IMPROVEMENT_EDIT'),
          improvementDelete: has('IMPROVEMENT_DELETE'),
          improvementReportView: has('IMPROVEMENT_REPORT_VIEW'),
          improvementsModule: has('IMPROVEMENTS_MODULE'),
          // صلاحيات الزائر السري
          mysteryModule: has('MYSTERY_MODULE'),
          mysteryView: has('MYSTERY_VIEW'),
          mysteryReplyAdd: has('MYSTERY_REPLY_ADD'),
          mysteryStatusUpdate: has('MYSTERY_STATUS_UPDATE'),
          mysteryTransferDept: has('MYSTERY_TRANSFER_DEPT'),
          mysteryTransferEmp: has('MYSTERY_TRANSFER_EMP'),
          mysteryDelete: has('MYSTERY_DELETE'),
          // ===== Dashboard permissions =====
          dashPage:             has('DASH_PAGE'),
          dashCardTotals:       has('DASH_CARD_TOTALS'),
          dashCardOpen:         has('DASH_CARD_OPEN'),
          dashCardClosed:       has('DASH_CARD_CLOSED'),
          dashCardUrgent:       has('DASH_CARD_URGENT'),
          dashCardCloseRate:    has('DASH_CARD_CLOSE_RATE'),
          dashCardHospCount:    has('DASH_CARD_HOSPITAL_COUNT'),
          dashChartMystery:     has('DASH_CHART_MYSTERY_BY_DEPT'),
          dashChartClasses:     has('DASH_CHART_CLASSIFICATIONS'),
          dashChartTopClinics:  has('DASH_CHART_TOP_CLINICS'),
          dashChartDailyTrend:  has('DASH_CHART_DAILY_TREND'),
          dashUrgentList:       has('DASH_URGENT_LIST'),
          // ===== Reports permissions =====
          reportsPage:              has('REPORTS_PAGE'),
          reportsCardTotals:        has('REPORTS_CARD_TOTALS'),
          reportsCardOpen:          has('REPORTS_CARD_OPEN'),
          reportsCardClosed:        has('REPORTS_CARD_CLOSED'),
          reportsCardUrgent:        has('REPORTS_CARD_URGENT'),
          reportsCardSLA:           has('REPORTS_CARD_SLA'),
          reportsCardHospitals:     has('REPORTS_CARD_HOSPITALS'),
          reportsChartByHospitalType:    has('REPORTS_CHART_BY_HOSPITAL_TYPE'),
          reportsChartStatusDistribution: has('REPORTS_CHART_STATUS_DISTRIBUTION'),
          reportsChartTrend6m:           has('REPORTS_CHART_TREND_6M'),
          reportsChartUrgentPercent:     has('REPORTS_CHART_URGENT_PERCENT'),
          reportsChartByDepartment:      has('REPORTS_CHART_BY_DEPARTMENT'),
          reportsChartTopEmployees:      has('REPORTS_CHART_TOP_EMPLOYEES'),
          // ===== صلاحيات بلاغات إدارة التجمع =====
          clusterSubmit:  has('CLUSTER_REPORT_CREATE'),
          clusterView:    has('CLUSTER_REPORT_VIEW'),
          clusterDetails: has('CLUSTER_REPORT_DETAILS'),
          clusterReply:   has('CLUSTER_REPORT_REPLY'),
          clusterStatus:  has('CLUSTER_REPORT_STATUS')
        }
      });
    }
  } catch (e) {
    res.status(400).json({ ok:false, error: e.message });
  }
}
