package com.example.folio.dto;

import java.util.List;

/**
 * 연도별 기록 요약 (왼쪽 페이지: 기분 그래프 + 월별 폴더)
 *
 * @param year        조회한 연도
 * @param shownMonths 그래프에 보여줄 달 수 (올해면 이번 달까지, 지난해면 12, 미래면 0)
 * @param months      기분 그래프용: 1월부터 shownMonths까지의 월별 요약
 * @param folders     일기를 한 편 이상 쓴 달만 (월 오름차순)
 */
public record DairyYearSummary(int year, int shownMonths, List<Month> months, List<Month> folders) {

    /**
     * @param month         1~12
     * @param count         그 달에 쓴 일기 수
     * @param averageRating 별점 평균 (별점을 준 일기가 없으면 null)
     */
    public record Month(int month, int count, Double averageRating) {
    }
}
