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
 * '진도표 추가'로 만든 진도표 한 장. 지금은 숫자형(NUMBER)만 있다.
 * 1~total 번호를 rowCount x colCount 칸에 늘어놓는다.
 * 완료(초록) 칸은 저장하지 않고, 화면이 "오늘의 공부 한 줄 리뷰" 개수만큼 앞 번호부터 칠한다.
 */
@Entity
@Table(name = "goal_progress_tables")
public class GoalProgressTable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "goal_id")
    private Goal goal;

    /** 진도표 종류: NUMBER (글자형은 추후) */
    @Column(nullable = false, length = 20)
    private String kind;

    /** 표 이름 (비어 있을 수 있다) */
    @Column(length = 60)
    private String name;

    /** 수의 개수 (1~100) */
    @Column(nullable = false)
    private int total;

    @Column(nullable = false)
    private int rowCount;

    @Column(nullable = false)
    private int colCount;

    /** 화면에 보이는 순서 (0부터) */
    @Column(nullable = false)
    private int sortOrder;

    protected GoalProgressTable() {
    }

    GoalProgressTable(Goal goal, String kind, String name, int total, int rowCount, int colCount, int sortOrder) {
        this.goal = goal;
        this.kind = kind;
        this.name = name;
        this.total = total;
        this.rowCount = rowCount;
        this.colCount = colCount;
        this.sortOrder = sortOrder;
    }

    public Long getId() { return id; }
    public String getKind() { return kind; }
    public String getName() { return name; }
    public int getTotal() { return total; }
    public int getRowCount() { return rowCount; }
    public int getColCount() { return colCount; }
    public int getSortOrder() { return sortOrder; }
}
