"""ClickUp (raw/clickup/) → data/projects.json
รวมงานจากทุก response ที่ ingest_clickup.py เก็บไว้ · dedupe ด้วย Task ID · ผูก parent-child ·
เพิ่มชั้นจำแนกประเภทจาก config/project_classification.csv (proposed/confirmed) · คำนวณวันด้วยเวลา Asia/Bangkok

หลักที่ยึด (ตามโจทย์):
- ไม่ถือว่าทุก Task/List/Folder คือโครงการ — ประเภทมาจากไฟล์จำแนกเท่านั้น งานที่ยังไม่มีในไฟล์ = needs_review
- ไม่ใช้ date_closed ตัดสินว่างานเสร็จ (มีงาน complete ที่ date_closed=null) ใช้ชื่อสถานะของ ClickUp
- cancelled / on hold แยกจาก complete และจาก in progress
- งานที่ไม่มีกำหนดส่ง ไม่ถูกนับว่าเกินกำหนด
- สัดส่วนงานย่อยที่เสร็จเป็น "สัดส่วนงานย่อย" ไม่ใช่ Physical Progress และไม่มีงานย่อย = null (N/A)
- ไม่คำนวณ Resource Utilization / ชั่วโมงแรงงาน — เก็บเพียงหลักฐานว่า time_estimate/time_spent/time entries มีหรือไม่

ใช้: python3 scripts/import_clickup.py
"""
import json, os, csv, datetime, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw', 'clickup')
DATA = os.path.join(ROOT, 'data')
BKK = datetime.timezone(datetime.timedelta(hours=7))
SPACE_ID = '901811856729'                       # SAM space เท่านั้น
TYPES = ('delivery_project', 'improvement_initiative', 'feasibility_opportunity',
         'commercial_contract', 'recurring_operation', 'needs_review')
# กลุ่มสถานะ: ใช้ชื่อสถานะจาก ClickUp ไม่ใช่ date_closed
DONE, CANCELLED, HOLD, NOTSTARTED = 'complete', 'cancelled', 'on hold', 'not started'


def ms_to_iso(v):
    if v in (None, '', 0, '0'):
        return None
    return datetime.datetime.fromtimestamp(int(v) / 1000, BKK).isoformat(timespec='seconds')


def day(v):
    return v[:10] if v else None


def group_of(status):
    s = (status or '').strip().lower()
    if s == DONE:
        return 'done'
    if s == CANCELLED:
        return 'cancelled'
    if s == HOLD:
        return 'hold'
    if s == NOTSTARTED:
        return 'notstarted'
    return 'active'


def flat(rec, src):
    """ClickUp task (จาก filter_tasks หรือ get_task หรือ subtasks[]) → แถวเดียวของเรา"""
    li = rec.get('list') or {}
    return {
        'id': rec['id'], 'name': rec.get('name') or '', 'url': rec.get('url') or '',
        'status': rec.get('status') if isinstance(rec.get('status'), str) else (rec.get('status') or {}).get('status'),
        'parent': rec.get('parent'), 'list_id': li.get('id'), 'list_name': (li.get('name') or '').strip() or None,
        'assignees': [a.get('username') for a in (rec.get('assignees') or []) if a.get('username')],
        'priority': rec['priority'].get('priority') if isinstance(rec.get('priority'), dict) else rec.get('priority'),
        'created': ms_to_iso(rec.get('date_created')), 'updated': ms_to_iso(rec.get('date_updated')),
        'closed': ms_to_iso(rec.get('date_closed')), 'due': ms_to_iso(rec.get('due_date')),
        'start': ms_to_iso(rec.get('start_date')),
        'desc': (rec.get('markdown_description') or rec.get('text_content') or rec.get('description') or '').strip(),
        'time_estimate': rec.get('time_estimate'), 'time_spent': rec.get('time_spent'),
        'attachments': rec.get('attachments_count'), 'src': [src],
    }


def merge(dst, add):
    """รวมข้อมูลงานเดียวกันจากหลาย response — ของที่มีค่าชนะค่าว่าง, จำแหล่งที่พบไว้ทั้งหมด"""
    for k, v in add.items():
        if k == 'src':
            dst['src'] = sorted(set(dst['src']) | set(v))
        elif k in ('parent',):
            if v:                                  # subtasks[] ให้ parent มา, filter_tasks ไม่ให้ → ไม่ทับด้วย None
                dst[k] = v
        elif v not in (None, '', [], 0) or dst.get(k) in (None, '', []):
            if not (k == 'desc' and not v and dst.get('desc')):
                dst[k] = v
    return dst


