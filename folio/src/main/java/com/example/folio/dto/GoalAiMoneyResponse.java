// 금전 목표 AI 분석 결과를 전달합니다.
package com.example.folio.dto;

/**
 * 문장에서 읽어 낸 "바꿀 값". 바꾸라고 하지 않은 값은 null이다.
 * 금액은 원 단위 정수, 날짜는 yyyy-MM-dd.
 *
 * @param message 어떻게 읽었는지 한 줄 (화면의 안내 말에 그대로 보인다)
 */
public record GoalAiMoneyResponse(
    String message,
    String endDate,
    Long targetAmount,
    Long startAmount,
    Long depositAmount,
    String depositCycle
) {}
