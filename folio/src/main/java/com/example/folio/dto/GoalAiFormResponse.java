// AI가 만든 목표 양식을 화면으로 전달합니다.
package com.example.folio.dto;

import java.util.List;

/**
 * AI 자율 작성: 화면에 내려 주는 양식. goal.js의 applyAiResult()가 읽는 모양이다.
 *
 * 양식은 정해진 틀이 아니라 "블록"을 골라 쌓아서 만든다. 목표에 맞는 블록을 AI가 고르고 순서도 정한다.
 *
 * @param reply     말풍선에 보여 줄 한두 문장
 * @param title     목표명 (화면의 목표명이 비어 있을 때만 채워진다)
 * @param startDate yyyy-MM-dd 또는 null
 * @param endDate   yyyy-MM-dd 또는 null
 * @param source    AI(인공지능이 만듦) 또는 BASIC(기본 규칙으로 만듦)
 * @param blocks    양식을 이루는 블록들 (위에서부터 차례로)
 */
public record GoalAiFormResponse(
    String reply,
    String title,
    String startDate,
    String endDate,
    String source,
    List<Block> blocks
) {
    public static final String TABLE = "table"; // 항목 표: 이름 | 내용
    public static final String CHECKLIST = "checklist"; // 체크리스트: 순서 있는 할 일
    public static final String TRACKER = "tracker"; // 습관표: 줄(습관) × 칸(요일·주차) 체크
    public static final String PROGRESS = "progress"; // 진행도: 시작값 → 현재값 → 목표값 막대
    public static final String LOG = "log"; // 기록표: 날짜별로 한 줄씩 쌓는 표
    public static final String NOTE = "note"; // 메모: 짧은 글

    /**
     * 블록 한 개. type에 따라 쓰는 칸이 다르고, 쓰지 않는 칸은 null이다.
     *
     * table     : rows
     * checklist : items
     * tracker   : columns(칸 이름) + tracks(줄 이름과 칸마다 체크 여부)
     * progress  : unit, start, target, current
     * log       : columns(열 이름) + entries(줄마다 열 수만큼의 글)
     * note      : text
     */
    public record Block(
        String type,
        String title,
        List<Field> rows,
        List<Item> items,
        List<String> columns,
        List<Track> tracks,
        List<List<String>> entries,
        String unit,
        Double start,
        Double target,
        Double current,
        String text
    ) {
        public static Block table(String title, List<Field> rows) {
            return new Block(TABLE, title, rows, null, null, null, null, null, null, null, null, null);
        }

        public static Block checklist(String title, List<Item> items) {
            return new Block(CHECKLIST, title, null, items, null, null, null, null, null, null, null, null);
        }

        public static Block tracker(String title, List<String> columns, List<Track> tracks) {
            return new Block(TRACKER, title, null, null, columns, tracks, null, null, null, null, null, null);
        }

        public static Block progress(String title, String unit, Double start, Double target, Double current) {
            return new Block(
                PROGRESS,
                title,
                null,
                null,
                null,
                null,
                null,
                unit,
                start,
                target,
                current,
                null
            );
        }

        public static Block log(String title, List<String> columns, List<List<String>> entries) {
            return new Block(LOG, title, null, null, columns, null, entries, null, null, null, null, null);
        }

        public static Block note(String title, String text) {
            return new Block(NOTE, title, null, null, null, null, null, null, null, null, null, text);
        }
    }

    /** 표의 한 줄: 이름 + 내용 */
    public record Field(String label, String value) {}

    /** 체크리스트 한 줄 */
    public record Item(String text, boolean done) {}

    /** 습관표 한 줄: 이름 + 칸마다 체크 여부 */
    public record Track(String label, List<Boolean> checks) {}
}
