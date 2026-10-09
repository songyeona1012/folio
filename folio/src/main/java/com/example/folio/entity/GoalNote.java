package com.example.folio.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * '비고'의 한 칸 (날짜 + 기록).
 */
@Entity
@Table(name = "goal_notes")
public class GoalNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "goal_id")
    private Goal goal;

    private LocalDate noteDate;

    @Column(nullable = false, length = 1000)
    private String content;

    /** 화면에 보이는 순서 (0부터) */
    @Column(nullable = false)
    private int sortOrder;

    protected GoalNote() {
    }

    GoalNote(Goal goal, LocalDate noteDate, String content, int sortOrder) {
        this.goal = goal;
        this.noteDate = noteDate;
        this.content = content;
        this.sortOrder = sortOrder;
    }

    public Long getId() { return id; }
    public LocalDate getNoteDate() { return noteDate; }
    public String getContent() { return content; }
    public int getSortOrder() { return sortOrder; }
}
