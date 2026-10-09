package com.example.folio.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 목표 저장(생성/수정) 요청. goal.js의 buildPayload()가 보내는 JSON과 필드 이름이 같다.
 */
public record GoalRequest(
    String title,
    LocalDate startDate,
    LocalDate endDate,
    String goalUnit,
    String goalFrequency,
    String specialNotes,
    String goalPromise,
    String freeMemo,
    List<ProgressTable> progressTables,
    List<Note> notes
) {

    /** 진도표 한 장 (응답에서도 같은 모양을 쓴다). 완료 칸은 저장하지 않고 화면이 리뷰 개수로 칠한다. */
    public record ProgressTable(String kind, String name, int total, int rows, int cols) {
    }

    /** 오늘의 공부 한 줄 리뷰 한 칸 (응답에서도 같은 모양을 쓴다) */
    public record Note(LocalDate date, String text) {
    }
}