def load():
    man = json.load(open(os.path.join(RAW, '_manifest.json'), encoding='utf-8'))
    tasks, fetched, calls = {}, [], []
    hierarchy, user, cfields, tentries = None, None, None, None
    for c in man['calls']:
        p = os.path.join(RAW, c['file'])
        if not c['ok'] or not os.path.exists(p):
            continue
        d = json.load(open(p, encoding='utf-8'))
        calls.append({'tool': c['tool'], 'params': c['params'], 'fetched_at': c['fetched_at']})
        fetched.append(c['fetched_at'])
        if c['tool'] == 'get_user':
            user = d
        elif c['tool'] == 'get_workspace_hierarchy':
            hierarchy = d
        elif c['tool'] == 'get_custom_fields':
            cfields = d
        elif c['tool'] == 'get_time_entries':
            tentries = d
        elif c['tool'] == 'filter_tasks':
            if str(d.get('has_more')).lower() == 'true':
                raise SystemExit('filter_tasks ยังมีหน้าต่อ (has_more=true) — ต้องดึงหน้าถัดไปก่อน import')
            for t in d.get('tasks') or []:
                r = flat(t, 'filter_tasks')
                tasks[r['id']] = merge(tasks[r['id']], r) if r['id'] in tasks else r
        elif c['tool'] == 'get_task':
            r = flat(d, 'get_task')
            tasks[r['id']] = merge(tasks[r['id']], r) if r['id'] in tasks else r
            for s in d.get('subtasks') or []:
                q = flat(s, 'get_task.subtasks')
                q['parent'] = q['parent'] or d['id']
                # subtasks[] ไม่ส่ง list/space มา — รับช่วงจากงานหลัก
                q['list_id'] = q['list_id'] or r['list_id']; q['list_name'] = q['list_name'] or r['list_name']
                tasks[q['id']] = merge(tasks[q['id']], q) if q['id'] in tasks else q
    return tasks, sorted(fetched), calls, hierarchy, user, cfields, tentries


def classification():
    out = {}
    p = os.path.join(ROOT, 'config', 'project_classification.csv')
    for row in csv.DictReader(l for l in open(p, encoding='utf-8') if not l.startswith('#')):
        tid = (row.get('task_id') or '').strip()
        if not tid:
            continue
        t = (row.get('type') or '').strip()
        if t not in TYPES:
            raise SystemExit(f'ประเภทไม่ถูกต้องใน project_classification.csv: {tid} = {t}')
        st = (row.get('state') or 'proposed').strip() or 'proposed'
        by, on = (row.get('confirmed_by') or '').strip(), (row.get('confirmed_on') or '').strip()
        if st == 'confirmed' and not (by and on):
            raise SystemExit(f'{tid}: state=confirmed แต่ไม่มี confirmed_by/confirmed_on — ยืนยันเองไม่ได้')
        if st not in ('proposed', 'confirmed'):
            raise SystemExit(f'{tid}: state ต้องเป็น proposed หรือ confirmed')
        out[tid] = {'type': t, 'state': st, 'reason': (row.get('reason') or '').strip(),
                    'evidence': (row.get('evidence') or '').strip(),
                    'confirmed_by': by or None, 'confirmed_on': on or None}
    return out


