// 관리 카테고리의 시작일과 반복 주기 규칙을 저장합니다.
package com.example.folio.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
public class RecurringRule extends OwnedRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public String title;

    @Column(nullable = false)
    public String category;

    @Column(nullable = false)
    public LocalDate startDate;

    public LocalDate effectiveFrom;
    public int intervalValue;

    @Column(nullable = false)
    public String intervalUnit;

    public LocalDate occurrence(long index) {
        long amount = index * intervalValue;
        return switch (intervalUnit) {
            case "DAY" -> startDate.plusDays(amount);
            case "WEEK" -> startDate.plusWeeks(amount);
            case "MONTH" -> startDate.plusMonths(amount);
            case "YEAR" -> startDate.plusYears(amount);
            default -> throw new IllegalArgumentException("잘못된 반복 단위입니다.");
        };
    }
}
