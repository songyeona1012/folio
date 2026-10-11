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

/**
 * 글자형 진도표(예: 목차)의 한 줄. 직접 쓴 글 + 완료(체크) 여부.
 */
@Entity
@Table(name = "goal_progress_items")
public class GoalProgressItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "progress_table_id")
    private GoalProgressTable progressTable;

    /** 한 줄 내용 (아직 안 썼으면 빈 문자열) */
    @Column(nullable = false, length = 100)
    private String content;

    /** 오른쪽 체크박스: 이 줄을 끝냈는가 */
    @Column(name = "is_done", nullable = false)
    private boolean done;

    /** 화면에 보이는 순서 (0부터) */
    @Column(nullable = false)
    private int sortOrder;

    protected GoalProgressItem() {
    }

    GoalProgressItem(GoalProgressTable progressTable, String content, boolean done, int sortOrder) {
        this.progressTable = progressTable;
        this.content = content;
        this.done = done;
        this.sortOrder = sortOrder;
    }

    public Long getId() { return id; }
    public String getContent() { return content; }
    public boolean isDone() { return done; }
    public int getSortOrder() { return sortOrder; }
}
