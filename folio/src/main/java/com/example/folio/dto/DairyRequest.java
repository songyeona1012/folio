package com.example.folio.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.example.folio.entity.DairyType;

import java.time.LocalDate;
import java.util.Map;

/**
 * 일기 저장 요청 (POST /api/dairy)
 * 예)
 * {
 *   "date": "2026-10-10",
 *   "rating": 4,
 *   "type": "TIMETABLE",
 *   "content": "자유형 본문",
 *   "hours": { "9": "수업", "13": "점심" },
 *   "isPrivate": false
 * }
 */
public record DairyRequest(
        LocalDate date,
        Integer rating,
        DairyType type,
        String content,
        Map<Integer, String> hours,
        @JsonProperty("isPrivate") Boolean isPrivate
) {
}
