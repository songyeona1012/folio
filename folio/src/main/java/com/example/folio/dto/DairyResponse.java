package com.example.folio.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.example.folio.entity.Dairy;
import com.example.folio.entity.DairyType;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.TreeMap;

/** 일기 응답 (preview는 월별 목록에서 보여줄 한 줄 미리보기) */
public record DairyResponse(
        Long id,
        LocalDate date,
        int rating,
        DairyType type,
        String content,
        Map<Integer, String> hours,
        @JsonProperty("isPrivate") boolean isPrivate,
        String preview,
        LocalDateTime updatedAt
) {
    private static final int PREVIEW_LENGTH = 40;

    public static DairyResponse from(Dairy dairy) {
        Map<Integer, String> hours = new TreeMap<>(dairy.getHours());
        return new DairyResponse(
                dairy.getId(),
                dairy.getDate(),
                dairy.getRating(),
                dairy.getType(),
                dairy.getContent(),
                hours,
                dairy.isPrivate(),
                preview(dairy.getType(), dairy.getContent(), hours),
                dairy.getUpdatedAt()
        );
    }

    private static String preview(DairyType type, String content, Map<Integer, String> hours) {
        String text;
        if (type == DairyType.TIMETABLE && !hours.isEmpty()) {
            Map.Entry<Integer, String> first = hours.entrySet().iterator().next();
            text = String.format("%02d시 %s", first.getKey(), first.getValue());
        } else if (content != null && !content.isBlank()) {
            text = content;
        } else if (!hours.isEmpty()) {
            Map.Entry<Integer, String> first = hours.entrySet().iterator().next();
            text = String.format("%02d시 %s", first.getKey(), first.getValue());
        } else {
            return "";
        }
        text = text.strip().replaceAll("\\s+", " ");
        return text.length() > PREVIEW_LENGTH ? text.substring(0, PREVIEW_LENGTH) + "…" : text;
    }
}
