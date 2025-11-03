// controllers/trashController.js
import { pool } from '../config/db.js';
import { getCentralPool } from '../middleware/hospitalPool.js';
import { isClusterManager, canAccessHospital } from './_authz.js';

/**
 * دالة مساعدة لتحويل JSON بشكل آمن
 * تتعامل مع حالة أن MySQL قد يُرجع JSON كـ object أو string
 */
function safeJSON(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;        // رجع ككائن بالفعل
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return null;
}

/**
 * جلب البلاغات المحذوفة فقط حسب المستشفى
 * GET /api/trash/complaints?hospitalId=X
 */
export async function listDeletedComplaints(req, res) {
  try {
    const { hospitalId } = req.query;
    
    if (!hospitalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'معرّف المستشفى مطلوب' 
      });
    }

    const [rows] = await pool.query(
      `SELECT 
        t.TrashID,
        t.EntityID AS ComplaintID,
        t.EntityTitle,
        t.EntitySnapshot,
        t.DeleteReason,
        t.DeletedAt,
        t.DeletedByUserID,
        u.FullName AS DeletedByUserName
       FROM trash_bin t
       LEFT JOIN users u ON t.DeletedByUserID = u.UserID
       WHERE t.HospitalID = ? 
         AND t.EntityType = 'COMPLAINT'
         AND t.PurgedAt IS NULL 
         AND t.RestoredAt IS NULL
       ORDER BY t.DeletedAt DESC`,
      [hospitalId]
    );

    // تحويل EntitySnapshot من JSON بشكل آمن
    const items = rows.map(row => ({
      ...row,
      EntitySnapshot: safeJSON(row.EntitySnapshot)
    }));

    res.json(items);

  } catch (error) {
    console.error('خطأ في جلب البلاغات المحذوفة:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء جلب البلاغات المحذوفة',
      error: error.message 
    });
  }
}

/**
 * جلب قائمة المحذوفات حسب المستشفى
 * GET /api/trash?hospitalId=X
 */
export async function listTrash(req, res) {
  try {
    const central = await getCentralPool();
    const isMgr = isClusterManager(req.user);

    // مدير التجمّع: نقرأ hospitalId من الكويري (اختياري)
    // موظف: نفرض مستشفاه فقط ونتجاهل أي hospitalId في الكويري
    let hospitalId = null;
    if (isMgr) {
      hospitalId = Number(req.query?.hospitalId || 0) || null;
    } else {
      hospitalId = Number(req.user?.HospitalID || 0) || null;
    }

    const entityType = (req.query?.entityType || '').trim().toUpperCase() || null;

    // نبني الشرط
    const where = ['t.PurgedAt IS NULL', 't.RestoredAt IS NULL'];
    const params = [];

    if (hospitalId) {
      where.push('t.HospitalID = ?');
      params.push(hospitalId);
    } else if (!isMgr) {
      // موظف بدون HospitalID في التوكن؟ أمنعي الطلب
      return res.status(403).json({ ok: false, message: 'غير مصرّح' });
    }

    if (entityType) {
      where.push('t.EntityType = ?');
      params.push(entityType);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [rows] = await central.query(
      `SELECT 
        t.TrashID,
        t.HospitalID,
        t.SourceDB,
        t.EntityType,
        t.EntityTable,
        t.EntityID,
        t.EntityTitle,
        t.EntitySnapshot,
        t.DeleteReason,
        t.DeletedAt,
        t.DeletedByUserID,
        t.RestoredAt,
        t.PurgedAt,
        t.Notes
       FROM trash_bin t
       ${whereSql}
       ORDER BY t.DeletedAt DESC
       LIMIT 200`,
      params
    );

    // تحويل EntitySnapshot من JSON بشكل آمن
    const items = rows.map(row => ({
      ...row,
      EntitySnapshot: safeJSON(row.EntitySnapshot)
    }));

    res.json({
      ok: true,
      success: true,
      items: items,
      data: items,
      count: items.length,
      hospitalId,
      canChooseHospital: isMgr
    });

  } catch (error) {
    console.error('خطأ في جلب المحذوفات:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء جلب المحذوفات',
      error: error.message 
    });
  }
}

/**
 * استرجاع عنصر من السلة
 * POST /api/trash/:id/restore
 */
