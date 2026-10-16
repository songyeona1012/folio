// 금전 목표의 입출금 기록을 저장합니다.
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
 * 금전 양식의 입출금 내역 한 줄 (일자 + 시간 + 입금/출금 + 금액).
 * 화면이 일자·시간 순서로 정렬해서 보내므로 sortOrder에는 그 순서를 그대로 저장한다.
 */
@Entity
@Table(name = "goal_transactions")
public class GoalTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "goal_id")
    private Goal goal;

    private LocalDate txDate;

    /** "HH:mm" 또는 null (시간을 적지 않은 경우) */
    @Column(length = 5)
    private String txTime;

    /** IN(입금) 또는 OUT(출금) */
    @Column(nullable = false, length = 3)
    private String txType;

    @Column(nullable = false)
    private long amount;

    @Column(nullable = false)
    private int sortOrder;

    protected GoalTransaction() {}

    GoalTransaction(Goal goal, LocalDate txDate, String txTime, String txType, long amount, int sortOrder) {
        this.goal = goal;
        this.txDate = txDate;
        this.txTime = txTime;
        this.txType = txType;
        this.amount = amount;
        this.sortOrder = sortOrder;
    }

    public Long getId() {
        return id;
    }

    public LocalDate getTxDate() {
        return txDate;
    }

    public String getTxTime() {
        return txTime;
    }

    public String getTxType() {
        return txType;
    }

    public long getAmount() {
        return amount;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}
