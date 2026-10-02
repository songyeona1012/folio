package com.example.folio.dto;

// 프론트엔드(main.mustache의 JS) 및 AI 파싱 결과와 주고받는 형태.
// date/time을 문자열("2026-08-07", "16:40")로 다뤄서 초보 단계에서 다루기 쉽게 했습니다.
public class ScheduleDto {

    private Long id;
    private Long recurringId;
    public Long getRecurringId() { return recurringId; }
    public void setRecurringId(Long recurringId) { this.recurringId = recurringId; }
    private String title;
    private String date; // yyyy-MM-dd
    private String time; // HH:mm, 없으면 null
    private String category; // todo | important | health
    private boolean isPrivate;
    private boolean completed;

    public ScheduleDto() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDate() {
        return date;
    }

    public void setDate(String date) {
        this.date = date;
    }

    public String getTime() {
        return time;
    }

    public void setTime(String time) {
        this.time = time;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public boolean isPrivate() {
        return isPrivate;
    }

    public void setPrivate(boolean aPrivate) {
        isPrivate = aPrivate;
    }

    public boolean isCompleted() {
        return completed;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
    }
}
