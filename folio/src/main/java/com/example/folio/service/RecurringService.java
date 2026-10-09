package com.example.folio.service;

import com.example.folio.entity.*;
import com.example.folio.repository.*;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RecurringService {

    private final org.springframework.transaction.support.TransactionTemplate tx;
    private final RecurringRuleRepository rules;
    private final ScheduleRepository schedules;

    public RecurringService(
        RecurringRuleRepository rules,
        ScheduleRepository schedules,
        org.springframework.transaction.PlatformTransactionManager manager
    ) {
        this.tx = new org.springframework.transaction.support.TransactionTemplate(manager);
        this.rules = rules;
        this.schedules = schedules;
    }

    public record RuleView(
        Long id,
        String title,
        String category,
        LocalDate startDate,
        int intervalValue,
        String intervalUnit,
        LocalDate nextDate,
        double cycleDays,
        Integer completionRate
    ) {}

    public List<RuleView> list() {
        Map<Long, Integer> completion = new HashMap<>();
        schedules.summarizeCompletion(LocalDate.now()).forEach(summary ->
            completion.put(summary.getRuleId(), (int) Math.round(100.0 * summary.getDone() / summary.getTotal()))
        );
        return rules
            .findAll()
            .stream()
            .map(r ->
                new RuleView(
                    r.id,
                    r.title,
                    r.category,
                    r.startDate,
                    r.intervalValue,
                    r.intervalUnit,
                    next(r, LocalDate.now()),
                    cycle(r),
                    completion.get(r.id)
                )
            )
            .sorted(Comparator.comparingDouble(RuleView::cycleDays).thenComparing(RuleView::nextDate))
            .toList();
    }

    private double cycle(RecurringRule r) {
        return (
            r.intervalValue *
            switch (r.intervalUnit) {
                case "WEEK" -> 7;
                case "MONTH" -> 30.4375;
                case "YEAR" -> 365.25;
                default -> 1;
            }
        );
    }

    public static LocalDate next(RecurringRule r, LocalDate from) {
        for (long i = 0; i < 75000; i++) {
            LocalDate d = r.occurrence(i);
            if (!d.isBefore(from)) return d;
        }
        throw new IllegalArgumentException("반복 범위를 벗어났습니다.");
    }

    private void validate(RecurringRule r) {
        if (
            r.title == null ||
            r.title.isBlank() ||
            r.title.length() > 100 ||
            r.startDate == null ||
            r.startDate.getYear() < 2000 ||
            r.startDate.getYear() > 2100 ||
            !Set.of("health", "subscription", "relationship", "daily").contains(
                Objects.toString(r.category, "")
            ) ||
            !Set.of("DAY", "WEEK", "MONTH", "YEAR").contains(Objects.toString(r.intervalUnit, "")) ||
            r.intervalValue < 1 ||
            r.intervalValue > 365
        ) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "제목, 시작일(2000~2100), 카테고리와 주기(1~365)를 확인해주세요."
        );
    }

    public synchronized RecurringRule save(Long id, RecurringRule input) {
        return tx.execute(status -> {
            validate(input);
            RecurringRule r =
                id == null
                    ? new RecurringRule()
                    : rules.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            if (id != null) schedules.deleteAll(
                schedules
                    .findByRecurringIdAndDateGreaterThanEqual(id, LocalDate.now())
                    .stream()
                    .filter(s -> !s.isCompleted())
                    .toList()
            );
            schedules.flush();
            r.title = input.title.trim();
            r.category = input.category;
            r.startDate = input.startDate;
            r.intervalValue = input.intervalValue;
            r.intervalUnit = input.intervalUnit;
            r.effectiveFrom = id == null ? r.startDate : LocalDate.now();
            rules.saveAndFlush(r);
            materialize(r, id == null ? r.startDate : LocalDate.now(), LocalDate.now().plusYears(1));
            return r;
        });
    }

    public synchronized void delete(Long id) {
        tx.executeWithoutResult(status -> {
            if (!rules.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            schedules.deleteAll(
                schedules
                    .findByRecurringIdAndDateGreaterThanEqual(id, LocalDate.now())
                    .stream()
                    .filter(s -> !s.isCompleted())
                    .toList()
            );
            rules.deleteById(id);
        });
    }

    public synchronized void ensure(LocalDate start, LocalDate end) {
        if (
            start.getYear() < 2000 ||
            end.getYear() > 2101 ||
            end.isBefore(start) ||
            start.plusYears(1).isBefore(end)
        ) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "한 번에 1년 이내의 기간을 조회해주세요."
        );
        tx.executeWithoutResult(status -> rules.findAll().forEach(r -> materialize(r, start, end)));
    }

    private void materialize(RecurringRule r, LocalDate start, LocalDate end) {
        for (long i = 0; i < 75000; i++) {
            LocalDate date = r.occurrence(i);
            if (date.isAfter(end)) break;
            if (
                (r.effectiveFrom != null && date.isBefore(r.effectiveFrom)) ||
                date.isBefore(start) ||
                schedules.existsByRecurringIdAndDate(r.id, date)
            ) continue;
            Schedule s = new Schedule(
                r.title,
                date,
                null,
                r.category.equals("health") ? "health" : "todo",
                false
            );
            s.setRecurringId(r.id);
            schedules.save(s);
        }
    }
}
