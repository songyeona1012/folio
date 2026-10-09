package com.example.folio.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 목표 한 건. 표(기간/진행 단위/학습 빈도/특이 사항/다짐), 진도표, 오늘의 공부 한 줄 리뷰를 함께 가진다.
 */
@Entity
@Table(name = "goals")
public class Goal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String title;

    private LocalDate startDate;

    private LocalDate endDate;

    /** 진행 단위 */
    @Column(length = 50)
    private String goalUnit;

    /** 학습 빈도 */
    @Column(length = 255)
    private String goalFrequency;

    /** 특이 사항 */
    @Column(length = 255)
    private String specialNotes;

    /** 다짐 */
    @Column(length = 255)
    private String goalPromise;

    /** AI 자율 작성 화면의 자유 메모 */
    @Lob
    private String freeMemo;

    /**
     * 목록 카드 색: YELLOW 또는 PINK. 만들 때 완전 무작위로 정해져서(번갈아 나오지 않는다)
     * 같은 색이 연달아 나올 수도 있다. 이 기능 이전에 만든 목표는 null.
     */
    @Column(length = 10)
    private String cardColor;

    @OneToMany(mappedBy = "goal", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @BatchSize(size = 50)
    private List<GoalProgressTable> progressTables = new ArrayList<>();

    @OneToMany(mappedBy = "goal", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @BatchSize(size = 50)
    private List<GoalNote> notes = new ArrayList<>();

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public Goal() {
    }

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.cardColor == null) {
            this.cardColor = ThreadLocalRandom.current().nextBoolean() ? "YELLOW" : "PINK";
        }
    }

    /** 표에 적는 기본 정보를 한 번에 바꾼다. 수정 시각도 함께 갱신한다. */
    public void change(String title, LocalDate startDate, LocalDate endDate, String goalUnit,
                       String goalFrequency, String specialNotes, String goalPromise, String freeMemo) {
        this.title = title;
        this.startDate = startDate;
        this.endDate = endDate;
        this.goalUnit = goalUnit;
        this.goalFrequency = goalFrequency;
        this.specialNotes = specialNotes;
        this.goalPromise = goalPromise;
        this.freeMemo = freeMemo;
        this.updatedAt = LocalDateTime.now();
    }

    public void clearProgressTables() {
        progressTables.clear();
    }

    public void addProgressTable(String kind, String name, int total, int rows, int cols) {
        progressTables.add(new GoalProgressTable(this, kind, name, total, rows, cols, progressTables.size()));
    }

    public void clearNotes() {
        notes.clear();
    }

    public void addNote(LocalDate noteDate, String content) {
        notes.add(new GoalNote(this, noteDate, content, notes.size()));
    }

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public LocalDate getStartDate() { return startDate; }
    public LocalDate getEndDate() { return endDate; }
    public String getGoalUnit() { return goalUnit; }
    public String getGoalFrequency() { return goalFrequency; }
    public String getSpecialNotes() { return specialNotes; }
    public String getGoalPromise() { return goalPromise; }
    public String getFreeMemo() { return freeMemo; }
    public String getCardColor() { return cardColor; }
    public List<GoalProgressTable> getProgressTables() { return progressTables; }
    public List<GoalNote> getNotes() { return notes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
