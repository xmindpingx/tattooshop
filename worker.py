#!/usr/bin/env python3
"""Persistent worker: one JSON request per line on stdin, one JSON reply per line on stdout. Keeps the models loaded."""
import sys, json, traceback
proto = sys.stdout
sys.stdout = sys.stderr            # stray prints must never corrupt the protocol
import engine

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    rid = None
    try:
        req = json.loads(line)
        rid = req.get('id')
        result = getattr(engine, 'cmd_' + req['cmd'])(**(req.get('args') or {}))
        reply = {'id': rid, 'ok': True, 'result': result}
    except Exception as e:
        traceback.print_exc()
        reply = {'id': rid, 'ok': False, 'error': str(e)}
    proto.write(json.dumps(reply) + '\n')
    proto.flush()
