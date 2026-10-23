#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""身分認證：Bearer Token 工作階段（單一登入的 MVP 雛形）。"""
import secrets
import threading
import time

TOKEN_TTL_SECONDS = 12 * 60 * 60  # 12 小時


class AuthManager:
    def __init__(self):
        self._tokens = {}        # token -> (user_id, expires_epoch)
        self._lock = threading.Lock()

    def issue(self, user_id):
        token = secrets.token_urlsafe(32)
        expires = time.time() + TOKEN_TTL_SECONDS
        with self._lock:
            self._tokens[token] = (user_id, expires)
        return token

    def resolve(self, token):
        if not token:
            return None
        with self._lock:
            item = self._tokens.get(token)
            if item is None:
                return None
            user_id, expires = item
            if time.time() > expires:
                del self._tokens[token]
                return None
            return user_id

    def revoke(self, token):
        with self._lock:
            self._tokens.pop(token, None)