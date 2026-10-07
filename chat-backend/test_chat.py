import copy
import json
import os
import unittest
import types
import settings
from unittest.mock import patch
from core import Chat, Reject
import index

class Memory:
    def __init__(self):self.rows={}
    def get(self,key):return copy.deepcopy(self.rows.get(key))
    def mutate(self,key,expires,fn):
        value,result=fn(self.get(key))
        if value is not None:self.rows[key]=copy.deepcopy(value)
        return result

class ChatTests(unittest.TestCase):
    def setUp(self):
        self.store=Memory();self.sent=[];self.now=100000
        def send(c,s,t):self.sent.append((c,s,t));return str(len(self.sent))
        self.chat=Chat(self.store,['telegram','max'],send,lambda:self.now)
        self.s=self.chat.create('hashed-ip','')
    def send(self,text='Привет',rid='request_000000000001'):
        return self.chat.message(**self.s,text=text,request_id=rid,trap='')
    def test_cross_session_access_rejected(self):
        other=self.chat.create('other','')
        with self.assertRaises(Reject):self.chat.history(self.s['sid'],other['token'])
        with self.assertRaises(Reject):self.chat.message(self.s['sid'],other['token'],'wrong','request_000000000002','')
        self.assertEqual(self.sent,[])
    def test_retry_no_duplicate(self):
        self.send();self.send()
        self.assertEqual(len(self.chat.history(**self.s)['messages']),1)
        self.assertEqual(len(self.sent),2)
    def test_reply_native_and_dedup(self):
        self.send()
        self.chat.reply('telegram',11,'Здравствуйте',parent='1')
        self.chat.reply('telegram',11,'Здравствуйте',parent='1')
        self.chat.reply('max','evt2','Другой ответ',parent='2')
        messages=self.chat.history(**self.s)['messages']
        self.assertEqual([m['text'] for m in messages],['Привет','Здравствуйте','Другой ответ'])
        self.assertTrue(all(set(m)=={'role','text','at'} for m in messages))
    def test_expired_token(self):
        self.now+=8*86400
        with self.assertRaises(Reject):self.chat.history(**self.s)
    def test_rate_and_honeypot(self):
        with self.assertRaises(Reject):self.chat.create('bot','spam')
        self.send()
        with self.assertRaises(Reject):self.send('again','request_000000000002')
    def test_failed_delivery_retried(self):
        original=self.chat.notify;self.chat.notify=lambda *args:(_ for _ in ()).throw(RuntimeError())
        self.send();self.assertEqual(self.sent,[])
        self.chat.notify=original;self.send();self.assertEqual(len(self.sent),2)
    def test_unknown_parent_not_routed(self):
        self.chat.reply('telegram',9,'No',parent='unknown')
        self.assertEqual(self.chat.history(**self.s)['messages'],[])
    def test_id_collision_rejected(self):
        self.send()
        with self.assertRaises(Reject):self.send('changed')

class HTTPTests(unittest.TestCase):
    def event(self,action='telegram',body=None,headers=None):
        return {'httpMethod':'POST','queryStringParameters':{'action':action},'headers':headers or {},'body':json.dumps(body or {})}
    @patch.dict(os.environ,{'TELEGRAM_TOKEN':'fake','TELEGRAM_OWNER_ID':'42','TELEGRAM_WEBHOOK_SECRET':'secret'})
    def test_webhook_secret_and_owner(self):
        self.assertEqual(index.handler(self.event(),None)['statusCode'],403)
        with patch.object(index,'get_chat') as get:
            chat=get.return_value
            e=self.event(body={'update_id':1,'message':{'from':{'id':43},'chat':{'id':43},'text':'/reply '+'a'*32+' nope'}},headers={'X-Telegram-Bot-Api-Secret-Token':'secret'})
            self.assertEqual(index.handler(e,None)['statusCode'],200);chat.reply.assert_not_called()
            e['body']=json.dumps({'update_id':1,'message':{'from':{'id':42},'chat':{'id':42},'text':'/reply '+'a'*32+' yes'}})
            index.handler(e,None);chat.reply.assert_called_once()
    @patch.dict(os.environ,{'MAX_TOKEN':'fake','MAX_OWNER_ID':'42','MAX_WEBHOOK_SECRET':'max-secret'})
    def test_max_native_reply_owner_and_dialog(self):
        body={'update_type':'message_created','message':{'sender':{'user_id':42},'recipient':{'chat_type':'dialog'},'body':{'mid':'event1','text':'Ответ'},'link':{'type':'reply','message':{'mid':'parent1'}}}}
        event=self.event('max',body,{'X-Max-Bot-Api-Secret':'max-secret'})
        with patch.object(index,'get_chat') as get:
            index.handler(event,None)
            get.return_value.reply.assert_called_once_with('max','event1','Ответ','parent1')
            get.return_value.reply.reset_mock()
            body['message']['recipient']['chat_type']='chat';event['body']=json.dumps(body)
            index.handler(event,None);get.return_value.reply.assert_not_called()
        event['headers']={}
        self.assertEqual(index.handler(event,None)['statusCode'],403)
    def test_cors_and_methods(self):
        self.assertEqual(index.handler(self.event('session'),None)['statusCode'],403)
        e=self.event('session',headers={'Origin':'https://honti-it.ru'});e['httpMethod']='OPTIONS'
        self.assertEqual(index.handler(e,None)['statusCode'],204)

class SettingsTests(unittest.TestCase):
    def test_database_config_keeps_tokens_in_environment(self):
        store=Memory();store.rows['config:operator-routing']={'max':{'OWNER_ID':'42','WEBHOOK_SECRET':'server-secret'}}
        with patch.dict(os.environ,{'YDB_ENDPOINT':'test','MAX_TOKEN':'env-token'},clear=True), patch.object(settings,'_cached',None), patch.dict('sys.modules',{'storage':types.SimpleNamespace(Store=lambda:store)}):
            self.assertEqual(settings.value('max','OWNER_ID'),'42')
            self.assertEqual(settings.value('max','WEBHOOK_SECRET'),'server-secret')
            self.assertEqual(settings.value('max','TOKEN'),'env-token')
            self.assertIsNone(settings.value('telegram','OWNER_ID'))
            self.assertEqual(index.configured(),['MAX'])
    def test_missing_or_expired_config_disables_channel(self):
        with patch.dict(os.environ,{'YDB_ENDPOINT':'test','MAX_TOKEN':'env-token'},clear=True), patch.object(settings,'_cached',None), patch.dict('sys.modules',{'storage':types.SimpleNamespace(Store=Memory)}):
            self.assertEqual(index.configured(),[])

if __name__=='__main__':unittest.main()
