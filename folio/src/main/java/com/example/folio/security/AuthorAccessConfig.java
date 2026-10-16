// 로그인이 필요한 화면·API 접근을 확인하고 사용자 세션을 관리합니다.
package com.example.folio.security;

import com.example.folio.repository.AuthorAccountRepository;
import jakarta.servlet.http.*;
import java.time.LocalDateTime;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.*;
import org.springframework.web.servlet.config.annotation.*;

@Component
public class AuthorAccessConfig implements WebMvcConfigurer {

    private final AuthorAccountRepository accounts;

    public AuthorAccessConfig(AuthorAccountRepository accounts) {
        this.accounts = accounts;
    }

    public void addInterceptors(InterceptorRegistry registry) {
        registry
            .addInterceptor(
                new HandlerInterceptor() {
                    public boolean preHandle(
                        HttpServletRequest request,
                        HttpServletResponse response,
                        Object handler
                    ) throws Exception {
                        var session = request.getSession(false);
                        if (
                            session != null &&
                            session.getAttribute("authorId") instanceof Long id &&
                            accounts.existsById(id)
                        ) return true;
                        if (request.getRequestURI().startsWith("/api/")) {
                            response.setStatus(401);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"message\":\"로그인이 필요합니다.\"}");
                        } else response.sendRedirect("/login");
                        return false;
                    }

                    public void afterCompletion(
                        HttpServletRequest request,
                        HttpServletResponse response,
                        Object handler,
                        Exception error
                    ) {
                        if (
                            error == null &&
                            response.getStatus() < 400 &&
                            !request.getRequestURI().equals("/api/auth/verify-password") &&
                            Set.of("POST", "PUT", "PATCH", "DELETE").contains(request.getMethod())
                        ) {
                            var session = request.getSession(false);
                            if (
                                session != null && session.getAttribute("authorId") instanceof Long id
                            ) accounts.findById(id).ifPresent(a -> {
                                a.lastModifiedAt = LocalDateTime.now();
                                accounts.save(a);
                            });
                        }
                    }
                }
            )
            .addPathPatterns("/**")
            .excludePathPatterns(
                "/",
                "/login",
                "/error",
                "/api/auth/signup",
                "/api/auth/login",
                "/css/**",
                "/js/**",
                "/img/**",
                "/favicon.ico"
            );
    }
}
