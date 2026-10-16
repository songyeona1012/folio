// 목표 AI 요청 중 발생한 오류를 구분해 전달합니다.
package com.example.folio.service;

import org.springframework.http.HttpStatus;

/** 목표 화면의 AI 기능이 요청을 처리하지 못했을 때. 상태 코드와 화면에 보일 문구를 함께 가진다. */
public class GoalAiException extends RuntimeException {

    private final HttpStatus status;

    public GoalAiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
