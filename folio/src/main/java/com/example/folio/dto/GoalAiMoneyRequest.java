package com.example.folio.dto;

/**
 * 금전 양식 "달성 현황"에 사용자가 고쳐 쓴 문장 중, 화면의 규칙으로 읽지 못한 것.
 * goal.js의 askMoneyAi()가 보내는 JSON과 필드 이름이 같다.
 *
 * @param text    고쳐 쓴 문장 (예: "다음 달 말까지로 늘려 줘", "매 주 월요일에 10만원씩")
 * @param current 지금 입력칸에 들어 있는 값 (비어 있으면 null)
 */
public record GoalAiMoneyRequest(String text, Current current) {

    public record Current(String startDate, String endDate, Long targetAmount, Long startAmount,
                          Long depositAmount, String depositCycle) {
    }
}
