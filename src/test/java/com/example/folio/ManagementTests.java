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
        reports.deleteAll();
        schedules.deleteAll();
        rules.deleteAll();
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
    void editRetainsPastAndCompletedAndDoesNotRegeneratePast() {
        var today = LocalDate.now();
        var r = recurring.save(null, input(today.minusDays(1), "DAY", 1));
        var current = calendar.getByDate(today).getFirst();
        calendar.toggleCompleted(current.getId());
        var edited = input(today.minusDays(4), "WEEK", 1);
        edited.title = "새로운 주기";
        recurring.save(r.id, edited);
        assertEquals("치과 스케일링", calendar.getByDate(today.minusDays(1)).getFirst().getTitle());
        assertTrue(calendar.getByDate(today.minusDays(4)).isEmpty());
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
        assertTrue(updated.content.contains("일기·별점 연동 전"));
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
}
