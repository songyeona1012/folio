// 현재 요청의 로그인 세션에서 기록 소유자 식별자를 가져옵니다.
package com.example.folio.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.context.request.*;
import org.springframework.web.server.ResponseStatusException;

public final class OwnerContext {

    public static Long id() {
        var attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes web) {
            var session = web.getRequest().getSession(false);
            if (session != null && session.getAttribute("authorId") instanceof Long id) return id;
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }
}
