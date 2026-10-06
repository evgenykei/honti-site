"""Yandex Cloud Function entrypoint. Deploy with entrypoint index.handler."""
import base64
import hashlib
import hmac
import json
import os
import ssl
from urllib.request import Request, urlopen
from core import Chat, Reject

_chat = None

def configured():
    return [c for c in ('TELEGRAM','MAX') if all(os.environ.get(c+'_'+k) for k in ('TOKEN','OWNER_ID','WEBHOOK_SECRET'))]

def request_json(url, body, headers=None):
    # TLS verification stays enabled. For MAX an optional approved CA bundle can be supplied.
    ca=os.environ.get('MAX_CA_FILE') if url.startswith('https://platform-api2.max.ru/') else None
    context=ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()
    request=Request(url,json.dumps(body).encode(),{'Content-Type':'application/json',**(headers or {})},method='POST')
    with urlopen(request,timeout=6,context=context) as response:return json.load(response)

def notify(channel,sid,text):
    prefix=channel.upper();owner=os.environ[prefix+'_OWNER_ID'];token=os.environ[prefix+'_TOKEN']
    text='Чат сайта ХОНТИ\n'+text+'\n\nОтветьте на это сообщение или отправьте:\n/reply '+sid+' ваш ответ'
    if channel=='telegram':
        body=request_json('https://api.telegram.org/bot'+token+'/sendMessage',{'chat_id':int(owner),'text':text,'disable_web_page_preview':True})
        if not body.get('ok'):raise RuntimeError('Delivery failed')
        return str(body['result']['message_id'])
    body=request_json('https://platform-api2.max.ru/messages?user_id='+owner,{'text':text},{'Authorization':token})
    return str(body['message']['body']['mid'])

def get_chat():
    global _chat
    if _chat is None:
        from storage import Store
        _chat=Chat(Store(),[c.lower() for c in configured()],notify)
    return _chat

def operator_event(channel,body,chat):
    owner=os.environ[channel.upper()+'_OWNER_ID']
    if channel=='telegram':
        message=body.get('message') or {}
        # Only the owner's private dialog, not a group with an authorized sender.
        if str(message.get('from',{}).get('id'))!=owner or str(message.get('chat',{}).get('id'))!=owner:return
        parent=(message.get('reply_to_message') or {}).get('message_id')
        chat.reply(channel,body.get('update_id'),message.get('text'),parent)
    elif body.get('update_type')=='message_created':
        message=body.get('message') or {}
        if str((message.get('sender') or {}).get('user_id'))!=owner:return
        # MAX private-dialog recipient has chat_type=dialog.
        if (message.get('recipient') or {}).get('chat_type')!='dialog':return
        link=message.get('link') or {}
        parent=(link.get('message') or {}).get('mid') if link.get('type')=='reply' else None
        content=message.get('body') or {}
        chat.reply(channel,content.get('mid'),content.get('text'),parent)

def handler(event, context):
    headers={k.lower():v for k,v in (event.get('headers') or {}).items()}
    origin=headers.get('origin','');allowed=os.environ.get('CHAT_ORIGIN','https://honti-it.ru')
    response_headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'}
    if origin==allowed:response_headers.update({'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'})
    def result(code,body):return {'statusCode':code,'headers':response_headers,'body':json.dumps(body,ensure_ascii=False)}
    try:
        method=event.get('httpMethod');action=(event.get('queryStringParameters') or {}).get('action','')
        if method=='OPTIONS':return result(204,{}) if origin==allowed else result(403,{'error':'Origin rejected'})
        if method!='POST':return result(405,{'error':'Method not allowed'})
        channels=configured()
        if action in ('telegram','max'):
            prefix=action.upper()
            header='x-telegram-bot-api-secret-token' if action=='telegram' else 'x-max-bot-api-secret'
            secret=os.environ.get(prefix+'_WEBHOOK_SECRET','')
            if prefix not in channels or not secret or not hmac.compare_digest(str(headers.get(header,'')),secret):return result(403,{'error':'Webhook rejected'})
        elif origin!=allowed:return result(403,{'error':'Origin rejected'})
        raw=event.get('body') or ''
        if event.get('isBase64Encoded'):raw=base64.b64decode(raw,validate=True).decode()
        if len(raw.encode())>16384:return result(413,{'error':'Request too large'})
        body=json.loads(raw)
        if not isinstance(body,dict):raise ValueError()
        if not channels:return result(503,{'error':'Чат ещё подключается. Напишите на info@honti-it.ru.'})
        chat=get_chat()
        if action in ('telegram','max'):
            operator_event(action,body,chat);return result(200,{'ok':True})
        if action=='session':
            ip=(event.get('requestContext') or {}).get('identity',{}).get('sourceIp','unknown')
            # Raw IP addresses are never stored. The server-only salt prevents simple reverse lookup.
            salt=os.environ['RATE_SALT'];digest=hmac.new(salt.encode(),ip.encode(),hashlib.sha256).hexdigest()
            return result(200,chat.create(digest,body.get('website')))
        if action=='history':return result(200,chat.history(body.get('sid'),body.get('token')))
        if action=='message':return result(200,chat.message(body.get('sid'),body.get('token'),body.get('text'),body.get('request_id'),body.get('website')))
        return result(404,{'error':'Unknown action'})
    except Reject as error:return result(error.code,{'error':error.text})
    except (ValueError,TypeError,UnicodeError):return result(400,{'error':'Некорректный запрос'})
    except Exception:
        # Do not log request bodies, credentials or outbound exception URLs.
        return result(503,{'error':'Связь временно недоступна. Напишите на info@honti-it.ru.'})