export async function restoreItem(req, res) {
  try {
    const trashId = Number(req.params.id || 0);
    if (!trashId) return res.status(400).json({ ok: false, message: 'Invalid TrashID' });

    const central = await getCentralPool();

    // جلب معلومات العنصر من السلة
    const [[row]] = await central.query(
      `SELECT TrashID, HospitalID, EntityType, EntityTable, EntityID, EntitySnapshot, 
              RestoredAt, PurgedAt
         FROM trash_bin WHERE TrashID = ? LIMIT 1`,
      [trashId]
    );
    if (!row) return res.status(404).json({ ok: false, message: 'العنصر غير موجود' });

    // ✅ تحقّق صلاحية الوصول
    if (!canAccessHospital(req.user, row.HospitalID)) {
      return res.status(403).json({ ok: false, message: 'غير مصرّح' });
    }

    const item = row;

    // التحقق من أن العنصر لم يتم استرجاعه أو حذفه نهائياً
    if (item.RestoredAt) {
      return res.status(400).json({ 
        ok: false,
        success: false, 
        message: 'تم استرجاع هذا العنصر مسبقاً' 
      });
    }

    if (item.PurgedAt) {
      return res.status(400).json({ 
        ok: false,
        success: false, 
        message: 'تم حذف هذا العنصر نهائياً' 
      });
    }

    // تحديد اسم العمود الأساسي حسب نوع الجدول
    const primaryKeyMap = {
      'complaints': 'ComplaintID',
      'departments': 'DepartmentID',
      'users': 'UserID',
      'hospitals': 'HospitalID',
      'attachments': 'AttachmentID'
    };

    const table = item.EntityTable;
    const primaryKey = primaryKeyMap[table] || 'id';

    // استرجاع العنصر حسب نوعه
    if (table === 'hospitals') {
      // للمستشفيات نستخدم IsActive في قاعدة central
      await central.query(
        `UPDATE hospitals SET IsActive = 1 WHERE HospitalID = ?`,
        [item.EntityID]
      );
    } else {
      // للعناصر الأخرى نعكس الحذف المنطقي
      // ✅ البلاغات موجودة في قاعدة المستشفى، ليس القاعدة المركزية
      if (table === 'complaints') {
        // جلب اتصال قاعدة المستشفى
        const { getHospitalPool } = await import('../config/db.js');
        const hospitalPool = await getHospitalPool(item.HospitalID);
        
        // استرجاع البلاغ في قاعدة المستشفى
        await hospitalPool.query(
          `UPDATE complaints 
           SET IsDeleted = 0, 
               DeletedAt = NULL, 
               DeletedByUserID = NULL, 
               DeleteReason = NULL 
           WHERE ComplaintID = ?`,
          [item.EntityID]
        );
        
        console.log(`✅ [RESTORE] تم استرجاع البلاغ ${item.EntityID} من قاعدة المستشفى ${item.HospitalID}`);
      } else {
        // للعناصر الأخرى في القاعدة المركزية
        await central.query(
          `UPDATE ${table} 
           SET IsDeleted = 0, 
               DeletedAt = NULL, 
               DeletedByUserID = NULL, 
               DeleteReason = NULL 
           WHERE ${primaryKey} = ?`,
          [item.EntityID]
        );
      }
    }

    // تحديث سجل السلة
    await central.query(
      `UPDATE trash_bin 
       SET RestoredAt = NOW(),
           RestoredByUserID = ?
       WHERE TrashID = ?`,
      [req.user?.UserID || null, trashId]
    );

    res.json({
      ok: true,
      success: true,
      message: 'تم استرجاع العنصر بنجاح',
      data: {
        trashId: trashId,
        entityType: item.EntityType,
        entityTitle: item.EntityTitle
      }
    });

  } catch (error) {
    console.error('خطأ في استرجاع العنصر:', error);
    res.status(500).json({ 
      ok: false,
      success: false, 
      message: 'حدث خطأ أثناء استرجاع العنصر',
      error: error.message 
    });
  }
}

/**
 * حذف نهائي لعنصر (تفريغ من السلة)
 * DELETE /api/trash/:id
 */
