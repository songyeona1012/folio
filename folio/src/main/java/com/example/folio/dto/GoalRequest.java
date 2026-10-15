package com.example.folio.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 목표 저장(생성/수정) 요청. goal.js의 buildPayload()가 보내는 JSON과 필드 이름이 같다.
 */
public record GoalRequest(
        String title,
        String formType,
        LocalDate startDate,
        LocalDate endDate,
        String goalUnit,
        String goalFrequency,
        String specialNotes,
        String goalPromise,
        String freeMemo,
        List<ProgressTable> progressTables,
        List<Note> notes,
        Long targetAmount,
        Long startAmount,
        Long depositAmount,
        String depositCycle,
        String photo,
        List<Transaction> transactions,
        String aiForm
) {

    /**
     * 진도표 한 장 (응답에서도 같은 모양을 쓴다).
     * 숫자형(NUMBER)은 total/rows/cols를 쓰고, 글자형(TEXT)은 items를 쓴다(total/rows/cols는 0).
     * 숫자형의 완료 칸은 저장하지 않고 화면이 리뷰 개수로 칠한다.
     */
    public record ProgressTable(String kind, String name, int total, int rows, int cols, List<Item> items) {
    }

    /** 글자형 진도표의 한 줄: 글 + 오른쪽 체크박스(완료) */
    public record Item(String text, boolean done) {
    }

    /** 오늘의 공부 한 줄 리뷰 한 칸 (응답에서도 같은 모양을 쓴다) */
    public record Note(LocalDate date, String text) {
    }

    /** 금전 양식의 입출금 내역 한 줄 (응답에서도 같은 모양을 쓴다). time은 "HH:mm" 또는 null, type은 IN/OUT */
    public record Transaction(LocalDate date, String time, String type, long amount) {
    }
}
