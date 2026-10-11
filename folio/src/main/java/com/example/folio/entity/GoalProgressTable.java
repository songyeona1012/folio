package com.example.folio.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;

import java.util.ArrayList;
import java.util.List;

/**
 * '진도표 추가'로 만든 진도표 한 장.
 * <ul>
 *   <li>NUMBER(숫자형): 1~total 번호를 rowCount x colCount 칸에 늘어놓는다.
 *       완료(초록) 칸은 저장하지 않고, 화면이 "오늘의 공부 한 줄 리뷰" 개수만큼 앞 번호부터 칠한다.</li>
 *   <li>TEXT(글자형): 직접 쓴 한 줄들(items)과 각 줄의 완료 체크. total/rowCount/colCount는 0.</li>
 * </ul>
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

    /** 진도표 종류: NUMBER(숫자형) 또는 TEXT(글자형) */
    @Column(nullable = false, length = 20)
    private String kind;

    /** 표 이름 (숫자형은 비어 있을 수 있고, 글자형은 만들 때 꼭 쓴다) */
    @Column(length = 60)
    private String name;

    /** 수의 개수 (숫자형 1~100, 글자형 0) */
    @Column(nullable = false)
    private int total;

    @Column(nullable = false)
    private int rowCount;

    @Column(nullable = false)
    private int colCount;

    /** 화면에 보이는 순서 (0부터) */
    @Column(nullable = false)
    private int sortOrder;

    /** 글자형의 한 줄들 (화면에 보이는 순서대로) */
    @OneToMany(mappedBy = "progressTable", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @BatchSize(size = 50)
    private List<GoalProgressItem> items = new ArrayList<>();

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

    /** 글자형에 한 줄을 맨 뒤에 붙인다. */
    public void addItem(String content, boolean done) {
        items.add(new GoalProgressItem(this, content, done, items.size()));
    }

    public Long getId() { return id; }
    public String getKind() { return kind; }
    public String getName() { return name; }
    public int getTotal() { return total; }
    public int getRowCount() { return rowCount; }
    public int getColCount() { return colCount; }
    public int getSortOrder() { return sortOrder; }
    public List<GoalProgressItem> getItems() { return items; }
}
