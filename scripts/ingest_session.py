"""Source adapter (session mode): เก็บผลลัพธ์ดิบจากเครื่องมือ TRCLOUD ของ SAM (อ่านอย่างเดียว) ที่เรียกใน session ของผู้ช่วย → raw/
ใช้เมื่อ backend เข้าถึง MCP เองไม่ได้ — อ่าน transcript ของ session แล้วบันทึก response ดิบทุกครั้งพร้อม metadata
ใช้: python3 scripts/ingest_session.py <transcript.jsonl>
ผล: raw/<dataset>__<hash>.json (response ดิบ) + raw/_manifest.json (เครื่องมือ พารามิเตอร์ เวลาที่ดึง จำนวนแถว)"""
import json, sys, os, re, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw'); os.makedirs(RAW, exist_ok=True)
PREFIX = 'mcp__SAM-TRCLOUD__'           # ใช้เฉพาะบริษัท SAM
WRITE = re.compile(r'^(create|update|delete|approve|patch|convert|attach|ocr|run_import|import|send|upload)_')
tp = sys.argv[1]
uses, man = {}, []
for line in open(tp, encoding='utf-8'):
    try: o = json.loads(line)
    except Exception: continue
    c = (o.get('message') or {}).get('content')
    if not isinstance(c, list): continue
    for b in c:
        if not isinstance(b, dict): continue
        if b.get('type') == 'tool_use' and b.get('name', '').startswith(PREFIX):
            tool = b['name'][len(PREFIX):]
            if WRITE.match(tool): raise SystemExit('พบการเรียกเครื่องมือเขียนข้อมูล: ' + tool)
            uses[b['id']] = (tool, b.get('input') or {}, o.get('timestamp'))
        if b.get('type') == 'tool_result' and b.get('tool_use_id') in uses:
            tool, params, _ = uses[b['tool_use_id']]
            cc = b.get('content'); txt = cc if isinstance(cc, str) else ''.join(x.get('text', '') for x in cc if isinstance(x, dict))
            m = re.search(r'Output has been saved to (\S+?\.txt)', txt)
            if m and os.path.exists(m.group(1)): txt = open(m.group(1), encoding='utf-8').read()
            try: data = json.loads(txt)
            except Exception: data = None
            key = hashlib.sha1(json.dumps([tool, params], sort_keys=True).encode()).hexdigest()[:10]
            fn = f'{tool}__{key}.json'
            ok = isinstance(data, dict) and str(data.get('success')) == '1'
            rec = {'file': fn, 'tool': tool, 'params': params, 'fetched_at': o.get('timestamp'), 'ok': ok,
                   'rows': len(data['result']) if ok and isinstance(data.get('result'), list) else None,
                   'http': (data or {}).get('HTTP') if isinstance(data, dict) else None,
                   'message': (data or {}).get('message') if isinstance(data, dict) else txt[:200]}
            if isinstance(data, dict): json.dump(data, open(os.path.join(RAW, fn), 'w', encoding='utf-8'), ensure_ascii=False)
            man = [x for x in man if x['file'] != fn] + [rec]     # การเรียกซ้ำพารามิเตอร์เดิม → ใช้ครั้งล่าสุด
json.dump({'source': 'TRCLOUD MCP (SAM) — session snapshot, read-only', 'calls': man}, open(os.path.join(RAW, '_manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in man: print(('OK ' if r['ok'] else 'ERR'), r['tool'], json.dumps(r['params'], ensure_ascii=False)[:90], r['rows'], r['fetched_at'])
