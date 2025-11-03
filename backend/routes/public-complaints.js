// backend/routes/public-complaints.js
import express from 'express';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

const router = express.Router();

/**
 * GET /api/public/complaints/timeline?ticket=B1544096
 * يرجّع خط الزمن العام (بدون الردود الداخلية IsInternal=1)
 */
router.get('/complaints/timeline', async (req, res) => {
  const ticket = (req.query.ticket || '').trim();
  if (!ticket) return res.status(400).json({ ok:false, error:'ticket مطلوب' });

  try {
    const central = await getCentralPool();

    // نجيب قائمة المستشفيات ونبحث عن البلاغ بالتذكرة
    const [hospitals] = await central.query(
      'SELECT HospitalID, NameAr FROM hospitals WHERE IsActive=1'
    );

    let found = null;
    let pool = null;

    for (const h of hospitals) {
      const p = await getTenantPoolByHospitalId(h.HospitalID);
      const [rows] = await p.query(
        'SELECT ComplaintID, GlobalID, HospitalID, DepartmentID, PriorityCode, StatusCode, CreatedAt, TicketNumber \
         FROM complaints WHERE TicketNumber = ? LIMIT 1',
        [ticket]
      );
      if (rows.length) {
        found = { ...rows[0], HospitalName: h.NameAr };
        pool = p;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ ok:false, error:'لم يتم العثور على البلاغ بهذا الرقم' });
    }

    // تجميع خط الزمن (أحداث الحالة + الردود العامة فقط)
    // مع Fallback للقواعد القديمة التي لا تحتوي على عمود Note
    let hist;
    try {
      [hist] = await pool.query(
        'SELECT ChangedAt AS EventAt, OldStatusCode, NewStatusCode, Note, ChangedByUserID \
         FROM complaint_status_history WHERE ComplaintID=? ORDER BY ChangedAt ASC',
        [found.ComplaintID]
      );
    } catch (err) {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        // نسخة قديمة بدون Note → رجّع NULL بدلًا منه
        [hist] = await pool.query(
          'SELECT ChangedAt AS EventAt, OldStatusCode, NewStatusCode, NULL AS Note, ChangedByUserID \
           FROM complaint_status_history WHERE ComplaintID=? ORDER BY ChangedAt ASC',
          [found.ComplaintID]
        );
      } else {
        throw err;
      }
    }

    const [replies] = await pool.query(
      'SELECT CreatedAt AS EventAt, Message, ReplyTypeID, TargetStatusCode, ResponderUserID \
       FROM complaint_responses WHERE ComplaintID=? AND IsInternal=0 ORDER BY CreatedAt ASC',
      [found.ComplaintID]
    );

    const timeline = [
      { type:'created',  at: found.CreatedAt, status: found.StatusCode, note: 'تم إنشاء البلاغ' },
      ...hist.map(h => ({ type:'status', at: h.EventAt, old: h.OldStatusCode, new: h.NewStatusCode, note: h.Note })),
      ...replies.map(r => ({ type:'reply',  at: r.EventAt, msg: r.Message, targetStatus: r.TargetStatusCode, replyTypeId: r.ReplyTypeID }))
    ].sort((a,b)=> new Date(a.at) - new Date(b.at));

    res.json({
      ok: true,
      ticket: found.TicketNumber,
      hospitalId: found.HospitalID,
      hospitalName: found.HospitalName,
      priority: found.PriorityCode,
      status: found.StatusCode,
      createdAt: found.CreatedAt,
      timeline
    });

  } catch (err) {
    console.error('Public timeline error:', err);
    res.status(500).json({ ok:false, error:'تعذّر تحميل سير البلاغ' });
  }
});

export default router;
