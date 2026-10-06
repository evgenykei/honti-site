"""Server-only operator routing. Secrets are never returned to website clients."""
import os
_cached = None

def value(channel, field):
    global _cached
    direct = os.environ.get(channel.upper()+'_'+field)
    if direct:return direct
    if field=='TOKEN' or not os.environ.get('YDB_ENDPOINT'):return None
    if _cached is None:
        from storage import Store
        _cached=Store().get('config:operator-routing') or {}
    return (_cached.get(channel.lower()) or {}).get(field)
