CREATE TABLE chat_kv (
    key Utf8 NOT NULL,
    payload Utf8,
    expires Uint64,
    PRIMARY KEY (key)
) WITH (TTL = Interval('PT0S') ON expires AS SECONDS);
