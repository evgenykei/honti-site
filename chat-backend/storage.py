"""YDB key/value storage; each read-modify-write is a serializable transaction."""
import json
import os
import time
import ydb

class Store:
    def __init__(self):
        self.driver=ydb.Driver(endpoint=os.environ['YDB_ENDPOINT'], database=os.environ['YDB_DATABASE'], credentials=ydb.iam.MetadataUrlCredentials())
        self.driver.wait(timeout=8,fail_fast=True)
        self.pool=ydb.SessionPool(self.driver)

    def get(self,key):
        def read(session):
            rows=session.transaction(ydb.SerializableReadWrite()).execute(
                session.prepare('DECLARE $key AS Utf8; SELECT payload, expires FROM chat_kv WHERE key=$key;'),
                {'$key':key},commit_tx=True)[0].rows
            if not rows or rows[0].expires<=int(time.time()):return None
            return json.loads(rows[0].payload)
        return self.pool.retry_operation_sync(read)

    def mutate(self,key,expires,fn):
        def update(session):
            tx=session.transaction(ydb.SerializableReadWrite())
            rows=tx.execute(session.prepare('DECLARE $key AS Utf8; SELECT payload, expires FROM chat_kv WHERE key=$key;'),{'$key':key})[0].rows
            old=json.loads(rows[0].payload) if rows and rows[0].expires>int(time.time()) else None
            try:
                new,result=fn(old)
                if new is None:
                    tx.commit();return result
                tx.execute(session.prepare('DECLARE $key AS Utf8; DECLARE $payload AS Utf8; DECLARE $expires AS Uint64; UPSERT INTO chat_kv (key,payload,expires) VALUES ($key,$payload,$expires);'),
                           {'$key':key,'$payload':json.dumps(new,ensure_ascii=False),'$expires':expires},commit_tx=True)
                return result
            except Exception:
                tx.rollback();raise
        return self.pool.retry_operation_sync(update)