export async function purgeItem(req, res) {
  try {
    const trashId = Number(req.params.id || 0);
    if (!trashId) return res.status(400).json({ ok: false, message: 'Invalid TrashID' });

    const central = await getCentralPool();
    
    // جلب معلومات العنصر من السلة
    const [[row]] = await central.query(
      `SELECT TrashID, HospitalID, EntityType, EntityTable, EntityID, EntityTitle, 
              RestoredAt, PurgedAt
       FROM trash_bin WHERE TrashID=? LIMIT 1`,
      [trashId]
    );
    if (!row) return res.status(404).json({ ok: false, message: 'العنصر غير موجود' });

    // ✅ تحقّق صلاحية الوصول
    if (!canAccessHospital(req.user, row.HospitalID)) {
      return res.status(403).json({ ok: false, message: 'غير مصرّح' });
    }

    const item = row;

    // التحقق من أن العنصر لم يتم استرجاعه أو حذفه نهائياً
    if (item.RestoredAt) {
      return res.status(400).json({ 
        ok: false,
        success: false, 
        message: 'لا يمكن حذف عنصر تم استرجاعه مسبقاً' 
      });
    }

    if (item.PurgedAt) {
      return res.status(400).json({ 
        ok: false,
        success: false, 
        message: 'تم حذف هذا العنصر نهائياً مسبقاً' 
      });
    }

    // تحديد اسم العمود الأساسي حسب نوع الجدول
    const primaryKeyMap = {
      'complaints': 'ComplaintID',
      'departments': 'DepartmentID',
      'users': 'UserID',
      'hospitals': 'HospitalID',
      'attachments': 'AttachmentID'
    };

    const table = item.EntityTable;
    const primaryKey = primaryKeyMap[table] || 'id';

    // حذف نهائي للعنصر حسب نوعه
    if (table === 'hospitals') {
      // للمستشفيات - لا نحذفها نهائياً، فقط نحدث trash_bin
      console.log(`⚠️ [PURGE] المستشفيات لا تُحذف نهائياً، فقط تحديث trash_bin`);
    } else if (table === 'complaints') {
      // ✅ البلاغات موجودة في قاعدة المستشفى
      const { getHospitalPool } = await import('../config/db.js');
      const hospitalPool = await getHospitalPool(item.HospitalID);
      
      // حذف البلاغ نهائياً من قاعدة المستشفى
      await hospitalPool.query(
        `DELETE FROM complaints WHERE ComplaintID = ?`,
        [item.EntityID]
      );
      
      // حذف المرفقات والردود التابعة (اختياري)
      try {
        await hospitalPool.query(
          `DELETE FROM complaint_responses WHERE ComplaintID = ?`,
          [item.EntityID]
        );
        console.log(`🗑️ [PURGE] تم حذف ردود البلاغ ${item.EntityID}`);
      } catch (e) {
        console.log(`⚠️ [PURGE] لم يتم حذف ردود البلاغ: ${e.message}`);
      }
      
      try {
        await hospitalPool.query(
          `DELETE FROM attachments WHERE ComplaintID = ?`,
          [item.EntityID]
        );
        console.log(`🗑️ [PURGE] تم حذف مرفقات البلاغ ${item.EntityID}`);
      } catch (e) {
        console.log(`⚠️ [PURGE] لم يتم حذف مرفقات البلاغ: ${e.message}`);
      }
      
      console.log(`✅ [PURGE] تم حذف البلاغ ${item.EntityID} نهائياً من قاعدة المستشفى ${item.HospitalID}`);
    } else {
      // للعناصر الأخرى في القاعدة المركزية
      await central.query(
        `DELETE FROM ${table} WHERE ${primaryKey} = ?`,
        [item.EntityID]
      );
      console.log(`✅ [PURGE] تم حذف ${table} ${item.EntityID} نهائياً من القاعدة المركزية`);
    }

    // تحديث سجل السلة لتسجيل وقت الحذف النهائي
    await central.query(
      `UPDATE trash_bin 
       SET PurgedAt = NOW(),
           PurgedByUserID = ?,
           Notes = CONCAT(COALESCE(Notes, ''), ' | تم الحذف النهائي من النظام')
       WHERE TrashID = ?`,
      [req.user?.UserID || null, trashId]
    );
    
    res.json({ 
      ok: true, 
      success: true, 
      message: 'تم الحذف النهائي بنجاح',
      data: {
        trashId: trashId,
        entityType: item.EntityType,
        entityTitle: item.EntityTitle
      }
    });

  } catch (error) {
    console.error('خطأ في الحذف النهائي:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء الحذف النهائي',
      error: error.message 
    });
  }
}

