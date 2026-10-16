// 주기 일정 생성과 관리 분석 결과를 검증합니다.
package com.example.folio;

import static org.junit.jupiter.api.Assertions.*;

import com.example.folio.entity.*;
import com.example.folio.repository.*;
import com.example.folio.service.*;
import java.time.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(
    properties = {
        "spring.datasource.url=jdbc:h2:mem:management-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "gemini.api.key=",
        "openai.api.key=",
    }
)
class ManagementTests {

    @Autowired
    RecurringService recurring;

    @Autowired
    ScheduleService calendar;

    @Autowired
    ScheduleRepository schedules;

    @Autowired
    RecurringRuleRepository rules;

    @Autowired
    ManagementReportRepository reports;

    @Autowired
    ManagementAnalytics analytics;

    @BeforeEach
    void clear() {
        var request = new org.springframework.mock.web.MockHttpServletRequest();
        request.getSession().setAttribute("authorId", 1L);
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(
            new org.springframework.web.context.request.ServletRequestAttributes(request)
        );
        reports.deleteAll();
        schedules.deleteAll();
        rules.deleteAll();
    }

    @AfterEach
    void clearRequestContext() {
        org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();
    }

    RecurringRule input(LocalDate start, String unit, int interval) {
        var r = new RecurringRule();
        r.title = "치과 스케일링";
        r.category = "health";
        r.startDate = start;
        r.intervalUnit = unit;
        r.intervalValue = interval;
        return r;
    }

    @Test
    void monthEndUsesOriginalAnchor() {
        var r = input(LocalDate.of(2028, 1, 31), "MONTH", 1);
        assertEquals(LocalDate.of(2028, 2, 29), r.occurrence(1));
        assertEquals(LocalDate.of(2028, 3, 31), r.occurrence(2));
    }

    @Test
    void leapYearReturnsToLeapDay() {
        var r = input(LocalDate.of(2024, 2, 29), "YEAR", 1);
        assertEquals(LocalDate.of(2025, 2, 28), r.occurrence(1));
        assertEquals(LocalDate.of(2028, 2, 29), r.occurrence(4));
    }

    @Test
    void repeatQueriesDoNotDuplicateAndDeletedOccurrenceStaysDeleted() {
        var d = LocalDate.now();
        var rule = recurring.save(null, input(d, "MONTH", 1));
        assertEquals(1, calendar.getByDate(d).size());
        long count = schedules.count();
        calendar.getByDate(d);
        assertEquals(count, schedules.count());
        calendar.delete(calendar.getByDate(d).getFirst().getId());
        assertTrue(calendar.getByDate(d).isEmpty());
        assertTrue(schedules.existsByRecurringIdAndDate(rule.id, d));
    }

    @Test
    void editRetainsCompletedAndBackfillsEarlierStartDate() {
        var today = LocalDate.now();
        var r = recurring.save(null, input(today.minusDays(1), "DAY", 1));
        var current = calendar.getByDate(today).getFirst();
        calendar.toggleCompleted(current.getId());
        var edited = input(today.minusDays(4), "WEEK", 1);
        edited.title = "새로운 주기";
        recurring.save(r.id, edited);
        assertEquals("치과 스케일링", calendar.getByDate(today.minusDays(1)).getFirst().getTitle());
        assertEquals("새로운 주기", calendar.getByDate(today.minusDays(4)).getFirst().getTitle());
        assertEquals(1, calendar.getByDate(today.minusDays(4)).size());
        assertTrue(calendar.getByDate(today).getFirst().isCompleted());
    }

    @Test
    void deleteRuleKeepsHistoryButRemovesFuture() {
        var today = LocalDate.now();
        var r = recurring.save(null, input(today.minusDays(1), "DAY", 1));
        recurring.delete(r.id);
        assertEquals(1, calendar.getByDate(today.minusDays(1)).size());
        assertTrue(calendar.getByDate(today.plusDays(1)).isEmpty());
    }

    @Test
    void invalidRecurrenceDoesNotWrite() {
        assertThrows(ResponseStatusException.class, () ->
            recurring.save(null, input(LocalDate.now(), "DAY", 0))
        );
        assertEquals(0, rules.count());
    }

    @Test
    void pressureDistinguishesMissingDataFromCalm() {
        assertNull(ManagementAnalytics.score(0, null, 0, 0, false));
        assertEquals(100.0, ManagementAnalytics.score(6, null, 0, 0, false));
        assertEquals(40.0, ManagementAnalytics.score(6, 5, 1, 0, true));
        assertEquals(100.0, ManagementAnalytics.score(6, 1, 0, 1, true));
    }

    @Test
    void emptyAnalyticsDoesNotInventDiaryOrScore() {
        var s = analytics.summary("week", LocalDate.now());
        assertNull(s.average());
        assertEquals(0, s.diaryCount());
        assertNull(s.completionRate());
        assertEquals(7, s.points().size());
        assertEquals(12, analytics.summary("year", LocalDate.now()).points().size());
    }

