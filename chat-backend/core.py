"""Transport-independent chat rules. No external calls inside storage transactions."""
import hashlib
import hmac
import re
import secrets
import time

TTL = 7 * 86400
SID = re.compile(r'^[a-f0-9]{32}$')
REQUEST = re.compile(r'^[A-Za-z0-9_-]{16,80}$')

class Reject(Exception):
    def __init__(self, code, text):
        self.code, self.text = code, text
        super().__init__(text)

class Chat:
    def __init__(self, store, channels, notify, clock=time.time):
        self.store, self.channels, self.notify, self.clock = store, channels, notify, clock

    def rate(self, key, limit, window=60):
        now = int(self.clock())
        def update(v):
            if not v or now >= v['until']: v = {'until':now + window, 'count':0}
            if v['count'] >= limit: raise Reject(429, 'Слишком много запросов. Попробуйте позже.')
            v['count'] += 1
            return v, None
        self.store.mutate('rate:' + key, now + window, update)

    def create(self, ip, trap):
        if trap: raise Reject(400, 'Запрос отклонён')
        self.rate('sessions:' + ip, 5, 3600)
        self.rate('sessions:global', 100, 3600)
        sid, token = secrets.token_hex(16), secrets.token_urlsafe(32)
        now = int(self.clock())
        self.store.mutate('session:' + sid, now + TTL, lambda _: ({
            'hash':hashlib.sha256(token.encode()).hexdigest(), 'until':now+TTL,
            'messages':[], 'last_send':0}, None))
        return {'sid':sid, 'token':token}

    def authorize(self, sid, token, v):
        if not isinstance(sid,str) or not SID.fullmatch(sid) or not isinstance(token,str):
            raise Reject(401, 'Сессия недействительна. Отправьте сообщение снова.')
        if not v or v['until'] <= self.clock() or not hmac.compare_digest(v['hash'], hashlib.sha256(token.encode()).hexdigest()):
            raise Reject(401, 'Сессия истекла. Отправьте сообщение снова.')

    def history(self, sid, token):
        v = self.store.get('session:' + str(sid)); self.authorize(sid,token,v)
        self.rate('poll:' + sid, 8)
        self.flush(sid)
        return self.public(self.store.get('session:' + sid))

    def public(self, v):
        return {'messages':[{'role':m['role'],'text':m['text'],'at':m['at']} for m in v['messages']]}

    def message(self, sid, token, text, request_id, trap):
        if trap: raise Reject(400, 'Запрос отклонён')
        if not isinstance(text,str) or not 1 <= len(text.strip()) <= 2000:
            raise Reject(400, 'Сообщение должно содержать от 1 до 2000 символов.')
        if not isinstance(request_id,str) or not REQUEST.fullmatch(request_id): raise Reject(400,'Некорректный запрос')
        now = int(self.clock())
        # Validate before mutation and before allowing any outbound notification.
        self.authorize(sid,token,self.store.get('session:' + str(sid)))
        self.rate('message:global', 60)
        def append(v):
            self.authorize(sid,token,v)
            existing = next((m for m in v['messages'] if m['id']==request_id),None)
            if existing:
                if existing['text'] != text.strip(): raise Reject(409,'Идентификатор сообщения уже использован')
                return v, None
            if now-v['last_send'] < 3: raise Reject(429,'Подождите несколько секунд перед отправкой.')
            if len(v['messages']) >= 200: raise Reject(429,'Чат достиг лимита. Напишите на info@honti-it.ru.')
            v['messages'].append({'id':request_id,'role':'visitor','text':text.strip(),'at':now,'sent':[]})
            v['last_send'] = now
            return v,None
        self.store.mutate('session:' + sid, now + TTL, append)
        self.flush(sid)
        return self.public(self.store.get('session:' + sid))

    def flush(self, sid):
        # Retry pending delivery with a short lease, avoiding concurrent duplicate sends.
        now=int(self.clock())
        for channel in self.channels:
            def claim(v):
                for m in v['messages']:
                    if m['role']=='visitor' and channel not in m['sent']:
                        lease=m.setdefault('lease',{})
                        if lease.get(channel,0)>now: return v,None
                        lease[channel]=now+30
                        return v,dict(m)
                return v,None
            item=self.store.mutate('session:'+sid,now+TTL,claim)
            if not item: continue
            try: mid=self.notify(channel,sid,item['text'])
            except Exception:
                # Retry on a repeated visitor request; don't expose token-bearing URLs.
                def release(v):
                    next(m for m in v['messages'] if m['id']==item['id'])['lease'][channel]=0
                    return v,None
                self.store.mutate('session:'+sid,now+TTL,release)
                continue
            self.store.mutate('reply:'+channel+':'+str(mid),now+TTL,lambda _:({'sid':sid},None))
            def delivered(v):
                m=next(m for m in v['messages'] if m['id']==item['id'])
                if channel not in m['sent']:m['sent'].append(channel)
                return v,None
            self.store.mutate('session:'+sid,now+TTL,delivered)

    def reply(self, channel, event_id, text, parent=None):
        if not isinstance(text,str): return
        command = re.fullmatch(r'/reply ([a-f0-9]{32}) ([\s\S]+)',text.strip())
        ref=self.store.get('reply:'+channel+':'+str(parent)) if parent else None
        sid=command.group(1) if command else (ref or {}).get('sid')
        if not sid:return
        text=command.group(2) if command else text.strip()
        if not 1<=len(text)<=2000:return
        now=int(self.clock())
        def append(v):
            if not v or v['until']<=now:return v,None
            key='operator:'+channel+':'+str(event_id)
            if not any(m['id']==key for m in v['messages']) and len(v['messages'])<200:
                v['messages'].append({'id':key,'role':'operator','text':text,'at':now})
            return v,None
        self.store.mutate('session:'+sid,now+TTL,append)