/**
 * تفريغ سلة مستشفى بالكامل
 * POST /api/trash/empty
 */
export async function emptyTrash(req, res) {
  try {
    const hospitalId = Number(req.body?.hospitalId || 0);
    if (!hospitalId) return res.status(400).json({ ok: false, message: 'hospitalId مطلوب' });

    // ✅ تحقّق صلاحية الوصول
    if (!canAccessHospital(req.user, hospitalId)) {
      return res.status(403).json({ ok: false, message: 'غير مصرّح' });
    }

    const central = await getCentralPool();
    
    // جلب جميع العناصر في السلة قبل الحذف
    const [items] = await central.query(
      `SELECT TrashID, EntityType, EntityTable, EntityID 
       FROM trash_bin 
       WHERE HospitalID = ? AND PurgedAt IS NULL AND RestoredAt IS NULL`,
      [hospitalId]
    );
    
    let deletedCount = 0;
    let purgedCount = 0;
    
    // حذف كل عنصر نهائياً
    for (const item of items) {
      try {
        if (item.EntityTable === 'complaints') {
          // حذف البلاغ من قاعدة المستشفى
          const { getHospitalPool } = await import('../config/db.js');
          const hospitalPool = await getHospitalPool(hospitalId);
          
          // حذف البلاغ نهائياً
          await hospitalPool.query(
            `DELETE FROM complaints WHERE ComplaintID = ?`,
            [item.EntityID]
          );
          
          // حذف المرفقات والردود التابعة
          try {
            await hospitalPool.query(
              `DELETE FROM complaint_responses WHERE ComplaintID = ?`,
              [item.EntityID]
            );
          } catch (e) {
            console.log(`⚠️ [EMPTY] لم يتم حذف ردود البلاغ ${item.EntityID}: ${e.message}`);
          }
          
          try {
            await hospitalPool.query(
              `DELETE FROM attachments WHERE ComplaintID = ?`,
              [item.EntityID]
            );
          } catch (e) {
            console.log(`⚠️ [EMPTY] لم يتم حذف مرفقات البلاغ ${item.EntityID}: ${e.message}`);
          }
          
          purgedCount++;
        } else {
          // للعناصر الأخرى في القاعدة المركزية
          await central.query(
            `DELETE FROM ${item.EntityTable} WHERE ${item.EntityTable === 'hospitals' ? 'HospitalID' : 'id'} = ?`,
            [item.EntityID]
          );
          purgedCount++;
        }
        
        // تحديث سجل السلة
        await central.query(
          `UPDATE trash_bin 
           SET PurgedAt = NOW(),
               PurgedByUserID = ?,
               Notes = CONCAT(COALESCE(Notes, ''), ' | تم الحذف النهائي من النظام (تفريغ السلة)')
           WHERE TrashID = ?`,
          [req.user?.UserID || null, item.TrashID]
        );
        
        deletedCount++;
        
      } catch (error) {
        console.error(`خطأ في حذف العنصر ${item.EntityID}:`, error);
        // نستمر مع العناصر الأخرى
      }
    }
    
    res.json({ 
      ok: true, 
      success: true, 
      message: `تم تفريغ السلة بنجاح - تم حذف ${deletedCount} عنصر نهائياً`,
      deletedCount: deletedCount,
      purgedCount: purgedCount
    });

  } catch (error) {
    console.error('خطأ في تفريغ السلة:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء تفريغ السلة',
      error: error.message 
    });
  }
}

/**
 * إضافة عنصر إلى السلة (دالة مساعدة - تُستخدم من controllers أخرى)
 * @param {Object} params - معلومات العنصر المحذوف
 */