def build():
    tasks, fetched, calls, hierarchy, user, cfields, tentries = load()
    cls = classification()
    settings = json.load(open(os.path.join(ROOT, 'config', 'settings.json'), encoding='utf-8'))
    stale_days = int(settings.get('project_stale_days') or 30)
    now_iso = (user or {}).get('current_time')                       # เวลาจาก ClickUp ตาม timezone ผู้ใช้
    if not now_iso:
        raise SystemExit('ไม่พบ get_user ใน raw/clickup — ต้องมีเวลาและ timezone จาก ClickUp ก่อนคำนวณงานเกินกำหนด')
    tz = (user or {}).get('timezone')
    if tz != 'Asia/Bangkok':
        raise SystemExit(f'timezone ของผู้ใช้ ClickUp = {tz} ไม่ใช่ Asia/Bangkok — ตรวจก่อนคำนวณวัน')
    now = datetime.datetime.fromisoformat(now_iso)
    today = now.date().isoformat()

    rows = sorted(tasks.values(), key=lambda r: (r['parent'] or '', r['created'] or ''))
    by_id = {r['id']: r for r in rows}
    problems, checks = [], []

    def check(name, ok, detail):
        checks.append({'name': name, 'ok': bool(ok), 'detail': detail})
        if not ok:
            problems.append(f'{name} — {detail}')

    # 1) parent ทุกตัวต้องมีอยู่จริงในชุดข้อมูล
    orphan = [r['id'] for r in rows if r['parent'] and r['parent'] not in by_id]
    check('งานย่อยทุกรายการมีงานหลักอยู่ในชุดข้อมูล', not orphan,
          'ครบทุกรายการ' if not orphan else 'ไม่พบงานหลักของ: ' + ', '.join(orphan))
    # 2) ไม่มีวงจร parent และไม่มีงานย่อยลึกเกินที่รองรับ
    depth = {}
    for r in rows:
        seen, d, cur = set(), 0, r
        while cur.get('parent'):
            if cur['id'] in seen:
                problems.append('พบวงจร parent ที่ ' + r['id']); break
            seen.add(cur['id']); cur = by_id[cur['parent']]; d += 1
        depth[r['id']] = d
    check('ลำดับชั้นงานไม่มีวงจรอ้างอิง', not any('วงจร parent' in p for p in problems), 'ลึกสุด %d ชั้น' % max(depth.values() or [0]))
    # 3) จำนวนงานหลัก/งานย่อยแยกกัน และ id ไม่ซ้ำ
    mains = [r for r in rows if not r['parent']]
    subs = [r for r in rows if r['parent']]
    check('Task ID ไม่ซ้ำหลัง dedupe (งานเดียวมาได้ทั้งจากผลค้นและ subtasks)', len(rows) == len(tasks),
          f'{len(rows)} รายการ = งานหลัก {len(mains)} + งานย่อย {len(subs)}')
    # 4) ทุกงานหลักต้องมีการจำแนก
    unmapped = [r['id'] for r in mains if r['id'] not in cls]
    check('งานหลักทุกรายการมีข้อเสนอการจำแนกประเภท', not unmapped,
          'ครบ %d รายการ' % len(mains) if not unmapped else 'ยังไม่จำแนก (แสดงเป็น needs_review): ' + ', '.join(unmapped))
    extra = [t for t in cls if t not in by_id]
    check('ไฟล์จำแนกไม่มี Task ID ที่ไม่มีอยู่จริงใน ClickUp', not extra,
          'ตรงกันทั้งหมด' if not extra else 'ไม่พบใน ClickUp: ' + ', '.join(extra))
    # 5) ดึงจาก SAM space เท่านั้น
    lists = {}
    for sp in ((hierarchy or {}).get('hierarchy') or {}).get('root', {}).get('children', []) or []:
        if sp.get('id') != SPACE_ID:
            problems.append('raw มี space อื่นนอก SAM: ' + str(sp.get('id')))
        for li in sp.get('children') or []:
            lists[li['id']] = (li.get('name') or '').strip()
    bad_list = sorted({r['list_id'] for r in rows if r['list_id'] and r['list_id'] not in lists})
    check('ทุกงานอยู่ใน List ของ SAM Space เท่านั้น', not bad_list,
          '%d List' % len(lists) if not bad_list else 'List นอก SAM: ' + ', '.join(bad_list))

    # ----- ชั้นจำแนก + ธงประเด็น -----
    kids = {}
    for r in subs:
        kids.setdefault(r['parent'], []).append(r)
    out = []
    for r in rows:
        c = cls.get(r['id']) if not r['parent'] else None
        g = group_of(r['status'])
        ch = kids.get(r['id']) or []
        ch_live = [k for k in ch if group_of(k['status']) != 'cancelled']        # ตัวหาร: ไม่รวมงานที่ยกเลิก
        ch_done = [k for k in ch_live if group_of(k['status']) == 'done']
        overdue = bool(r['due']) and day(r['due']) < today and g not in ('done', 'cancelled')
        issues = []
        if overdue:
            issues.append({'k': 'overdue', 'txt': 'เกินกำหนด %d วัน (กำหนด %s)' % ((now.date() - datetime.date.fromisoformat(day(r['due']))).days, day(r['due']))})
        if not r['due'] and g not in ('done', 'cancelled'):
            issues.append({'k': 'nodue', 'txt': 'ไม่มีกำหนดส่ง'})
        if r['parent'] and r['due'] and by_id[r['parent']]['due'] and day(r['due']) > day(by_id[r['parent']]['due']):
            issues.append({'k': 'afterparent', 'txt': 'กำหนดเสร็จ %s หลังงานหลัก %s — กำหนดการไม่สอดคล้อง ต้องทบทวน' % (day(r['due']), day(by_id[r['parent']]['due']))})
        if r['updated'] and (now.date() - datetime.date.fromisoformat(day(r['updated']))).days > stale_days and g in ('active', 'notstarted'):
            issues.append({'k': 'stale', 'txt': 'ไม่อัปเดตใน ClickUp %d วัน (เกณฑ์ภายใน %d วัน)' % ((now.date() - datetime.date.fromisoformat(day(r['updated']))).days, stale_days)})
        if g == 'done' and [k for k in ch_live if group_of(k['status']) not in ('done',)]:
            issues.append({'k': 'donewithopen', 'txt': 'งานหลัก complete แต่งานย่อยยังไม่ปิด %d รายการ' % len([k for k in ch_live if group_of(k['status']) != 'done'])})
        if g in ('active', 'notstarted') and ch_live and len(ch_done) == len(ch_live):
            issues.append({'k': 'kidsdone', 'txt': 'งานย่อยเสร็จครบแล้วแต่งานหลักยังไม่ complete — ให้ผู้รับผิดชอบทบทวนสถานะ'})
        if g == 'done' and not r['closed']:
            issues.append({'k': 'noclosed', 'txt': 'สถานะ complete แต่ ClickUp ไม่มีวันที่ปิดงาน (date_closed ว่าง) — ใช้สถานะเป็นหลัก'})
        if c and c['type'] == 'needs_review':
            issues.append({'k': 'needsreview', 'txt': 'ข้อมูลไม่พอจำแนกประเภท: ' + (c['reason'] or 'ไม่มี description/ผลส่งมอบ')})
        if c and c['type'] == 'recurring_operation' and g == 'done':
            issues.append({'k': 'recurdone', 'txt': 'งานประจำสถานะ complete — ข้อมูลที่ดึงได้ไม่มีหลักฐานการอัปเดตรอบล่าสุด ต้องยืนยันกับผู้รับผิดชอบ'})
        if not r['desc'] and not r['parent'] and not ch:
            issues.append({'k': 'nodesc', 'txt': 'ไม่มี description และไม่มีงานย่อย — ตรวจผลส่งมอบไม่ได้'})
        # sev=action → ประเด็นที่ต้องดำเนินการ · sev=data → ข้อจำกัดของข้อมูล ไม่ใช่งานที่ต้องตาม
        for i in issues:
            i['sev'] = 'data' if i['k'] in ('noclosed',) else 'action'
        q = dict(r)
        q.pop('src', None)
        q['sources'] = r['src']
        q['group'] = g
        q['depth'] = depth[r['id']]
        q['kids'] = [k['id'] for k in ch]
        q['kid_done'] = len(ch_done) if ch_live else None       # ไม่มีงานย่อย → None (แสดง N/A ไม่ใช่ 0%)
        q['kid_total'] = len(ch_live) if ch_live else None
        q['kid_cancelled'] = len(ch) - len(ch_live)
        q['cls'] = c or None
        q['issues'] = issues
        out.append(q)

    # งานที่ชื่อซ้ำกัน — แสดงเป็นรายการรอตรวจความสัมพันธ์ ไม่รวมให้โดยอัตโนมัติ
    nm = {}
    for r in out:
        nm.setdefault(r['name'].strip(), []).append(r['id'])
    dupes = [{'name': k, 'ids': v} for k, v in nm.items() if len(v) > 1]

    # หลักฐานเรื่องเวลา/ทรัพยากร — เก็บข้อเท็จจริง ไม่คำนวณ Utilization
    sam_ids = set(by_id)
    te = tentries or {}
    te_rows = te.get('entries') or []
    time_ev = {
        'tasks_with_estimate': sum(1 for r in out if r['time_estimate']),
        'tasks_with_time_spent': sum(1 for r in out if r['time_spent']),
        'time_entries_in_space': sum(1 for e in te_rows if ((e.get('task') or {}).get('id')) in sam_ids),
        'time_entries_workspace': len(te_rows),
        'window': {'from': (te.get('_window') or {}).get('from') or next((c['params'].get('start_date') for c in calls if c['tool'] == 'get_time_entries'), None),
                   'to': next((c['params'].get('end_date') for c in calls if c['tool'] == 'get_time_entries'), None)},
    }
    custom_fields = [{'name': f.get('name'), 'type': f.get('type')} for f in ((cfields or {}).get('space_fields') or [])]

    if problems:
        print('ไม่เขียน data/projects.json — การตรวจสำคัญไม่ผ่าน:\n- ' + '\n- '.join(problems))
        raise SystemExit(1)

    status_counts = {}
    for r in out:
        status_counts[r['status'] or 'ไม่ระบุ'] = status_counts.get(r['status'] or 'ไม่ระบุ', 0) + 1

    doc = {
        'meta': {
            'source': 'ClickUp MCP (Workspace 90182760752 · SAM Space %s) — อ่านอย่างเดียว ผ่าน session ของผู้ช่วย' % SPACE_ID,
            'space_id': SPACE_ID, 'workspace_id': next((c['params'].get('workspace_id') for c in calls), None),
            'tz': tz, 'now': now_iso, 'today': today,
            'fetched_from': fetched[0], 'fetched_to': fetched[-1],
            'built_at': datetime.datetime.now(BKK).isoformat(timespec='seconds'),
            'stale_days': stale_days,
            'calls': calls, 'lists': [{'id': k, 'name': v} for k, v in lists.items()],
            'counts': {'tasks': len(out), 'mains': len(mains), 'subs': len(subs), 'by_status': status_counts},
            'checks': checks, 'custom_fields': custom_fields, 'time_evidence': time_ev,
            'limits': [
                {'topic': 'ประเภทงาน', 'detail': 'ประเภททุกรายการเป็นข้อเสนอ (proposed) จนผู้รับผิดชอบยืนยัน — ชั้นจำแนกอยู่ใน config/project_classification.csv ไม่ได้แก้ ClickUp ต้นทาง'},
                {'topic': 'ความคืบหน้าจริง', 'detail': 'ClickUp ไม่มีช่องเปอร์เซ็นต์ความคืบหน้าที่ผู้ควบคุมงานยืนยัน — หน้านี้แสดงได้เพียงสถานะงานหลักและสัดส่วนงานย่อยที่ปิดแล้ว ไม่ใช่ Physical Progress'},
                {'topic': 'ชั่วโมงทำงาน', 'detail': 'งานใน SAM Space ไม่มี Time Estimate/Time Spent และช่วงที่ตรวจไม่พบ time entry ของงานในพื้นที่นี้ จึงไม่คำนวณ Resource Utilization หรือต้นทุนแรงงาน'},
                {'topic': 'งบประมาณและต้นทุนจริง', 'detail': 'ยังไม่มี mapping รหัสโครงการ ↔ เอกสาร TRCLOUD ที่ยืนยันแล้ว จึงไม่ผูกงบหรือค่าใช้จ่ายกับงานใน ClickUp ด้วยชื่อที่คล้ายกัน'},
                {'topic': 'Custom field', 'detail': 'Space นี้มีเฉพาะฟิลด์ BASELINE_* ของฟีเจอร์ baselines และไม่มีค่าในงานที่ดึงได้ จึงไม่มีแผน baseline ให้เทียบ'},
                {'topic': 'วันที่ปิดงาน', 'detail': 'มีงานสถานะ complete ที่ date_closed ว่าง — การนับงานเสร็จใช้ชื่อสถานะของ ClickUp ไม่ใช่ date_closed'},
            ],
        },
        'tasks': out, 'name_dupes': dupes,
    }
    json.dump(doc, open(os.path.join(DATA, 'projects.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    return doc


if __name__ == '__main__':
    d = build()
    m = d['meta']
    print('projects.json · ดึง', m['fetched_from'][:19], '→', m['fetched_to'][:19], '· วันนี้ตาม ClickUp', m['today'])
    print('  งานทั้งหมด %d = งานหลัก %d + งานย่อย %d · สถานะ: %s' % (
        m['counts']['tasks'], m['counts']['mains'], m['counts']['subs'],
        ' · '.join(f'{k} {v}' for k, v in sorted(m['counts']['by_status'].items()))))
    ty = {}
    for t in d['tasks']:
        if t['cls']:
            ty[t['cls']['type'] + '/' + t['cls']['state']] = ty.get(t['cls']['type'] + '/' + t['cls']['state'], 0) + 1
    print('  จำแนกงานหลัก:', ' · '.join(f'{k} {v}' for k, v in sorted(ty.items())))
    print('  ประเด็นที่ต้องดำเนินการ:', sum(1 for t in d['tasks'] for i in t['issues'] if i['sev'] == 'action'),
          '· ข้อจำกัดข้อมูล:', sum(1 for t in d['tasks'] for i in t['issues'] if i['sev'] == 'data'),
          '· ชื่อซ้ำรอตรวจ', len(d['name_dupes']), 'กลุ่ม')
    print('  หลักฐานเวลา:', json.dumps(m['time_evidence'], ensure_ascii=False))
    for c in m['checks']:
        print(('  ✓ ' if c['ok'] else '  ✗ ') + c['name'] + ' — ' + c['detail'])
