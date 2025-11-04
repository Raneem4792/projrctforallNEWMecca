// services/complaintTransferProcessor.js
import { getTenantPoolByHospitalId, getCentralPool } from '../db/tenantManager.js';

/**
 * معالجة جميع التحويلات المعلقة من جميع المستشفيات
 */
async function processTransfersOnce() {
  try {
    const central = await getCentralPool();

    // نجيب كل المستشفيات الفعالة
    const [hospitals] = await central.query(
      'SELECT HospitalID FROM hospitals WHERE IsActive=1'
    );

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const h of hospitals) {
      const sourceHid = h.HospitalID;
      
      try {
        const sourcePool = await getTenantPoolByHospitalId(sourceHid);

        const [pending] = await sourcePool.query(
          `SELECT * FROM complaint_transfer_outbox 
           WHERE Status='PENDING' 
           ORDER BY TransferID ASC 
           LIMIT 50`
        );

        if (!pending.length) continue;

        console.log(`📦 وجد ${pending.length} تحويل معلق في المستشفى ${sourceHid}`);

        for (const tr of pending) {
          totalProcessed++;
          
          try {
            const targetHid = tr.TargetHospitalID;
            const targetPool = await getTenantPoolByHospitalId(targetHid);

            const payload = JSON.parse(tr.Payload);

            // نتأكد إن ما فيه ComplaintID لأنه auto_increment في الهدف
            delete payload.ComplaintID;

            // إدخال البلاغ في المستشفى الهدف
            const [result] = await targetPool.query(
              'INSERT INTO complaints SET ?',
              [payload]
            );
            const newId = result.insertId;

            // تحديث سجل outbox + البلاغ الأصلي
            await sourcePool.query(
              `UPDATE complaint_transfer_outbox
               SET Status='SENT', SentAt=NOW(), ErrorMessage=NULL
               WHERE TransferID=?`,
              [tr.TransferID]
            );

            // حذف البلاغ من المستشفى المصدر
            await sourcePool.query(
              `DELETE FROM complaints 
               WHERE ComplaintID=?`,
              [tr.ComplaintID]
            );

            // محاولة حذف المرفقات والردود (إذا كانت الجداول موجودة)
            try {
              await sourcePool.query(`DELETE FROM complaint_attachments WHERE ComplaintID=?`, [tr.ComplaintID]);
            } catch (e) {
              if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
            }

            try {
              await sourcePool.query(`DELETE FROM complaint_replies WHERE ComplaintID=?`, [tr.ComplaintID]);
            } catch (e) {
              if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
            }

            totalSuccess++;
            console.log(`✅ Complaint ${tr.ComplaintID} moved from hospital ${sourceHid} to ${targetHid} as ${newId}`);
          } catch (err) {
            totalFailed++;
            console.error(`❌ Failed transfer ${tr.TransferID}:`, err.message);
            
            await sourcePool.query(
              `UPDATE complaint_transfer_outbox
               SET Status='FAILED', ErrorMessage=?
               WHERE TransferID=?`,
              [String(err.message).substring(0, 250), tr.TransferID]
            );
          }
        }
      } catch (error) {
        console.error(`❌ خطأ في معالجة المستشفى ${sourceHid}:`, error.message);
      }
    }

    if (totalProcessed > 0) {
      console.log(`✅ انتهت معالجة التحويلات: ${totalSuccess} نجح، ${totalFailed} فشل من إجمالي ${totalProcessed}`);
    }

  } catch (error) {
    console.error('❌ خطأ عام في معالجة التحويلات:', error);
  }
}

/**
 * دالة تشغيل دورية
 */
export function startComplaintTransferProcessor() {
  console.log('🚀 بدء خدمة معالجة تحويلات البلاغات بين المستشفيات...');
  
  // مرة عند التشغيل
  processTransfersOnce().catch(console.error);

  // كل دقيقة
  setInterval(() => {
    processTransfersOnce().catch(console.error);
  }, 60 * 1000);

  console.log('✅ خدمة معالجة التحويلات تعمل كل دقيقة');
}