export async function addToTrash(params) {
  const {
    hospitalId,
    entityType,
    entityTable,
    entityId,
    entityTitle,
    entitySnapshot = {},
    deleteReason = null,
    deletedByUserId = null,
    notes = null
  } = params;

  // ✅ فحص أساسي
  if (!hospitalId) {
    throw new Error('addToTrash: hospitalId مطلوب');
  }

  try {
    const central = await getCentralPool();
    
    // جيب DbName لقاعدة المستشفى لاستخدامه كـ SourceDB
    console.log('🔍 [addToTrash] جلب DbName للمستشفى:', hospitalId);
    let sourceDb = null;
    try {
      const [[h]] = await central.query(
        `SELECT DbName FROM hospitals
         WHERE HospitalID = ? AND COALESCE(IsActive, Active, 1) = 1
         LIMIT 1`,
        [hospitalId]
      );
      sourceDb = h?.DbName || null;
      console.log('✅ [addToTrash] DbName من hospitals:', sourceDb);
    } catch (e) {
      console.error('❌ [addToTrash] فشل جلب DbName من hospitals:', e.message);
    }
    
    // إذا لم نجد DbName، استخدم fallback
    if (!sourceDb) {
      sourceDb = `hospital-${hospitalId}`;
      console.log('⚠️ [addToTrash] استخدام fallback:', sourceDb);
    }
    
    console.log('🎯 [addToTrash] SourceDB النهائي:', sourceDb);
    
    // stringify snapshot بشكل آمن
    let snapshotJson = null;
    try {
      snapshotJson = JSON.stringify(entitySnapshot || {});
    } catch (e) {
      console.warn('[addToTrash] فشل تحويل entitySnapshot إلى JSON:', e.message);
      snapshotJson = JSON.stringify({ error: 'snapshot_serialization_failed' });
    }
    
    const insertValues = [
      hospitalId,
      sourceDb,
      entityType,
      entityTable,
      entityId,
      entityTitle || `#${entityId}`,
      snapshotJson,
      deleteReason,
      deletedByUserId,
      notes
    ];
    
    console.log('[addToTrash] inserting:', {
      hospitalId,
      sourceDb,
      entityType,
      entityTable,
      entityId,
      entityTitle: entityTitle || `#${entityId}`,
      deleteReason,
      deletedByUserId
    });
    
    console.log('📝 [addToTrash] قيم الـ INSERT:', insertValues);
    
    await central.query(
      `INSERT INTO trash_bin 
       (HospitalID, SourceDB, EntityType, EntityTable, EntityID, EntityTitle, 
        EntitySnapshot, DeleteReason, DeletedByUserID, DeletedAt, Notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      insertValues
    );
    
    console.log('✅ [addToTrash] تم الإدراج بنجاح في trash_bin');

    return { success: true };
  } catch (error) {
    console.error('خطأ في إضافة عنصر للسلة:', error);
    throw error;
  }
}

/**
 * جلب إحصائيات السلة
 * GET /api/trash/stats?hospitalId=X
 */
export async function getTrashStats(req, res) {
  try {
    const { hospitalId } = req.query;

    const query = hospitalId 
      ? `CALL GetTrashStats(?)`
      : `CALL GetTrashStats(NULL)`;
    
    const [results] = await pool.query(query, hospitalId ? [hospitalId] : []);

    res.json({
      success: true,
      data: results[0] // الـ stored procedure ترجع النتائج في المؤشر الأول
    });

  } catch (error) {
    console.error('خطأ في جلب إحصائيات السلة:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء جلب الإحصائيات',
      error: error.message 
    });
  }
}

/**
 * جلب تفاصيل عنصر محذوف
 * GET /api/trash/:id
 */
export async function getTrashItem(req, res) {
  try {
    const { id } = req.params;

    const [items] = await pool.query(
      `SELECT 
        t.*,
        u1.FullName AS DeletedByUserName,
        u2.FullName AS RestoredByUserName,
        u3.FullName AS PurgedByUserName,
        h.NameAr AS HospitalName
       FROM trash_bin t
       LEFT JOIN users u1 ON t.DeletedByUserID = u1.UserID
       LEFT JOIN users u2 ON t.RestoredByUserID = u2.UserID
       LEFT JOIN users u3 ON t.PurgedByUserID = u3.UserID
       LEFT JOIN hospitals h ON t.HospitalID = h.HospitalID
       WHERE t.TrashID = ?`,
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'العنصر غير موجود' 
      });
    }

    const item = {
      ...items[0],
      EntitySnapshot: safeJSON(items[0].EntitySnapshot)
    };

    res.json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('خطأ في جلب تفاصيل العنصر:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء جلب التفاصيل',
      error: error.message 
    });
  }
}

