"""Source adapter (session mode): เก็บผลลัพธ์ดิบจากเครื่องมือ ClickUp MCP (อ่านอย่างเดียว) ที่เรียกใน session ของผู้ช่วย → raw/clickup/
เว็บ static เรียก MCP เองไม่ได้ จึงใช้วิธีเดียวกับ ingest_session.py ของ TRCLOUD คือ
อ่าน transcript ของ session แล้วบันทึก response ดิบทุกครั้งพร้อมเวลาที่ดึง (ไม่พิมพ์ข้อมูลใหม่ด้วยมือ)

ใช้: python3 scripts/ingest_clickup.py <transcript.jsonl>
ผล: raw/clickup/<tool>__<hash>.json (response ดิบ) + raw/clickup/_manifest.json (เครื่องมือ พารามิเตอร์ เวลาที่ดึง)

เงื่อนไขความปลอดภัย: เจอการเรียกเครื่องมือที่เขียน/แก้ ClickUp → หยุดทันที ไม่เขียนไฟล์
"""
import json, sys, os, re, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw', 'clickup'); os.makedirs(RAW, exist_ok=True)
PREFIX = 'mcp__ClickUp__clickup_'
# อ่านอย่างเดียวเท่านั้น — เครื่องมือที่เปลี่ยนข้อมูลใน ClickUp ต้นทางถือเป็นข้อผิดพลาด
WRITE = re.compile(r'^(create|update|delete|add|remove|merge|move|attach|send|react|publish|start|stop|request|execute|resolve|download)')
READ_OK = ('get_user', 'get_workspace_hierarchy', 'get_list', 'get_folder', 'filter_tasks', 'get_task',
           'get_task_comments', 'get_custom_fields', 'get_time_entries', 'search', 'get_workspace_members',
           'get_task_time_in_status', 'get_bulk_tasks_time_in_status', 'find_member_by_name', 'get_schema')


def main(path):
    uses, man = {}, []
    for line in open(path, encoding='utf-8'):
        try:
            o = json.loads(line)
        except Exception:
            continue
        c = (o.get('message') or {}).get('content')
        if not isinstance(c, list):
            continue
        for b in c:
            if not isinstance(b, dict):
                continue
            if b.get('type') == 'tool_use' and b.get('name', '').startswith(PREFIX):
                tool = b['name'][len(PREFIX):]
                if WRITE.match(tool) or tool not in READ_OK:
                    raise SystemExit('พบการเรียกเครื่องมือที่ไม่ใช่อ่านอย่างเดียว: ' + tool)
                uses[b['id']] = (tool, b.get('input') or {}, o.get('timestamp'))
            if b.get('type') == 'tool_result' and b.get('tool_use_id') in uses:
                tool, params, ts = uses[b['tool_use_id']]
                cc = b.get('content')
                txt = cc if isinstance(cc, str) else ''.join(x.get('text', '') for x in cc if isinstance(x, dict))
                m = re.search(r'Output has been saved to (\S+?\.txt)', txt)
                if m and os.path.exists(m.group(1)):
                    txt = open(m.group(1), encoding='utf-8').read()
                try:
                    data = json.loads(txt)
                except Exception:
                    data = None
                key = hashlib.sha1(json.dumps([tool, params], sort_keys=True).encode()).hexdigest()[:10]
                fn = f'{tool}__{key}.json'
                rec = {'file': fn, 'tool': tool, 'params': params, 'fetched_at': o.get('timestamp'),
                       'ok': isinstance(data, (dict, list)), 'message': None if isinstance(data, (dict, list)) else txt[:200]}
                if isinstance(data, (dict, list)):
                    json.dump(data, open(os.path.join(RAW, fn), 'w', encoding='utf-8'), ensure_ascii=False)
                man = [x for x in man if x['file'] != fn] + [rec]   # เรียกซ้ำพารามิเตอร์เดิม → ใช้ครั้งล่าสุด
    if not man:
        raise SystemExit('ไม่พบการเรียก ClickUp MCP ใน transcript นี้')
    json.dump({'source': 'ClickUp MCP — session snapshot, read-only', 'calls': man},
              open(os.path.join(RAW, '_manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for r in man:
        print(('OK ' if r['ok'] else 'ERR'), r['tool'], json.dumps(r['params'], ensure_ascii=False)[:80], r['fetched_at'])


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