    @Test
    void reportCacheRefreshesWhenSchedulesChange() {
        var date = LocalDate.now();
        var first = analytics.report("month", date, false);
        String initial = first.fingerprint;
        recurring.save(null, input(date, "MONTH", 1));
        var updated = analytics.report("month", date, false);
        assertNotEquals(initial, updated.fingerprint);
        assertEquals("BASIC", updated.source);
        String at = updated.generatedAt;
        assertEquals(at, analytics.report("month", date, false).generatedAt);
        assertTrue(updated.content.contains("관리 일정 완료 기록"));
        assertTrue(updated.content.contains("월별 변화"));
        assertFalse(updated.content.contains("압박감"));
    }

    @Test
    void calendarMutationImmediatelyChangesGraph() {
        var day = LocalDate.now();
        var r = recurring.save(null, input(day, "MONTH", 1));
        assertEquals(1, analytics.summary("week", day).scheduleCount());
        calendar.toggleCompleted(calendar.getByDate(day).getFirst().getId());
        assertEquals(100, analytics.summary("week", day).completionRate());
        recurring.delete(r.id);
        assertEquals(1, analytics.summary("week", day).scheduleCount());
    }

    @Test
    void lifetimeCompletionExcludesFutureAndCancelledOccurrences() {
        var day = LocalDate.now();
        var rule = recurring.save(null, input(day.minusDays(2), "DAY", 1));
        var first = schedules.findByDate(day.minusDays(2)).getFirst();
        first.setCompleted(true);
        schedules.save(first);
        var cancelled = schedules.findByDate(day.minusDays(1)).getFirst();
        cancelled.setCancelled(true);
        schedules.save(cancelled);
        assertEquals(
            50,
            recurring
                .list()
                .stream()
                .filter(r -> r.id().equals(rule.id))
                .findFirst()
                .orElseThrow()
                .completionRate()
        );
        var future = recurring.save(null, input(day.plusDays(5), "MONTH", 1));
        assertNull(
            recurring
                .list()
                .stream()
                .filter(r -> r.id().equals(future.id))
                .findFirst()
                .orElseThrow()
                .completionRate()
        );
    }

    @Test
    void categoryChartUsesCumulativeHistoryAndExcludesFutureAndCancelled() {
        var today = LocalDate.now();
        var past = recurring.save(null, input(today.minusDays(10), "MONTH", 1));
        var completed = schedules.findByDate(today.minusDays(10)).getFirst();
        completed.setCompleted(true);
        schedules.save(completed);
        recurring.save(null, input(today, "MONTH", 1));
        var cancelledRule = recurring.save(null, input(today.minusDays(2), "MONTH", 1));
        var cancelled = schedules.findByDate(today.minusDays(2)).getFirst();
        cancelled.setCancelled(true);
        schedules.save(cancelled);
        var chart = analytics.completionChart("month", today);
        var point = chart
            .points()
            .stream()
            .filter(p -> p.date().equals(today.withDayOfMonth(1).toString()))
            .findFirst()
            .orElseThrow();
        assertEquals(50, point.rates().get("health"));
        assertNull(point.rates().get("subscription"));
        assertEquals(2, chart.scheduleCount());
        assertEquals(1, chart.completedCount());
        chart
            .points()
            .stream()
            .filter(p -> p.forecast())
            .forEach(p -> assertTrue(p.rates().values().stream().allMatch(java.util.Objects::isNull)));
        assertEquals(today.getMonthValue(), chart.points().size());
        assertEquals(today.withDayOfYear(1).toString(), chart.start());
        assertEquals(today.toString(), chart.end());
        var yearly = analytics.completionChart("year", today);
        assertEquals(today.getYear() - today.minusDays(10).getYear() + 1, yearly.points().size());
        assertEquals(today.minusDays(10).withDayOfYear(1).toString(), yearly.start());
        assertEquals(today.toString(), yearly.end());
        assertEquals(50, yearly.points().getLast().rates().get("health"));
    }

    @Test
    void completionBriefingUsesOnlyDueManagementAndOffersEncouragement() {
        var day = LocalDate.now();
        recurring.save(null, input(day, "MONTH", 1));
        recurring.save(null, input(day.plusDays(1), "MONTH", 1));
        var event = schedules.findByDate(day).getFirst();
        event.setCompleted(true);
        schedules.save(event);
        schedules.save(new Schedule("일반 일정", day, null, "health", false));
        var briefing = analytics.completionBriefing("week", day);
        assertEquals(1, briefing.total());
        assertEquals(1, briefing.completed());
        assertEquals(100, briefing.rate());
        assertTrue(briefing.briefing().contains("좋은 흐름"));
        assertTrue(briefing.facts().contains("월별 변화"));
        assertFalse(briefing.facts().contains("압박감"));
        var report = analytics.report("week", day, false);
        assertEquals(briefing.briefing(), report.briefing);
    }

    @Test
    void noDueManagementDoesNotInventPoorPerformance() {
        var day = LocalDate.now();
        recurring.save(null, input(day.plusDays(1), "MONTH", 1));
        var briefing = analytics.completionBriefing("week", day);
        assertNull(briefing.rate());
        assertEquals(0, briefing.total());
        assertTrue(briefing.briefing().contains("평가할 수 없어요"));
    }
}
