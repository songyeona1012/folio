// 기분 그래프에서 사용하는 날짜별 별점을 전달합니다.
package com.example.folio.dto;

import java.time.LocalDate;

/** 연간 요약 계산용 (날짜 + 별점만) */
public record DairyRatingRow(LocalDate date, int rating) {}
