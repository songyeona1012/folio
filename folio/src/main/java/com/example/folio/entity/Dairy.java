package com.example.folio.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.TreeMap;

/**
 * 하루 한 편의 일기.
 * - 같은 날짜에 다시 저장하면 새로 만들지 않고 기존 일기를 수정합니다.
 * - 자유형(content)과 시간 기록형(hours: 0~23시 → 메모) 내용을 모두 보관해서,
 *   양식을 바꿔도 이전에 쓴 내용이 사라지지 않습니다.
 */
@Entity
@Table(name = "dairy",
        uniqueConstraints = @UniqueConstraint(name = "uk_dairy_date", columnNames = "dairy_date"))
public class Dairy {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 일기 날짜 (date는 DB 예약어라 컬럼명을 dairy_date로 둡니다) */
    @Column(name = "dairy_date", nullable = false)
    private LocalDate date;

    /** 기분 별점 0~5 (0 = 선택 안 함, 그래프 평균에서 제외) */
    @Column(nullable = false)
    private int rating;

    /** 마지막으로 선택한 양식 */
    @Enumerated(EnumType.STRING)
    @Column(name = "dairy_type", nullable = false, length = 20)
    private DairyType type;

    /** 자유형 본문 */
    @Lob
    private String content;

    /** 시간 기록형: 시(0~23) → 그 시간의 기록 */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "dairy_hour", joinColumns = @JoinColumn(name = "dairy_id"))
    @MapKeyColumn(name = "hour_of_day")
    @Column(name = "memo", length = 500)
    private Map<Integer, String> hours = new TreeMap<>();

    /** 비공개 일기: 매우 친한 친구에게도 보이지 않음 (기획서 친구 기능 기준) */
    @Column(name = "is_private", nullable = false)
    private boolean isPrivate;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected Dairy() {
        // JPA 기본 생성자
    }

    public Dairy(LocalDate date) {
        this.date = date;
        this.type = DairyType.FREEFORM;
    }

    /** 내용 전체를 새 값으로 바꿉니다. */
    public void update(int rating, DairyType type, String content,
                       Map<Integer, String> hours, boolean isPrivate) {
        this.rating = rating;
        this.type = type;
        this.content = content;
        this.hours.clear();
        if (hours != null) {
            this.hours.putAll(hours);
        }
        this.isPrivate = isPrivate;
    }

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public LocalDate getDate() { return date; }
    public int getRating() { return rating; }
    public DairyType getType() { return type; }
    public String getContent() { return content; }
    public Map<Integer, String> getHours() { return hours; }
    public boolean isPrivate() { return isPrivate; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
