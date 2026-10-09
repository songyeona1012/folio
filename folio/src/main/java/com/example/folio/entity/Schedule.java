package com.example.folio.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalTime;

// Spring Boot 2.x를 쓰신다면 위 import 3개를
// javax.persistence.* 로 바꿔주세요.

@Entity
@Table(name = "schedule", uniqueConstraints = @UniqueConstraint(columnNames = { "recurring_id", "date" }))
public class Schedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recurring_id")
    private Long recurringId;

    private boolean cancelled;

    public Long getRecurringId() {
        return recurringId;
    }

    public void setRecurringId(Long value) {
        recurringId = value;
    }

    public boolean isCancelled() {
        return cancelled;
    }

    public void setCancelled(boolean value) {
        cancelled = value;
    }

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private LocalDate date;

    private LocalTime time; // 시간 없이 등록할 수도 있어서 null 허용

    @Column(nullable = false)
    private String category; // "todo" | "important" | "health"

    @Column(name = "is_private", nullable = false)
    private boolean isPrivate;

    @Column(name = "is_completed", nullable = false)
    private boolean completed;

    protected Schedule() {
        // JPA가 프록시 만들 때 쓰는 기본 생성자. 직접 호출하지 마세요.
    }

    public Schedule(String title, LocalDate date, LocalTime time, String category, boolean isPrivate) {
        this.title = title;
        this.date = date;
        this.time = time;
        this.category = category;
        this.isPrivate = isPrivate;
        this.completed = false;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public LocalTime getTime() {
        return time;
    }

    public void setTime(LocalTime time) {
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
