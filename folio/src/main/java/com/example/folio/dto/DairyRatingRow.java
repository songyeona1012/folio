package com.example.folio.dto;

import java.time.LocalDate;

/** 연간 요약 계산용 (날짜 + 별점만) */
public record DairyRatingRow(LocalDate date, int rating) {
}
