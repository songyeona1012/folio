package com.example.folio.dto;

import java.util.List;

/**
 * AI 자율 작성: 화면이 보내는 말. goal.js의 sendChat()이 보내는 JSON과 필드 이름이 같다.
 *
 * @param prompt  이번에 사용자가 쓴 말
 * @param history 지금까지의 대화 중 최근 몇 개 (role: user | bot)
 * @param current 지금 화면에 만들어져 있는 양식. 아직 없으면 null
 */
public record GoalAiFormRequest(String prompt, List<Message> history, Current current) {

    public record Message(String role, String text) {
    }

    /** 지금 화면에 있는 양식. 날짜는 yyyy-MM-dd 문자열이거나 null. blocks는 화면에 있는 순서 그대로. */
    public record Current(String title, String startDate, String endDate, List<GoalAiFormResponse.Block> blocks) {
    }
}
